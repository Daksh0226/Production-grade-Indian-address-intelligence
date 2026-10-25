import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { PrismaClient, PlanType, UsageAlertKind, UserRole, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { getRedis, cacheGet, cacheSet, cacheIncr, cacheDel } from './redis.js';

const env = z.object({
  PORT: z.coerce.number().default(3000),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  EMAIL_WEBHOOK_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  AUTO_SUSPEND_PCT: z.coerce.number().min(1).max(100).default(100)
}).parse(process.env);

const prisma = new PrismaClient();
const app = express();

type AuthContext = {
  apiKeyId?: string;
  userId?: string;
  email?: string;
  role?: UserRole;
  planType?: PlanType;
  status?: UserStatus;
  limit?: number;
  used?: number;
};

type AppRequest = Request & {
  requestId?: string;
  startedAt?: number;
  auth?: AuthContext;
};

const DAILY_LIMITS: Record<PlanType, number> = {
  FREE: 5000,
  PREMIUM: 50000,
  PRO: 300000,
  UNLIMITED: 1000000
};

const BURST_LIMITS: Record<PlanType, number> = {
  FREE: 100,
  PREMIUM: 500,
  PRO: 2000,
  UNLIMITED: 5000
};

// ── Spec 11.2 / 11.3 — effective limits, usage alerts, auto-suspend ──

type LimitUserRow = {
  id: string;
  email: string;
  role: UserRole;
  planType: PlanType;
  status: UserStatus;
  dailyLimitOverride: number | null;
  limitOverrideExpiresAt: Date | null;
  autoSuspendEnabled: boolean;
};

function dayStartUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function effectiveLimit(user: Pick<LimitUserRow, 'planType' | 'dailyLimitOverride' | 'limitOverrideExpiresAt'>): { limit: number; source: 'override' | 'temporary' | 'plan'; overrideExpiresAt: Date | null } {
  if (user.dailyLimitOverride != null) {
    const exp = user.limitOverrideExpiresAt ? new Date(user.limitOverrideExpiresAt) : null;
    if (!exp || exp > new Date()) {
      return { limit: user.dailyLimitOverride, source: exp ? 'temporary' : 'override', overrideExpiresAt: exp };
    }
  }
  return { limit: DAILY_LIMITS[user.planType], source: 'plan', overrideExpiresAt: null };
}

async function getUserLimitRow(userId: string): Promise<LimitUserRow | null> {
  const ck = `userlimit:${userId}`;
  const cached = await cacheGet<LimitUserRow>(ck);
  if (cached) return cached;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, planType: true, status: true, dailyLimitOverride: true, limitOverrideExpiresAt: true, autoSuspendEnabled: true }
  });
  if (!row) return null;
  await cacheSet(ck, row, 60);
  return row;
}

async function getUserDailyUsage(userId: string | undefined): Promise<number> {
  if (!userId) return 0;
  const cacheKey = `usage:user:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await cacheGet<number>(cacheKey);
  if (cached !== null) return cached;
  const count = await prisma.apiLog.count({ where: { userId, createdAt: { gte: dayStartUtc() } } });
  await cacheSet(cacheKey, count, 60);
  return count;
}

function usageAlertSubject(kind: UsageAlertKind): string {
  if (kind === UsageAlertKind.LIMIT_80) return 'Usage alert: 80% of your daily API limit reached';
  if (kind === UsageAlertKind.LIMIT_95) return 'Usage alert: 95% of your daily API limit reached';
  if (kind === UsageAlertKind.LIMIT_EXCEEDED) return 'Usage alert: daily API limit exceeded — requests temporarily blocked';
  if (kind === UsageAlertKind.USAGE_SPIKE) return 'Usage alert: unusual traffic spike detected on your account';
  if (kind === UsageAlertKind.HIGH_ERROR_RATE) return 'Usage alert: elevated error rate detected on your account';
  return 'Account auto-suspended: daily API limit exceeded';
}

async function sendEmail(to: string, subject: string, text: string): Promise<'SENT' | 'LOGGED' | 'FAILED'> {
  const webhook = env.EMAIL_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, subject, text })
      });
      return res.ok ? 'SENT' : 'FAILED';
    } catch {
      return 'FAILED';
    }
  }
  // No SMTP/webhook configured — log to console (an email outbox row is still persisted)
  console.log(`[usage-alert-email] to=${to} subject="${subject}"`);
  return 'LOGGED';
}

const ALERT_THRESHOLDS: { kind: UsageAlertKind; at: number; onDashboard: boolean }[] = [
  { kind: UsageAlertKind.LIMIT_80, at: 80, onDashboard: false },
  { kind: UsageAlertKind.LIMIT_95, at: 95, onDashboard: true },
  { kind: UsageAlertKind.LIMIT_EXCEEDED, at: 100, onDashboard: true }
];

async function evaluateUsageAlerts(user: LimitUserRow, used: number, limit: number) {
  if (user.role !== 'CLIENT' || user.status !== 'ACTIVE' || limit <= 0) return;
  const pct = (used / limit) * 100;
  const since = dayStartUtc();
  for (const t of ALERT_THRESHOLDS) {
    if (pct < t.at) continue;
    const existing = await prisma.usageAlert.findFirst({ where: { userId: user.id, kind: t.kind, createdAt: { gte: since } } });
    if (existing) continue;
    const text = `Your account ${user.email} has used ${used.toLocaleString()} of ${limit.toLocaleString()} daily API requests (${Math.floor(pct)}%).`;
    const status = await sendEmail(user.email, usageAlertSubject(t.kind), text);
    await prisma.usageAlert.create({
      data: {
        userId: user.id,
        kind: t.kind,
        threshold: t.at,
        used,
        limit,
        emailed: status !== 'FAILED',
        emailStatus: status,
        onDashboard: t.onDashboard,
        sentAt: status === 'FAILED' ? null : new Date()
      }
    });
  }
}

// ── Auto-suspend (background sweep) ──
async function autoSuspendSweep(): Promise<void> {
  const thresholdPct = env.AUTO_SUSPEND_PCT;
  const users = await prisma.user.findMany({
    where: { role: 'CLIENT', status: 'ACTIVE', autoSuspendEnabled: true },
    select: { id: true, email: true, planType: true, dailyLimitOverride: true, limitOverrideExpiresAt: true }
  });
  for (const u of users) {
    const { limit } = effectiveLimit(u);
    const used = await getUserDailyUsage(u.id);
    if (limit <= 0 || used < (limit * thresholdPct) / 100) continue;
    await prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    await cacheDel(`userlimit:${u.id}`);
    const keys = await prisma.apiKey.findMany({ where: { userId: u.id }, select: { key: true } });
    await Promise.all(keys.map(k => cacheDel(`key:${k.key}`)));
    const dup = await prisma.usageAlert.findFirst({ where: { userId: u.id, kind: UsageAlertKind.AUTO_SUSPENDED, createdAt: { gte: dayStartUtc() } } });
    if (!dup) {
      const status = await sendEmail(u.email, usageAlertSubject(UsageAlertKind.AUTO_SUSPENDED), `Account auto-suspended after exceeding ${thresholdPct}% of the daily request limit (${used.toLocaleString()} / ${limit.toLocaleString()} used).`);
      await prisma.usageAlert.create({
        data: { userId: u.id, kind: UsageAlertKind.AUTO_SUSPENDED, threshold: thresholdPct, used, limit, emailed: status !== 'FAILED', emailStatus: status, onDashboard: true, sentAt: status === 'FAILED' ? null : new Date() }
      });
    }
  }
}

setInterval(() => { autoSuspendSweep().catch(err => console.error('[auto-suspend] sweep failed:', err)); }, 60_000);

// ── Unusual-usage detection: traffic spikes & error rates (Spec 11.3) ──

type DailyUsageSummary = { peak: number; peakDate: string | null; total: number };

// Roll up per-day request counts (last 7 days) into per-user peak/total stats.
function summarizeDailyUsage(rows: { userId: string; day: string; cnt: bigint }[]): Map<string, DailyUsageSummary> {
  const map = new Map<string, DailyUsageSummary>();
  for (const r of rows) {
    const c = Number(r.cnt);
    const cur = map.get(r.userId) ?? { peak: 0, peakDate: null, total: 0 };
    cur.total += c;
    if (c > cur.peak) { cur.peak = c; cur.peakDate = r.day; }
    map.set(r.userId, cur);
  }
  return map;
}

type UnusualPattern = {
  userId: string;
  email: string;
  businessName: string | null;
  type: 'SPIKE' | 'ERROR_RATE';
  date?: string;
  today?: number;
  avg7?: number;
  factor?: number;
  total?: number;
  errors?: number;
  ratio?: number;
};

function buildUnusualPatterns(
  clientUsers: { id: string; email: string; businessName: string | null }[],
  spikeRaw: { userId: string; day: string; cnt: bigint }[],
  errRaw: { userId: string; total: bigint; errors: bigint }[]
): UnusualPattern[] {
  const byId = new Map(clientUsers.map(u => [u.id, u]));
  const unusual: UnusualPattern[] = [];

  for (const [userId, { peak, peakDate, total }] of summarizeDailyUsage(spikeRaw)) {
    const u = byId.get(userId);
    if (!u) continue;
    const baseline = (total - peak) / 7;
    if (peak > 1000 && peak > baseline * 5) {
      unusual.push({
        userId, email: u.email, businessName: u.businessName,
        type: 'SPIKE', date: peakDate ?? undefined, today: peak,
        avg7: Math.round(baseline),
        factor: baseline > 0 ? Math.round((peak / baseline) * 10) / 10 : peak
      });
    }
  }
  for (const r of errRaw) {
    const total = Number(r.total);
    const errors = Number(r.errors);
    const ratio = total > 0 ? errors / total : 0;
    const u = byId.get(r.userId);
    if (!u || ratio < 0.4) continue;
    unusual.push({ userId: r.userId, email: u.email, businessName: u.businessName, type: 'ERROR_RATE', total, errors, ratio: Math.round(ratio * 100) });
  }
  return unusual;
}

async function detectUnusualPatterns(): Promise<UnusualPattern[]> {
  const weekStart = new Date(dayStartUtc());
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const [clientUsers, spikeRaw, errRaw] = await Promise.all([
    prisma.user.findMany({ where: { role: 'CLIENT' }, select: { id: true, email: true, businessName: true } }),
    prisma.$queryRaw<{ userId: string; day: string; cnt: bigint }[]>`SELECT "userId", to_char("createdAt", 'YYYY-MM-DD') as day, COUNT(*) as cnt FROM "ApiLog" WHERE "userId" IS NOT NULL AND "createdAt" >= ${weekStart} GROUP BY "userId", day`,
    prisma.$queryRaw<{ userId: string; total: bigint; errors: bigint }[]>`SELECT "userId", COUNT(*) as total, COUNT(*) FILTER (WHERE "statusCode" >= 400) as errors FROM "ApiLog" WHERE "createdAt" >= ${weekStart} AND "userId" IS NOT NULL GROUP BY "userId" HAVING COUNT(*) > 100`
  ]);
  return buildUnusualPatterns(clientUsers, spikeRaw, errRaw);
}

// Persist auto-detected anomalies as usage alerts so they surface under Recent Usage Alerts.
async function anomalySweep(): Promise<void> {
  const windowStart = new Date(dayStartUtc());
  windowStart.setUTCDate(windowStart.getUTCDate() - 7);
  const patterns = await detectUnusualPatterns();
  for (const p of patterns) {
    const kind = p.type === 'SPIKE' ? UsageAlertKind.USAGE_SPIKE : UsageAlertKind.HIGH_ERROR_RATE;
    const dup = await prisma.usageAlert.findFirst({ where: { userId: p.userId, kind, createdAt: { gte: windowStart } } });
    if (dup) continue;
    const used = p.type === 'SPIKE' ? (p.today ?? 0) : (p.errors ?? 0);
    const limit = p.type === 'SPIKE' ? (p.avg7 ?? 0) : (p.total ?? 0);
    const threshold = p.type === 'SPIKE' ? 500 : 40;
    const text = p.type === 'SPIKE'
      ? `Traffic spike on ${p.email}: ${used.toLocaleString()} requests${p.date ? ` on ${p.date}` : ''} vs a ~${limit.toLocaleString()}/day baseline (${p.factor}×).`
      : `Elevated error rate on ${p.email}: ${used.toLocaleString()} of ${limit.toLocaleString()} requests failed (${p.ratio}%).`;
    const status = await sendEmail(p.email, usageAlertSubject(kind), text);
    await prisma.usageAlert.create({
      data: { userId: p.userId, kind, threshold, used, limit, emailed: status !== 'FAILED', emailStatus: status, onDashboard: true, sentAt: status === 'FAILED' ? null : new Date() }
    });
  }
}

const runAnomalySweep = () => anomalySweep().catch(err => console.error('[anomaly] sweep failed:', err));
setTimeout(runAnomalySweep, 5_000);
setInterval(runAnomalySweep, 300_000);

// ── Security Headers ──

app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

// ── CORS ──

const allowedOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',').map(s => s.trim())
  : [env.APP_ORIGIN];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any localhost dev origin (5173,3000, etc) in development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return callback(null, true);
    console.warn(`Blocked CORS origin: ${origin} (allowed: ${allowedOrigins.join(',')})`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());

// ── Request ID & Timing ──

app.use((req: AppRequest, res: Response, next: NextFunction) => {
  req.requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
  req.startedAt = Date.now();
  next();
});

// ── Global Rate Limit (in-memory safety net; per-key limiting is Redis-backed) ──

app.use(rateLimit({ windowMs: 60 * 1000, max: 10000, standardHeaders: true, legacyHeaders: false }));

// ── Helpers ──

function responseTime(req: AppRequest) {
  return Date.now() - (req.startedAt ?? Date.now());
}

function nextResetIso() {
  const date = new Date();
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
}

function maskIp(ip: string | undefined) {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return ip.slice(0, 6) + '***';
}

async function sendSuccess(req: AppRequest, res: Response, data: unknown, count = 1, status = 200) {
  let limit = req.auth?.limit ?? DAILY_LIMITS[req.auth?.planType ?? 'FREE'];
  let used = req.auth?.used;
  if (used === undefined) {
    used = await getUserDailyUsage(req.auth?.userId);
    if (req.auth?.role === 'CLIENT' && req.auth?.userId) {
      const user = await getUserLimitRow(req.auth.userId);
      if (user) limit = effectiveLimit(user).limit;
    }
  }
  const remaining = Math.max(limit - used, 0);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(new Date(nextResetIso()).getTime() / 1000)));
  return res.status(status).json({
    success: true,
    count,
    data,
    meta: {
      requestId: req.requestId,
      responseTime: responseTime(req),
      rateLimit: { remaining, limit, reset: nextResetIso() }
    }
  });
}

async function sendError(req: AppRequest, res: Response, httpCode: number, code: string, message: string) {
  return res.status(httpCode).json({
    success: false,
    error: { code, message },
    meta: { requestId: req.requestId, responseTime: responseTime(req) }
  });
}

async function logApi(req: AppRequest, statusCode: number) {
  try {
    await prisma.apiLog.create({
      data: {
        endpoint: req.path,
        method: req.method,
        responseTime: responseTime(req),
        statusCode,
        query: typeof req.query.q === 'string' ? req.query.q : null,
        ipAddress: maskIp(req.ip) ?? undefined,
        apiKeyId: req.auth?.apiKeyId,
        userId: req.auth?.userId
      }
    });
  } catch {}
}

function signToken(user: { id: string; email: string; role: UserRole }) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: '24h' });
}

// ── Auth Middleware ──

async function requireApiKey(req: AppRequest, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) return sendError(req, res, 401, 'INVALID_API_KEY', 'API key missing or invalid');

  const cacheKey = `key:${apiKey}`;
  let keyData = await cacheGet<any>(cacheKey);
  if (!keyData) {
    const key = await prisma.apiKey.findUnique({ where: { key: apiKey }, include: { user: { include: { stateAccess: true } } } });
    if (!key || !key.isActive || key.user.status !== 'ACTIVE') {
      return sendError(req, res, 401, 'INVALID_API_KEY', 'API key missing or invalid');
    }
    keyData = { id: key.id, userId: key.userId, secretHash: key.secretHash, role: key.user.role, planType: key.user.planType, status: key.user.status };
    await cacheSet(cacheKey, keyData, 300);
  }

  req.auth = {
    apiKeyId: keyData.id,
    userId: keyData.userId,
    role: keyData.role,
    planType: keyData.planType,
    status: keyData.status
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const apiSecret = req.header('x-api-secret');
    if (!apiSecret || !(await bcrypt.compare(apiSecret, keyData.secretHash))) {
      return sendError(req, res, 401, 'INVALID_API_KEY', 'API secret missing or invalid');
    }
  }

  // Per-user daily limit (Spec 11.2 — effective limit incl. enterprise overrides) + per-key burst
  let dailyUsed: number;
  let dailyLimit: number;
  let limitUser: LimitUserRow | null = null;
  if (keyData.role === 'CLIENT') limitUser = await getUserLimitRow(keyData.userId);
  if (limitUser) {
    dailyLimit = effectiveLimit(limitUser).limit;
  } else {
    dailyLimit = DAILY_LIMITS[keyData.planType as PlanType];
  }

  const redis = getRedis();
  if (redis) {
    const dailyKey = `ratelimit:${keyData.userId}:${new Date().toISOString().slice(0, 10)}`;
    dailyUsed = await cacheIncr(dailyKey, 86400);
    if (dailyUsed > dailyLimit) {
      if (limitUser) await evaluateUsageAlerts(limitUser, dailyUsed - 1, dailyLimit);
      return sendError(req, res, 429, 'RATE_LIMITED', 'Daily quota exceeded');
    }
    const burstKey = `burst:${keyData.id}:${Math.floor(Date.now() / 60000)}`;
    const burstUsed = await cacheIncr(burstKey, 60);
    const burstLimit = BURST_LIMITS[keyData.planType as PlanType];
    if (burstUsed > burstLimit) {
      return sendError(req, res, 429, 'RATE_LIMITED', 'Burst limit exceeded — too many requests per minute');
    }
  } else {
    dailyUsed = await getUserDailyUsage(keyData.userId);
    if (dailyUsed >= dailyLimit) {
      if (limitUser) await evaluateUsageAlerts(limitUser, dailyUsed, dailyLimit);
      return sendError(req, res, 429, 'RATE_LIMITED', 'Daily quota exceeded');
    }
  }

  // Spec 11.3 — fire usage alerts (80% / 95% / exceeded) as thresholds are crossed
  if (limitUser) await evaluateUsageAlerts(limitUser, dailyUsed, dailyLimit);

  req.auth = {
    apiKeyId: keyData.id,
    userId: keyData.userId,
    role: keyData.role,
    planType: keyData.planType,
    status: keyData.status,
    limit: dailyLimit,
    used: dailyUsed
  };

  // Update lastUsedAt async (don't block)
  prisma.apiKey.update({ where: { id: keyData.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  next();
}

async function requireAdmin(req: AppRequest, res: Response, next: NextFunction) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return sendError(req, res, 401, 'INVALID_API_KEY', 'Missing bearer token');
  try {
    const payload = jwt.verify(auth.slice(7), env.JWT_SECRET) as { id: string; email: string; role: UserRole };
    if (payload.role !== 'ADMIN') return sendError(req, res, 403, 'ACCESS_DENIED', 'Admin access required');
    req.auth = { userId: payload.id, email: payload.email, role: payload.role, planType: 'UNLIMITED', status: 'ACTIVE' };
    next();
  } catch {
    return sendError(req, res, 401, 'INVALID_API_KEY', 'Invalid bearer token');
  }
}

async function requireAuth(req: AppRequest, res: Response, next: NextFunction) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return sendError(req, res, 401, 'INVALID_API_KEY', 'Missing bearer token');
  try {
    const payload = jwt.verify(auth.slice(7), env.JWT_SECRET) as { id: string; email: string; role: UserRole };
    req.auth = { userId: payload.id, role: payload.role, planType: 'UNLIMITED', status: 'ACTIVE' };
    next();
  } catch {
    return sendError(req, res, 401, 'INVALID_API_KEY', 'Invalid bearer token');
  }
}

// ── Village Helpers ──

function villageSelect() {
  return {
    subDistrict: {
      include: { district: { include: { state: { include: { country: true } } } } }
    }
  } as const;
}

function toDropdownVillage(v: any) {
  return {
    value: `village_id_${v.code}`,
    label: v.name,
    fullAddress: [v.name, v.subDistrict.name, v.subDistrict.district.name, v.subDistrict.district.state.name, v.subDistrict.district.state.country.name].join(', '),
    hierarchy: {
      village: v.name,
      subDistrict: v.subDistrict.name,
      district: v.subDistrict.district.name,
      state: v.subDistrict.district.state.name,
      country: v.subDistrict.district.state.country.name
    }
  };
}

// Strip /api prefix when deployed behind Vercel rewrite /api -> function (so /api/v1/search becomes /v1/search internally)
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  next();
});

// ── Public Routes ──

app.get('/v1/health', async (_req, res) => {
  const redis = getRedis();
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const redisOk = redis ? await redis.ping().then(() => true).catch(() => false) : null;
  return res.json({ success: true, data: { status: dbOk ? 'ok' : 'degraded', db: dbOk, redis: redisOk } });
});

app.post('/auth/login', async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Invalid login payload');
  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
    return sendError(req, res, 401, 'INVALID_API_KEY', 'Invalid credentials');
  }
  return sendSuccess(req, res, {
    token: signToken({ id: user.id, email: user.email, role: user.role }),
    user: { id: user.id, email: user.email, role: user.role, planType: user.planType, status: user.status, businessName: user.businessName }
  });
});

app.post('/auth/register', async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    businessName: z.string().min(1),
    gstNumber: z.string().optional(),
    phoneNumber: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Invalid registration payload');
  // Block free email providers per spec 9.1
  const freeDomains = ['gmail.com','yahoo.com','yahoo.co.in','hotmail.com','outlook.com','aol.com','protonmail.com','icloud.com','rediffmail.com'];
  const domain = body.data.email.split('@')[1]?.toLowerCase();
  if (domain && freeDomains.includes(domain)) return sendError(req, res, 400, 'INVALID_QUERY', 'Business email required — free providers not allowed');
  const existing = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (existing) return sendError(req, res, 400, 'INVALID_QUERY', 'Email already registered');
  const passwordHash = await bcrypt.hash(body.data.password, 10);
  const user = await prisma.user.create({
    data: { email: body.data.email, passwordHash, businessName: body.data.businessName, gstNumber: body.data.gstNumber, phoneNumber: body.data.phoneNumber, role: 'CLIENT', planType: 'FREE', status: 'PENDING_APPROVAL' }
  });
  return sendSuccess(req, res, { message: 'Registration submitted. Awaiting admin approval.', userId: user.id });
});

// ── Cached Public API ──

app.use('/v1', requireApiKey);

app.get('/v1/search', async (req: AppRequest, res) => {
  const parsed = z.object({ q: z.string().min(2), state: z.string().optional(), district: z.string().optional(), subDistrict: z.string().optional(), limit: z.coerce.number().min(1).max(100).default(25) }).safeParse(req.query);
  if (!parsed.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Search query too short or invalid');
  const { q, state: stateFilter, district: districtFilter, subDistrict: subDistrictFilter, limit } = parsed.data;
  const cacheKey = `search:${q}:${stateFilter ?? ''}:${districtFilter ?? ''}:${subDistrictFilter ?? ''}:${limit}`;
  let cached = await cacheGet<any[]>(cacheKey);
  if (!cached) {
    const villages = await prisma.village.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        subDistrict: {
          name: subDistrictFilter ? { contains: subDistrictFilter, mode: 'insensitive' } : undefined,
          district: {
            name: districtFilter ? { contains: districtFilter, mode: 'insensitive' } : undefined,
            state: { name: stateFilter ? { contains: stateFilter, mode: 'insensitive' } : undefined }
          }
        }
      },
      include: villageSelect(),
      take: limit,
      orderBy: { name: 'asc' }
    });
    cached = villages.map(toDropdownVillage);
    await cacheSet(cacheKey, cached, 120);
  }
  await logApi(req, 200);
  return sendSuccess(req, res, cached, cached.length);
});

app.get('/v1/states', async (req: AppRequest, res) => {
  const cacheKey = 'states:all';
  let data = await cacheGet<any[]>(cacheKey);
  if (!data) {
    const states = await prisma.state.findMany({ orderBy: { name: 'asc' } });
    data = states.map(s => ({ id: s.id, code: s.code, label: s.name, value: s.id }));
    await cacheSet(cacheKey, data, 3600);
  }
  await logApi(req, 200);
  return sendSuccess(req, res, data, data.length);
});

app.get('/v1/states/:id/districts', async (req: AppRequest, res) => {
  const stateId = String(req.params.id);
  const cacheKey = `districts:${stateId}`;
  let data = await cacheGet<any[]>(cacheKey);
  if (!data) {
    const districts = await prisma.district.findMany({ where: { stateId }, orderBy: { name: 'asc' } });
    if (!districts.length) return sendError(req, res, 404, 'NOT_FOUND', 'Requested resource does not exist');
    data = districts.map(d => ({ id: d.id, code: d.code, label: d.name, value: d.id }));
    await cacheSet(cacheKey, data, 3600);
  }
  await logApi(req, 200);
  return sendSuccess(req, res, data, data.length);
});

app.get('/v1/districts/:id/subdistricts', async (req: AppRequest, res) => {
  const districtId = String(req.params.id);
  const cacheKey = `subdistricts:${districtId}`;
  let data = await cacheGet<any[]>(cacheKey);
  if (!data) {
    const items = await prisma.subDistrict.findMany({ where: { districtId }, orderBy: { name: 'asc' } });
    if (!items.length) return sendError(req, res, 404, 'NOT_FOUND', 'Requested resource does not exist');
    data = items.map(i => ({ id: i.id, code: i.code, label: i.name, value: i.id }));
    await cacheSet(cacheKey, data, 3600);
  }
  await logApi(req, 200);
  return sendSuccess(req, res, data, data.length);
});

app.get('/v1/subdistricts/:id/villages', async (req: AppRequest, res) => {
  const parsed = z.object({ page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(10000).default(500) }).safeParse(req.query);
  if (!parsed.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Search query too short or invalid');
  const subDistrictId = String(req.params.id);
  const skip = (parsed.data.page - 1) * parsed.data.limit;
  const [items, total] = await Promise.all([
    prisma.village.findMany({ where: { subDistrictId }, include: villageSelect(), orderBy: { name: 'asc' }, skip, take: parsed.data.limit }),
    prisma.village.count({ where: { subDistrictId } })
  ]);
  if (!items.length) return sendError(req, res, 404, 'NOT_FOUND', 'Requested resource does not exist');
  const data = items.map(toDropdownVillage);
  await logApi(req, 200);
  return sendSuccess(req, res, { rows: data, page: parsed.data.page, limit: parsed.data.limit, total }, data.length);
});

app.get('/v1/autocomplete', async (req: AppRequest, res) => {
  const parsed = z.object({ q: z.string().min(1), hierarchyLevel: z.enum(['village', 'subDistrict', 'district', 'state']).default('village'), state: z.string().optional(), district: z.string().optional(), subDistrict: z.string().optional() }).safeParse(req.query);
  if (!parsed.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Search query too short or invalid');
  const { q, hierarchyLevel: level, state: stateFilter, district: districtFilter, subDistrict: subDistrictFilter } = parsed.data;
  const cacheKey = `auto:${level}:${q.toLowerCase()}:${stateFilter ?? ''}:${districtFilter ?? ''}:${subDistrictFilter ?? ''}`;
  let data = await cacheGet<any[]>(cacheKey);
  if (!data) {
    if (level === 'village') {
      const items = await prisma.village.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
          subDistrict: {
            name: subDistrictFilter ? { contains: subDistrictFilter, mode: 'insensitive' } : undefined,
            district: {
              name: districtFilter ? { contains: districtFilter, mode: 'insensitive' } : undefined,
              state: { name: stateFilter ? { contains: stateFilter, mode: 'insensitive' } : undefined }
            }
          }
        },
        include: villageSelect(), take: 10, orderBy: { name: 'asc' }
      });
      data = items.map(item => ({ value: `village_id_${item.code}`, label: `${item.name} (${item.subDistrict.name}, ${item.subDistrict.district.name}, ${item.subDistrict.district.state.name})`, fullAddress: [item.name, item.subDistrict.name, item.subDistrict.district.name, item.subDistrict.district.state.name, item.subDistrict.district.state.country.name].join(', '), hierarchy: { village: item.name, subDistrict: item.subDistrict.name, district: item.subDistrict.district.name, state: item.subDistrict.district.state.name, country: item.subDistrict.district.state.country.name } }));
    } else if (level === 'subDistrict') {
      const items = await prisma.subDistrict.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
          district: {
            name: districtFilter ? { contains: districtFilter, mode: 'insensitive' } : undefined,
            state: { name: stateFilter ? { contains: stateFilter, mode: 'insensitive' } : undefined }
          }
        },
        include: { district: { include: { state: { include: { country: true } } } } }, take: 10, orderBy: { name: 'asc' }
      });
      data = items.map(item => ({ value: `subdistrict_id_${item.code}`, label: `${item.name} (${item.district.name}, ${item.district.state.name})`, fullAddress: [item.name, item.district.name, item.district.state.name, item.district.state.country.name].join(', '), hierarchy: { subDistrict: item.name, district: item.district.name, state: item.district.state.name, country: item.district.state.country.name } }));
    } else if (level === 'district') {
      const items = await prisma.district.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
          state: { name: stateFilter ? { contains: stateFilter, mode: 'insensitive' } : undefined }
        },
        include: { state: { include: { country: true } } }, take: 10, orderBy: { name: 'asc' }
      });
      data = items.map(item => ({ value: `district_id_${item.code}`, label: `${item.name} (${item.state.name})`, fullAddress: [item.name, item.state.name, item.state.country.name].join(', '), hierarchy: { district: item.name, state: item.state.name, country: item.state.country.name } }));
    } else {
      const items = await prisma.state.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, include: { country: true }, take: 10, orderBy: { name: 'asc' } });
      data = items.map(item => ({ value: `state_id_${item.code}`, label: item.name, fullAddress: [item.name, item.country.name].join(', '), hierarchy: { state: item.name, country: item.country.name } }));
    }
    await cacheSet(cacheKey, data, 180);
  }
  await logApi(req, 200);
  return sendSuccess(req, res, data, data.length);
});

// ── Admin Routes ──

app.get('/admin/users', requireAdmin, async (req: AppRequest, res) => {
  const { search, status, planType, sort, order } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (search) where.OR = [{ email: { contains: search, mode: 'insensitive' } }, { businessName: { contains: search, mode: 'insensitive' } }];
  if (status) where.status = status;
  if (planType) where.planType = planType;
  const orderBy: any = sort === 'createdAt' ? { createdAt: order === 'asc' ? 'asc' : 'desc' } : { createdAt: 'desc' };
  const users = await prisma.user.findMany({ where, orderBy, include: { apiKeys: true, stateAccess: { include: { state: true } }, _count: { select: { apiLogs: true } } } });
  const data = users.map(u => ({ id: u.id, email: u.email, businessName: u.businessName, gstNumber: u.gstNumber, phoneNumber: u.phoneNumber, role: u.role, planType: u.planType, status: u.status, apiKeyCount: u.apiKeys.length, requestCount: u._count.apiLogs, states: u.stateAccess.map(sa => sa.state.name), createdAt: u.createdAt, updatedAt: u.updatedAt }));
  return sendSuccess(req, res, data, data.length);
});

app.patch('/admin/users/:id', requireAdmin, async (req: AppRequest, res) => {
  const body = z.object({
    status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']).optional(),
    planType: z.enum(['FREE', 'PREMIUM', 'PRO', 'UNLIMITED']).optional(),
    dailyLimit: z.number().int().min(1).max(5_000_000).nullable().optional(),
    limitExpiresAt: z.string().datetime().nullable().optional(),
    autoSuspendEnabled: z.boolean().optional()
  }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Invalid payload');
  const id = String(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  const data: any = { ...body.data };
  if (body.data.dailyLimit !== undefined) data.dailyLimitOverride = body.data.dailyLimit;
  if (body.data.limitExpiresAt !== undefined) data.limitOverrideExpiresAt = body.data.limitExpiresAt === null ? null : new Date(body.data.limitExpiresAt);
  delete data.dailyLimit;
  delete data.limitExpiresAt;
  // A custom limit without an expiry applies permanently (enterprise); a limit with an expiry is a temporary increase
  if (data.dailyLimitOverride !== undefined && data.dailyLimitOverride !== null && data.limitOverrideExpiresAt === undefined) {
    data.limitOverrideExpiresAt = null;
  }
  const user = await prisma.user.update({ where: { id }, data, select: { id: true, email: true, status: true, planType: true, dailyLimitOverride: true, limitOverrideExpiresAt: true, autoSuspendEnabled: true } });
  await cacheDel(`userlimit:${id}`);
  return sendSuccess(req, res, user);
});

app.delete('/admin/users/:id/limit-override', requireAdmin, async (req: AppRequest, res) => {
  const id = String(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  const user = await prisma.user.update({ where: { id }, data: { dailyLimitOverride: null, limitOverrideExpiresAt: null }, select: { id: true, email: true, dailyLimitOverride: true, limitOverrideExpiresAt: true } });
  await cacheDel(`userlimit:${id}`);
  return sendSuccess(req, res, user);
});

// Spec 11.2 — view users and their live limit utilisation (used / effective limit / %)
app.get('/admin/users/limits', requireAdmin, async (req: AppRequest, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'CLIENT' },
    select: { id: true, email: true, businessName: true, planType: true, status: true, dailyLimitOverride: true, limitOverrideExpiresAt: true, autoSuspendEnabled: true }
  });
  const weekStart = new Date(dayStartUtc()); weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const dailyRows = await prisma.$queryRaw<{ userId: string; day: string; cnt: bigint }[]>`SELECT "userId", to_char("createdAt", 'YYYY-MM-DD') as day, COUNT(*) as cnt FROM "ApiLog" WHERE "createdAt" >= ${weekStart} AND "userId" IS NOT NULL GROUP BY "userId", day`;
  const usageByUser = summarizeDailyUsage(dailyRows);
  const rows = users.map(u => {
    const eff = effectiveLimit(u);
    const recent = usageByUser.get(u.id);
    const used = recent?.peak ?? 0;
    const pct = eff.limit > 0 ? Math.round((used / eff.limit) * 1000) / 10 : 0;
    const state = u.status === 'SUSPENDED' && pct >= 100 ? 'EXCEEDED_BLOCKED' : u.status === 'SUSPENDED' ? 'SUSPENDED' : pct >= 100 ? 'EXCEEDED' : pct >= 95 ? 'CRITICAL' : pct >= 80 ? 'WARNING' : 'OK';
    return {
      id: u.id, email: u.email, businessName: u.businessName, planType: u.planType, status: u.status,
      used, windowTotal: recent?.total ?? 0, peakDate: recent?.peakDate ?? null, limit: eff.limit, pct, state,
      limitSource: eff.source, limitExpiresAt: eff.overrideExpiresAt,
      autoSuspendEnabled: u.autoSuspendEnabled
    };
  });
  rows.sort((a, b) => b.pct - a.pct);
  return sendSuccess(req, res, rows, rows.length);
});

// Spec 11.3 — admin alerting: users approaching limits, unusual patterns, system capacity
app.get('/admin/alerts', requireAdmin, async (req: AppRequest, res) => {
  const dayStart = dayStartUtc();
  const weekStart = new Date(dayStart); weekStart.setUTCDate(dayStart.getUTCDate() - 7);

  const [clientUsers, spikeRaw, errRaw, capRaw, perMinRaw, recentAlerts] = await Promise.all([
    prisma.user.findMany({ where: { role: 'CLIENT' }, select: { id: true, email: true, businessName: true, planType: true, status: true, dailyLimitOverride: true, limitOverrideExpiresAt: true, autoSuspendEnabled: true } }),
    prisma.$queryRaw<{ userId: string; day: string; cnt: bigint }[]>`SELECT "userId", to_char("createdAt", 'YYYY-MM-DD') as day, COUNT(*) as cnt FROM "ApiLog" WHERE "userId" IS NOT NULL AND "createdAt" >= ${weekStart} GROUP BY "userId", day`,
    prisma.$queryRaw<{ userId: string; total: bigint; errors: bigint }[]>`SELECT "userId", COUNT(*) as total, COUNT(*) FILTER (WHERE "statusCode" >= 400) as errors FROM "ApiLog" WHERE "createdAt" >= ${weekStart} AND "userId" IS NOT NULL GROUP BY "userId" HAVING COUNT(*) > 100`,
    prisma.$queryRaw<{ plan: string; cnt: bigint }[]>`SELECT "planType" as plan, COUNT(*) as cnt FROM "User" WHERE "status" = 'ACTIVE' AND "role" = 'CLIENT' GROUP BY "planType"`,
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) as c FROM "ApiLog" WHERE "createdAt" > NOW() - INTERVAL '60 seconds'`,
    prisma.usageAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 25, include: { user: { select: { email: true, businessName: true } } } })
  ]);

  // Users approaching their effective daily limit (>= 80% of the busiest day in the last 7 days)
  const usageByUser = summarizeDailyUsage(spikeRaw);
  const approaching = clientUsers
    .map(u => {
      const eff = effectiveLimit(u);
      const recent = usageByUser.get(u.id);
      const used = recent?.peak ?? 0;
      const pct = eff.limit > 0 ? Math.round((used / eff.limit) * 1000) / 10 : 0;
      return { id: u.id, email: u.email, businessName: u.businessName, planType: u.planType, status: u.status, used, peakDate: recent?.peakDate ?? null, windowTotal: recent?.total ?? 0, limit: eff.limit, pct, limitSource: eff.source, autoSuspendEnabled: u.autoSuspendEnabled };
    })
    .filter(a => a.pct >= 80)
    .sort((a, b) => b.pct - a.pct);

  // Unusual usage patterns: a recent day with a sharp volume spike vs the 7-day
  // baseline, or a high error ratio over the last 7 days
  const unusual = buildUnusualPatterns(clientUsers, spikeRaw, errRaw);

  // System-wide capacity: requests per minute vs platform burst capacity
  const capacityPerMinute = capRaw.reduce((acc, r) => acc + Number(r.cnt) * (BURST_LIMITS[r.plan as PlanType] ?? 0), 0);
  const perMinute = Number(perMinRaw[0]?.c ?? 0);
  const capPct = capacityPerMinute > 0 ? Math.round((perMinute / capacityPerMinute) * 1000) / 10 : 0;

  return sendSuccess(req, res, {
    approaching,
    unusual,
    capacity: { perMinute, capacityPerMinute, pct: capPct, critical: capPct >= 80 },
    recentAlerts: recentAlerts.map(a => ({
      id: a.id, userId: a.userId, email: a.user.email, businessName: a.user.businessName,
      kind: a.kind, threshold: a.threshold, used: a.used, limit: a.limit,
      emailed: a.emailed, emailStatus: a.emailStatus, onDashboard: a.onDashboard, sentAt: a.sentAt, createdAt: a.createdAt
    }))
  });
});

app.delete('/admin/users/:id', requireAdmin, async (req: AppRequest, res) => {
  const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  await prisma.user.delete({ where: { id: String(req.params.id) } });
  return sendSuccess(req, res, { message: 'User deleted' });
});

// ── Admin User Detail (profile, usage, keys, notes) ──

app.get('/admin/users/:id', requireAdmin, async (req: AppRequest, res) => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      apiKeys: { orderBy: { createdAt: 'desc' } },
      stateAccess: { orderBy: { createdAt: 'desc' as const }, include: { state: true } },
      _count: { select: { apiLogs: true } }
    }
  });
  if (!user) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [todayRequests, monthRequests, avgRaw, successRaw, lastLog] = await Promise.all([
    prisma.apiLog.count({ where: { userId: id, createdAt: { gte: dayStart } } }),
    prisma.apiLog.count({ where: { userId: id, createdAt: { gte: monthStart } } }),
    prisma.$queryRaw<{ avg: number }[]>`SELECT COALESCE(AVG("responseTime"), 0)::int as avg FROM "ApiLog" WHERE "userId" = ${id} AND "createdAt" > NOW() - INTERVAL '24 hours'`,
    prisma.$queryRaw<{ ok: bigint; total: bigint }[]>`SELECT COUNT(*) FILTER (WHERE "statusCode" >= 200 AND "statusCode" < 300) as ok, COUNT(*) as total FROM "ApiLog" WHERE "userId" = ${id} AND "createdAt" > NOW() - INTERVAL '30 days'`,
    prisma.apiLog.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  ]);
  const okCount = Number(successRaw[0]?.ok ?? 0);
  const totalCount = Number(successRaw[0]?.total ?? 0);

  return sendSuccess(req, res, {
    id: user.id,
    email: user.email,
    businessName: user.businessName,
    gstNumber: user.gstNumber,
    phoneNumber: user.phoneNumber,
    role: user.role,
    planType: user.planType,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    counts: {
      apiKeys: user.apiKeys.length,
      activeKeys: user.apiKeys.filter(k => k.isActive).length,
      states: user.stateAccess.length,
      requests: user._count.apiLogs
    },
    usage: {
      todayRequests,
      monthRequests,
      totalRequests: user._count.apiLogs,
      avgResponseTime: avgRaw[0]?.avg ?? 0,
      successRate: totalCount > 0 ? Math.round((okCount / totalCount) * 1000) / 10 : 100,
      dailyLimit: effectiveLimit(user).limit,
      limitSource: effectiveLimit(user).source,
      limitExpiresAt: effectiveLimit(user).overrideExpiresAt,
      lastRequestAt: lastLog?.createdAt ?? null
    },
    limitConfig: {
      dailyLimitOverride: user.dailyLimitOverride,
      limitOverrideExpiresAt: user.limitOverrideExpiresAt,
      autoSuspendEnabled: user.autoSuspendEnabled
    },
    keys: user.apiKeys.map(k => ({
      id: k.id,
      keyMasked: k.key.slice(0, 10) + '****' + k.key.slice(-4),
      label: k.label,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt
    })),
    states: user.stateAccess.map(sa => ({ id: sa.state.id, name: sa.state.name, code: sa.state.code, grantedAt: sa.createdAt }))
  });
});

app.post('/admin/users/:id/api-keys', requireAdmin, async (req: AppRequest, res) => {
  const id = String(req.params.id);
  const body = z.object({ label: z.string().min(1).max(60) }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Label required');
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  const activeKeys = await prisma.apiKey.count({ where: { userId: id, isActive: true } });
  if (activeKeys >= 5) return sendError(req, res, 400, 'INVALID_QUERY', 'Maximum 5 active keys');
  const key = `ak_${crypto.randomBytes(16).toString('hex')}`;
  const secret = `as_${crypto.randomBytes(16).toString('hex')}`;
  const secretHash = await bcrypt.hash(secret, 10);
  const created = await prisma.apiKey.create({ data: { key, secretHash, label: body.data.label, userId: id } });
  return sendSuccess(req, res, { id: created.id, key, secret, label: created.label, message: 'Store the secret securely - it will not be shown again.' });
});

app.delete('/admin/users/:id/api-keys/:keyId', requireAdmin, async (req: AppRequest, res) => {
  const key = await prisma.apiKey.findUnique({ where: { id: String(req.params.keyId) } });
  if (!key || key.userId !== String(req.params.id)) return sendError(req, res, 404, 'NOT_FOUND', 'Key not found');
  await prisma.apiKey.update({ where: { id: key.id }, data: { isActive: false } });
  return sendSuccess(req, res, { message: 'Key revoked' });
});

app.post('/admin/users/:id/api-keys/:keyId/rotate-secret', requireAdmin, async (req: AppRequest, res) => {
  const key = await prisma.apiKey.findUnique({ where: { id: String(req.params.keyId) } });
  if (!key || key.userId !== String(req.params.id)) return sendError(req, res, 404, 'NOT_FOUND', 'Key not found');
  const secret = `as_${crypto.randomBytes(16).toString('hex')}`;
  const secretHash = await bcrypt.hash(secret, 10);
  await prisma.apiKey.update({ where: { id: key.id }, data: { secretHash } });
  return sendSuccess(req, res, { id: key.id, secret, message: 'Store the secret securely - it will not be shown again.' });
});

app.get('/admin/users/:id/notes', requireAdmin, async (req: AppRequest, res) => {
  const notes = await prisma.adminNote.findMany({ where: { userId: String(req.params.id) }, orderBy: { createdAt: 'desc' } });
  return sendSuccess(req, res, notes, notes.length);
});

app.post('/admin/users/:id/notes', requireAdmin, async (req: AppRequest, res) => {
  const id = String(req.params.id);
  const body = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Note text required');
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  const note = await prisma.adminNote.create({
    data: { userId: id, authorId: req.auth?.userId ?? null, authorEmail: req.auth?.email ?? 'admin', body: body.data.body }
  });
  return sendSuccess(req, res, note);
});

app.delete('/admin/users/:id/notes/:noteId', requireAdmin, async (req: AppRequest, res) => {
  const result = await prisma.adminNote.deleteMany({ where: { id: String(req.params.noteId), userId: String(req.params.id) } });
  if (result.count === 0) return sendError(req, res, 404, 'NOT_FOUND', 'Note not found');
  return sendSuccess(req, res, { message: 'Note deleted' });
});

app.post('/admin/users/:id/state-access', requireAdmin, async (req: AppRequest, res) => {
  const userId = String(req.params.id);
  const body = z.object({ stateId: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Invalid payload');
  const [user, state] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.state.findUnique({ where: { id: body.data.stateId }, select: { id: true } })
  ]);
  if (!user) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  if (!state) return sendError(req, res, 404, 'NOT_FOUND', 'State not found');
  await prisma.userStateAccess.upsert({ where: { userId_stateId: { userId, stateId: state.id } }, update: {}, create: { userId, stateId: state.id } });
  return sendSuccess(req, res, { message: 'State access granted' });
});

app.delete('/admin/users/:id/state-access/:stateId', requireAdmin, async (req: AppRequest, res) => {
  const result = await prisma.userStateAccess.deleteMany({ where: { userId: String(req.params.id), stateId: String(req.params.stateId) } });
  if (result.count === 0) return sendError(req, res, 404, 'NOT_FOUND', 'State access grant not found');
  return sendSuccess(req, res, { message: 'State access revoked' });
});

app.post('/admin/users/:id/grant-all-states', requireAdmin, async (req: AppRequest, res) => {
  const userId = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  const states = await prisma.state.findMany({ select: { id: true } });
  await prisma.userStateAccess.createMany({ data: states.map(s => ({ userId, stateId: s.id })), skipDuplicates: true });
  return sendSuccess(req, res, { message: 'All states granted' });
});

app.get('/admin/api-keys', requireAdmin, async (req: AppRequest, res) => {
  const keys = await prisma.apiKey.findMany({ include: { user: { select: { email: true, businessName: true } } }, orderBy: { createdAt: 'desc' } });
  const data = keys.map(k => ({ id: k.id, keyMasked: k.key.slice(0, 10) + '****' + k.key.slice(-4), label: k.label, isActive: k.isActive, userEmail: k.user.email, businessName: k.user.businessName, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt }));
  return sendSuccess(req, res, data, data.length);
});

app.get('/admin/api-logs', requireAdmin, async (req: AppRequest, res) => {
  const { dateFrom, dateTo, userId, endpoint, statusGroup, minResponseTime, page: pageStr, limit: limitStr } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '50', 10)));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (dateFrom || dateTo) { where.createdAt = {}; if (dateFrom) where.createdAt.gte = new Date(dateFrom); if (dateTo) where.createdAt.lte = new Date(dateTo); }
  if (userId) where.userId = userId;
  if (endpoint) where.endpoint = { contains: endpoint, mode: 'insensitive' };
  if (statusGroup === '2xx') where.statusCode = { gte: 200, lt: 300 };
  else if (statusGroup === '4xx') where.statusCode = { gte: 400, lt: 500 };
  else if (statusGroup === '5xx') where.statusCode = { gte: 500, lt: 600 };
  if (minResponseTime) where.responseTime = { gte: parseInt(minResponseTime, 10) };
  const [logs, total] = await Promise.all([
    prisma.apiLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit, include: { user: { select: { email: true, businessName: true } }, apiKey: { select: { key: true } } } }),
    prisma.apiLog.count({ where })
  ]);
  const data = logs.map(l => ({ id: l.id, timestamp: l.createdAt, endpoint: l.endpoint, method: l.method, responseTime: l.responseTime, statusCode: l.statusCode, query: l.query, ipAddress: l.ipAddress, apiKeyMasked: l.apiKey ? l.apiKey.key.slice(0, 10) + '****' : null, userEmail: l.user?.email, businessName: l.user?.businessName }));
  return sendSuccess(req, res, { rows: data, page, limit, total }, total);
});

// ── Admin Village Browser (spec 8.4) ──
app.get('/admin/villages', requireAdmin, async (req: AppRequest, res) => {
  const { stateId, districtId, subDistrictId, search, page: pageStr, limit: limitStr } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10));
  const rawLimit = parseInt(limitStr ?? '500', 10);
  const limit = [500, 5000, 10000].includes(rawLimit) ? rawLimit : Math.min(10000, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  const where: any = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (subDistrictId) where.subDistrictId = subDistrictId;
  else if (districtId) where.subDistrict = { districtId };
  else if (stateId) where.subDistrict = { district: { stateId } };
  const [rows, total] = await Promise.all([
    prisma.village.findMany({ where, include: villageSelect(), orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.village.count({ where })
  ]);
  const data = rows.map(v => ({
    stateName: (v as any).subDistrict.district.state.name,
    districtName: (v as any).subDistrict.district.name,
    subDistrictName: (v as any).subDistrict.name,
    villageCode: v.code,
    villageName: v.name
  }));
  await logApi(req, 200);
  return sendSuccess(req, res, { rows: data, page, limit, total }, data.length);
});

// ── Admin Dashboard (SQL aggregation) ──

const SLA_TARGET_MS = 500;

app.get('/admin/dashboard', requireAdmin, async (req: AppRequest, res) => {
  const cacheKey = 'admin:dashboard:v3';
  const cached = await cacheGet<any>(cacheKey);
  if (cached) return sendSuccess(req, res, cached, cached.users.length);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(dayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

  const [topStatesRaw, lineRaw, pieRaw, areaRaw, stackedRaw, heatmapRaw, users, totalVillages, todayRequests, villageGrowthRaw, activeRaw, hourlyTodayRaw, avgRespRaw] = await Promise.all([
    prisma.$queryRaw<{ name: string; villages: bigint }[]>`SELECT s.name, COUNT(v.id) as villages FROM "State" s JOIN "District" d ON d."stateId" = s.id JOIN "SubDistrict" sd ON sd."districtId" = d.id JOIN "Village" v ON v."subDistrictId" = sd.id GROUP BY s.name ORDER BY villages DESC LIMIT 10`,
    prisma.$queryRaw<{ date: string; requests: bigint }[]>`SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') as date, COUNT(*) as requests FROM "ApiLog" GROUP BY date ORDER BY date DESC LIMIT 30`,
    prisma.$queryRaw<{ name: string; value: bigint }[]>`SELECT "planType" as name, COUNT(*) as value FROM "User" GROUP BY "planType"`,
    prisma.$queryRaw<{ time: string; p95: number; p99: number }[]>`SELECT TO_CHAR("createdAt", 'HH24:00') as time, PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "responseTime") as p95, PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "responseTime") as p99 FROM "ApiLog" WHERE "createdAt" > NOW() - INTERVAL '24 hours' GROUP BY time ORDER BY time`,
    prisma.$queryRaw<{ endpoint: string; requests: bigint; statusCode: number }[]>`SELECT endpoint, COUNT(*) as requests, "statusCode" FROM "ApiLog" GROUP BY endpoint, "statusCode" ORDER BY endpoint`,
    prisma.$queryRaw<{ hour: string; requests: bigint }[]>`SELECT TO_CHAR("createdAt", 'HH24') as hour, COUNT(*) as requests FROM "ApiLog" WHERE "createdAt" > NOW() - INTERVAL '24 hours' GROUP BY hour ORDER BY hour`,
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { apiKeys: true, stateAccess: { include: { state: true } } } }),
    prisma.village.count(),
    prisma.apiLog.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.$queryRaw<{ weekNew: bigint; prevWeek: bigint }[]>`SELECT COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days') as "weekNew", COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '14 days' AND "createdAt" <= NOW() - INTERVAL '7 days') as "prevWeek" FROM "Village"`,
    prisma.$queryRaw<{ today: bigint; yesterday: bigint }[]>`SELECT COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= ${dayStart} AND "userId" IS NOT NULL) as today, COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= ${yesterdayStart} AND "createdAt" < ${dayStart} AND "userId" IS NOT NULL) as yesterday FROM "ApiLog" WHERE "createdAt" >= ${yesterdayStart}`,
    prisma.$queryRaw<{ hour: string; requests: bigint }[]>`SELECT TO_CHAR("createdAt", 'HH24') as hour, COUNT(*) as requests FROM "ApiLog" WHERE "createdAt" >= ${dayStart} GROUP BY hour ORDER BY hour`,
    prisma.$queryRaw<{ avg: number }[]>`SELECT COALESCE(AVG("responseTime"), 0)::int as avg FROM "ApiLog" WHERE "createdAt" > NOW() - INTERVAL '24 hours'`
  ]);

  const topStates = topStatesRaw.map(r => ({ name: r.name, villages: Number(r.villages) }));
  const line = lineRaw.reverse().map(r => ({ date: r.date, requests: Number(r.requests) }));
  const pie = pieRaw.map(r => ({ name: r.name, value: Number(r.value) }));
  const area = areaRaw.map(r => ({ time: r.time, p95: Math.round(r.p95), p99: Math.round(r.p99) }));
  const stacked = stackedRaw.map(r => ({ endpoint: r.endpoint, requests: Number(r.requests), statusCode: r.statusCode }));
  const heatmap = heatmapRaw.map(r => ({ hour: r.hour, requests: Number(r.requests) }));

  const averageResponseTime = avgRespRaw[0]?.avg ?? 0;

  const weekNew = Number(villageGrowthRaw[0]?.weekNew ?? 0);
  const prevWeek = Number(villageGrowthRaw[0]?.prevWeek ?? 0);
  const villagesChangePct = prevWeek > 0 ? Math.round(((weekNew - prevWeek) / prevWeek) * 1000) / 10 : weekNew > 0 ? 100 : 0;

  const activeUsers = Number(activeRaw[0]?.today ?? 0);
  const activeUsersYesterday = Number(activeRaw[0]?.yesterday ?? 0);

  const hourlyMap = new Map(hourlyTodayRaw.map(r => [r.hour, Number(r.requests)]));
  const groupedHours = hourlyTodayRaw.map(r => parseInt(r.hour, 10)).filter(n => !Number.isNaN(n));
  const lastHour = Math.max(new Date().getUTCHours(), ...groupedHours);
  const todayHourly = Array.from({ length: lastHour + 1 }, (_, h) => {
    const hour = String(h).padStart(2, '0');
    return { hour, requests: hourlyMap.get(hour) ?? 0 };
  });

  const slaMet = averageResponseTime > 0 ? averageResponseTime <= SLA_TARGET_MS : true;
  const revenue = null as number | null;

  const dashboardData = {
    metrics: {
      totalVillages,
      villagesChangePct,
      villagesAddedWeek: weekNew,
      activeUsers,
      activeUsersYesterday,
      todayRequests,
      todayHourly,
      averageResponseTime,
      slaTargetMs: SLA_TARGET_MS,
      slaMet,
      revenue
    },
    charts: { topStates, line, pie, area, stacked, heatmap },
    users: users.map(u => ({ id: u.id, email: u.email, businessName: u.businessName, planType: u.planType, status: u.status }))
  };

  // Spec 8.1 — real-time charts (line, p95/p99, heat map) refresh on this cadence
  await cacheSet(cacheKey, dashboardData, 30);
  return sendSuccess(req, res, dashboardData, users.length);
});

// ── Client Portal ──

app.post('/portal/api-keys', requireAuth, async (req: AppRequest, res) => {
  const body = z.object({ label: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return sendError(req, res, 400, 'INVALID_QUERY', 'Label required');
  if (!req.auth?.userId) return sendError(req, res, 401, 'INVALID_API_KEY', 'Unauthorized');
  const userKeys = await prisma.apiKey.count({ where: { userId: req.auth.userId } });
  if (userKeys >= 5) return sendError(req, res, 400, 'INVALID_QUERY', 'Maximum 5 active keys');
  const key = `ak_${crypto.randomBytes(16).toString('hex')}`;
  const secret = `as_${crypto.randomBytes(16).toString('hex')}`;
  const secretHash = await bcrypt.hash(secret, 10);
  const apiKey = await prisma.apiKey.create({ data: { key, secretHash, label: body.data.label, userId: req.auth.userId } });
  return sendSuccess(req, res, { id: apiKey.id, key, secret, label: apiKey.label, message: 'Store the secret securely - it will not be shown again.' });
});

app.get('/portal/api-keys', requireAuth, async (req: AppRequest, res) => {
  if (!req.auth?.userId) return sendError(req, res, 401, 'INVALID_API_KEY', 'Unauthorized');
  const keys = await prisma.apiKey.findMany({ where: { userId: req.auth.userId }, orderBy: { createdAt: 'desc' } });
  const data = keys.map(k => ({ id: k.id, keyMasked: k.key.slice(0, 10) + '****' + k.key.slice(-4), label: k.label, isActive: k.isActive, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt }));
  return sendSuccess(req, res, data, data.length);
});

app.delete('/portal/api-keys/:id', requireAuth, async (req: AppRequest, res) => {
  if (!req.auth?.userId) return sendError(req, res, 401, 'INVALID_API_KEY', 'Unauthorized');
  const key = await prisma.apiKey.findUnique({ where: { id: String(req.params.id) } });
  if (!key || key.userId !== req.auth.userId) return sendError(req, res, 404, 'NOT_FOUND', 'Key not found');
  await prisma.apiKey.update({ where: { id: String(req.params.id) }, data: { isActive: false } });
  return sendSuccess(req, res, { message: 'Key revoked' });
});

app.post('/portal/api-keys/:id/rotate-secret', requireAuth, async (req: AppRequest, res) => {
  if (!req.auth?.userId) return sendError(req, res, 401, 'INVALID_API_KEY', 'Unauthorized');
  const key = await prisma.apiKey.findUnique({ where: { id: String(req.params.id) } });
  if (!key || key.userId !== req.auth.userId) return sendError(req, res, 404, 'NOT_FOUND', 'Key not found');
  const newSecret = `as_${crypto.randomBytes(16).toString('hex')}`;
  const secretHash = await bcrypt.hash(newSecret, 10);
  await prisma.apiKey.update({ where: { id: String(req.params.id) }, data: { secretHash } });
  return sendSuccess(req, res, { secret: newSecret, message: 'Store the new secret securely - it will not be shown again.' });
});

app.get('/portal/usage', requireAuth, async (req: AppRequest, res) => {
  if (!req.auth?.userId) return sendError(req, res, 401, 'INVALID_API_KEY', 'Unauthorized');
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user) return sendError(req, res, 404, 'NOT_FOUND', 'User not found');
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [todayRequests, monthRequests, avgResult] = await Promise.all([
    prisma.apiLog.count({ where: { userId: user.id, createdAt: { gte: todayStart } } }),
    prisma.apiLog.count({ where: { userId: user.id, createdAt: { gte: monthStart } } }),
    prisma.$queryRaw<{ avg: number }[]>`SELECT COALESCE(AVG("responseTime"), 0)::int as avg FROM "ApiLog" WHERE "userId" = ${user.id} AND "createdAt" > NOW() - INTERVAL '24 hours'`
  ]);
  const successResult = await prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) as cnt FROM "ApiLog" WHERE "userId" = ${user.id} AND "statusCode" >= 200 AND "statusCode" < 300 AND "createdAt" > NOW() - INTERVAL '24 hours'`;
  const totalResult = await prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) as cnt FROM "ApiLog" WHERE "userId" = ${user.id} AND "createdAt" > NOW() - INTERVAL '24 hours'`;
  const avgResponseTime = avgResult[0]?.avg ?? 0;
  const successRate = totalResult[0]?.cnt ? Math.round((Number(successResult[0]?.cnt ?? 0) / Number(totalResult[0].cnt)) * 100) : 100;
  // Usage chart — one daily series per endpoint type (top 4 by volume, rest folded into 'other')
  const usageRaw = await prisma.$queryRaw<{ date: string; endpoint: string; count: bigint }[]>`SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') as date, "endpoint", COUNT(*)::int as count FROM "ApiLog" WHERE "userId" = ${user.id} AND "createdAt" > NOW() - INTERVAL '30 days' GROUP BY date, "endpoint" ORDER BY date`;
  const volByEndpoint: Record<string, number> = {};
  for (const r of usageRaw) volByEndpoint[r.endpoint] = (volByEndpoint[r.endpoint] ?? 0) + Number(r.count);
  const topEndpoints = Object.entries(volByEndpoint).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => e);
  const folded = Object.keys(volByEndpoint).some(e => !topEndpoints.includes(e));
  const chartEndpoints = [...topEndpoints, ...(folded ? ['other'] : [])];
  const keyOf = (endpoint: string) => topEndpoints.includes(endpoint) ? endpoint : 'other';
  const byDate = new Map<string, Record<string, number>>();
  for (const r of usageRaw) {
    const row = byDate.get(r.date) ?? {};
    const k = keyOf(r.endpoint);
    row[k] = (row[k] ?? 0) + Number(r.count);
    byDate.set(r.date, row);
  }
  const usageChart = [...byDate.entries()].map(([date, cols]) => ({ date, total: Object.values(cols).reduce((a, b) => a + b, 0), ...cols }));
  const eff = effectiveLimit(user);
  const alerts = await prisma.usageAlert.findMany({ where: { userId: user.id, onDashboard: true }, orderBy: { createdAt: 'desc' }, take: 10 });
  return sendSuccess(req, res, {
    planType: user.planType,
    status: user.status,
    dailyLimit: eff.limit,
    limitSource: eff.source,
    limitExpiresAt: eff.overrideExpiresAt,
    autoSuspendEnabled: user.autoSuspendEnabled,
    todayRequests,
    monthRequests,
    avgResponseTime,
    successRate,
    usageChart,
    chartEndpoints,
    alerts: alerts.map(a => ({ id: a.id, kind: a.kind, threshold: a.threshold, used: a.used, limit: a.limit, createdAt: a.createdAt }))
  });
});

// ── Catch-all ──

app.use((_req: AppRequest, res: Response) => sendError(_req, res, 404, 'NOT_FOUND', 'Requested resource does not exist'));
app.use((err: unknown, _req: AppRequest, res: Response, _next: NextFunction) => {
  console.error(err);
  void sendError(_req, res, 500, 'INTERNAL_ERROR', 'Server-side error');
});

// ── Graceful Shutdown ──

const server = app.listen(env.PORT, () => console.log(`Village API running at http://localhost:${env.PORT}/v1`));

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
