import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/gaubo/Desktop/Production-grade Indian address intelligence/.env' });
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
try {
  const r = await p.$queryRaw`SELECT 1 as ok`;
  console.log('DB OK', r);
  const [c, s, d, sd, v, u, k, log] = await Promise.all([
    p.country.count(), p.state.count(), p.district.count(), p.subDistrict.count(),
    p.village.count(), p.user.count(), p.apiKey.count(), p.apiLog.count()
  ]);
  console.log({ countries: c, states: s, districts: d, subdistricts: sd, villages: v, users: u, apiKeys: k, apiLogs: log });
  const mh = await p.state.findFirst({ where: { name: 'Maharashtra' } });
  console.log('Maharashtra:', mh?.id, mh?.code);
} catch (e) {
  console.log('DB FAIL:', String(e).slice(0, 500));
} finally {
  await p.$disconnect();
}
