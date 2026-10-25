import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

function randomToken(prefix: string) {
  return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
}

// ── Demo usage generator (so the admin Overview shows populated analytics) ──
// Deterministic PRNG (mulberry32) — same seed produces the same demo data.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_CLIENTS = [
  { email: 'priya@retailcorp.in', businessName: 'RetailCorp India', planType: 'PREMIUM', key: 'ak_demo_retail_0001', secret: 'as_demo_retail_0001', weight: 3 },
  { email: 'arjun@logisticsco.com', businessName: 'LogisticsCo', planType: 'PRO', key: 'ak_demo_logi_0002', secret: 'as_demo_logi_0002', weight: 4 },
  { email: 'meera@fintechlabs.io', businessName: 'FintechLabs', planType: 'UNLIMITED', key: 'ak_demo_fintech_0003', secret: 'as_demo_fintech_0003', weight: 5 },
  { email: 'rahul@agritech.co.in', businessName: 'AgriTech Solutions', planType: 'FREE', key: 'ak_demo_agri_0004', secret: 'as_demo_agri_0004', weight: 2 },
  { email: 'sara@urbanmaps.com', businessName: 'UrbanMaps', planType: 'PREMIUM', key: 'ak_demo_urban_0005', secret: 'as_demo_urban_0005', weight: 3 }
] as const;

const DEMO_ENDPOINTS = [
  { path: '/v1/search', weight: 32, queries: ['Manibeli', 'Dhankhedi', 'Sinduri', 'Chimalkhadi'] },
  { path: '/v1/autocomplete', weight: 24, queries: ['Man', 'Dhan', 'Chim', 'Sin'] },
  { path: '/v1/states', weight: 12 },
  { path: '/v1/states/27/districts', weight: 10 },
  { path: '/v1/districts/497/subdistricts', weight: 8 },
  { path: '/v1/villages', weight: 8, queries: ['Akkalkuwa'] },
  { path: '/v1/pincode', weight: 6, queries: ['525002'] }
] as const;

function weightedPick<T extends { weight: number }>(rng: () => number, items: readonly T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function statusFor(rng: () => number): number {
  const r = rng();
  if (r < 0.92) return 200;
  if (r < 0.96) return 400;
  if (r < 0.98) return 404;
  if (r < 0.995) return 429;
  return 500;
}

function responseTimeFor(rng: () => number, status: number): number {
  if (status === 200) return Math.round(90 + rng() * 260);
  if (status === 400) return Math.round(15 + rng() * 40);
  if (status === 404) return Math.round(10 + rng() * 30);
  if (status === 429) return Math.round(5 + rng() * 20);
  return Math.round(350 + rng() * 900);
}

// Business-hours-weighted hour picker (0-23)
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 3, 5, 7, 9, 10, 10, 9, 9, 10, 10, 9, 8, 7, 6, 5, 4, 3, 2];

function pickHour(rng: () => number, maxHour: number): number {
  const weights = HOUR_WEIGHTS.slice(0, maxHour + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let h = 0; h < weights.length; h++) {
    r -= weights[h];
    if (r <= 0) return h;
  }
  return maxHour;
}

async function main() {
  const country = await prisma.country.upsert({ where: { code: 'IN' }, update: {}, create: { code: 'IN', name: 'India' } });
  const state = await prisma.state.upsert({ where: { countryId_code: { countryId: country.id, code: '27' } }, update: {}, create: { code: '27', name: 'Maharashtra', countryId: country.id } });
  const district = await prisma.district.upsert({ where: { stateId_code: { stateId: state.id, code: '497' } }, update: {}, create: { code: '497', name: 'Nandurbar', stateId: state.id } });
  const subDistrict = await prisma.subDistrict.upsert({ where: { districtId_code: { districtId: district.id, code: '03950' } }, update: {}, create: { code: '03950', name: 'Akkalkuwa', districtId: district.id } });

  for (const [code, name] of [['525002', 'Manibeli'], ['525003', 'Dhankhedi'], ['525004', 'Chimalkhadi'], ['525005', 'Sinduri']] as const) {
    await prisma.village.upsert({ where: { subDistrictId_code: { subDistrictId: subDistrict.id, code } }, update: {}, create: { code, name, subDistrictId: subDistrict.id } });
  }

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: await bcrypt.hash(adminPassword, 10),
      businessName: 'Village API Demo',
      phoneNumber: '+91-9999999999',
      role: 'ADMIN',
      planType: 'UNLIMITED',
      status: 'ACTIVE'
    },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      businessName: 'Village API Demo',
      phoneNumber: '+91-9999999999',
      role: 'ADMIN',
      planType: 'UNLIMITED',
      status: 'ACTIVE'
    }
  });

  await prisma.userStateAccess.upsert({ where: { userId_stateId: { userId: user.id, stateId: state.id } }, update: {}, create: { userId: user.id, stateId: state.id } });

  const apiKey = 'ak_a1b2c3d4e5f67890abcdef12345678';
  const apiSecret = 'as_1234567890abcdef1234567890abcd';

  await prisma.apiKey.upsert({
    where: { key: apiKey },
    update: {
      secretHash: await bcrypt.hash(apiSecret, 10),
      label: 'Production Server',
      userId: user.id,
      isActive: true
    },
    create: {
      key: apiKey,
      secretHash: await bcrypt.hash(apiSecret, 10),
      label: 'Production Server',
      userId: user.id,
      isActive: true
    }
  });

  // ── Demo client accounts + API keys ──
  const allStates = await prisma.state.findMany({ select: { id: true } });
  const demoCallers: { id: string; apiKeyId: string; weight: number; email: string; planType: string }[] = [];
  for (const c of DEMO_CLIENTS) {
    const passwordHash = await bcrypt.hash('DemoPass123!', 10);
    const client = await prisma.user.upsert({
      where: { email: c.email },
      update: { businessName: c.businessName, planType: c.planType, role: 'CLIENT', status: 'ACTIVE' },
      create: { email: c.email, passwordHash, businessName: c.businessName, phoneNumber: '+91-9000000000', role: 'CLIENT', planType: c.planType, status: 'ACTIVE' }
    });
    const clientKey = await prisma.apiKey.upsert({
      where: { key: c.key },
      update: { secretHash: await bcrypt.hash(c.secret, 10), label: `${c.businessName} Production`, userId: client.id, isActive: true },
      create: { key: c.key, secretHash: await bcrypt.hash(c.secret, 10), label: `${c.businessName} Production`, userId: client.id, isActive: true }
    });
    if (allStates.length) {
      await prisma.userStateAccess.createMany({ data: allStates.map(s => ({ userId: client.id, stateId: s.id })), skipDuplicates: true });
    }
    demoCallers.push({ id: client.id, apiKeyId: clientKey.id, weight: c.weight, email: c.email, planType: c.planType });
  }

  // ── Demo API usage for the last 30 days (idempotent: demo callers only) ──
  const rng = mulberry32(20261015);
  const demoUserIds = demoCallers.map(c => c.id);
  await prisma.apiLog.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.usageAlert.deleteMany({ where: { userId: { in: demoUserIds } } });

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const currentHour = new Date().getUTCHours();

  // Deliberate events so the Admin → Limits & Alerts tab is demonstrative:
  //  APPROACH — one heavy day pushes a FREE user to ~95% of their daily limit
  //             → User Limit Utilisation (Critical) + "Approaching Limit" stat
  //  SPIKE    — one day far above the weekly baseline
  //             → Unusual Usage Patterns (traffic spike)
  //  ERROR    — a sustained elevated 4xx/5xx rate
  //             → Unusual Usage Patterns (high error rate)
  const APPROACH_USER = 'rahul@agritech.co.in';
  const SPIKE_USER = 'arjun@logisticsco.com';
  const ERROR_USER = 'meera@fintechlabs.io';
  const APPROACH_DAY = 1, APPROACH_VOLUME = 4760;
  const SPIKE_DAY = 3, SPIKE_VOLUME = 3200;
  const ERROR_RATIO = 0.45;

  const rows: { endpoint: string; method: string; responseTime: number; statusCode: number; query: string | null; ipAddress: string; apiKeyId: string; userId: string; createdAt: Date }[] = [];

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const dayStart = new Date(todayUtc);
    dayStart.setUTCDate(dayStart.getUTCDate() - daysAgo);
    const isToday = daysAgo === 0;
    const maxHour = isToday ? currentHour : 23;

    for (const caller of demoCallers) {
      if (!isToday && rng() > 0.8) continue;
      let volume = Math.round(caller.weight * 10 + rng() * 25);
      if (caller.email === APPROACH_USER && daysAgo === APPROACH_DAY) volume = APPROACH_VOLUME;
      if (caller.email === SPIKE_USER && daysAgo === SPIKE_DAY) volume = SPIKE_VOLUME;

      for (let i = 0; i < volume; i++) {
        const endpoint = weightedPick(rng, DEMO_ENDPOINTS);
        let status = statusFor(rng);
        if (caller.email === ERROR_USER && rng() < ERROR_RATIO) status = rng() < 0.5 ? 500 : 400;
        const createdAt = new Date(dayStart);
        createdAt.setUTCHours(pickHour(rng, maxHour), Math.floor(rng() * 60), Math.floor(rng() * 60), 0);
        rows.push({
          endpoint: endpoint.path,
          method: 'GET',
          responseTime: responseTimeFor(rng, status),
          statusCode: status,
          query: 'queries' in endpoint ? endpoint.queries[Math.floor(rng() * endpoint.queries.length)] : null,
          ipAddress: `${Math.floor(rng() * 200) + 10}.${Math.floor(rng() * 255)}.***.***`,
          apiKeyId: caller.apiKeyId,
          userId: caller.id,
          createdAt
        });
      }
    }
  }

  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.apiLog.createMany({ data: rows.slice(i, i + 1000) });
  }

  // ── Usage alerts so "Recent Usage Alerts" is populated ──
  const callerId = (email: string) => demoCallers.find(c => c.email === email)!.id;
  const sentAt = new Date();
  await prisma.usageAlert.createMany({
    data: [
      { userId: callerId(APPROACH_USER), kind: 'LIMIT_80', threshold: 80, used: 4130, limit: 5000, emailed: true, emailStatus: 'LOGGED', onDashboard: true, sentAt },
      { userId: callerId(APPROACH_USER), kind: 'LIMIT_95', threshold: 95, used: 4760, limit: 5000, emailed: true, emailStatus: 'LOGGED', onDashboard: true, sentAt },
      { userId: callerId(SPIKE_USER), kind: 'USAGE_SPIKE', threshold: 500, used: SPIKE_VOLUME, limit: 45, emailed: true, emailStatus: 'LOGGED', onDashboard: true, sentAt },
      { userId: callerId(ERROR_USER), kind: 'HIGH_ERROR_RATE', threshold: 40, used: 236, limit: 524, emailed: true, emailStatus: 'LOGGED', onDashboard: true, sentAt }
    ]
  });

  console.log({
    adminEmail,
    adminPassword,
    apiKey,
    apiSecret,
    exampleExtraKey: randomToken('ak_'),
    demoClients: DEMO_CLIENTS.map(c => c.email),
    demoApiLogs: rows.length
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
