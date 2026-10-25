import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get<T>(key);
    return val ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttlSeconds });
  } catch {}
}

export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    const val = await r.incr(key);
    if (val === 1) await r.expire(key, ttlSeconds);
    return val;
  } catch {
    return 0;
  }
}

export async function cacheDecr(key: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    return await r.decr(key);
  } catch {
    return 0;
  }
}

export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {}
}
