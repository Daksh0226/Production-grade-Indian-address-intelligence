import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/gaubo/Desktop/Production-grade Indian address intelligence/.env' });
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

async function time(label, fn) {
  const t = Date.now();
  const r = await fn();
  console.log(label, Date.now() - t + 'ms', typeof r === 'number' ? r : '');
  return r;
}

await time('ILIKE search take25:', () => p.$queryRaw`
  SELECT v."name", count(*) OVER() as total
  FROM "Village" v WHERE v."name" ILIKE '%raipur%' LIMIT 25`);

await time('count ILIKE:', () => p.$queryRaw`SELECT count(*)::int as c FROM "Village" WHERE "name" ILIKE '%raipur%'`);

await time('planner:', () => p.$queryRaw`EXPLAIN (ANALYZE, FORMAT TEXT) SELECT v.id FROM "Village" v WHERE v."name" ILIKE '%raipur%' LIMIT 25`.then(r => { console.log(String(r[0]['QUERY PLAN']).slice(0, 600)); }));

// collision analysis on import keys
await time('dup district codes across states:', () => p.$queryRaw`
  SELECT code, count(DISTINCT "stateId")::int as states FROM "District" GROUP BY code HAVING count(DISTINCT "stateId") > 1 LIMIT 10`);

await time('dup subdistrict codes across districts:', () => p.$queryRaw`
  SELECT code, count(DISTINCT "districtId")::int as ds FROM "SubDistrict" GROUP BY code HAVING count(DISTINCT "districtId") > 1 LIMIT 10`);

const dupSd = await p.$queryRaw`SELECT count(*)::int as c FROM (SELECT code FROM "SubDistrict" GROUP BY code HAVING count(DISTINCT "districtId") > 1) t`;
console.log('subdistrict codes reused across districts:', dupSd[0].c);
const dupD = await p.$queryRaw`SELECT count(*)::int as c FROM (SELECT code FROM "District" GROUP BY code HAVING count(DISTINCT "stateId") > 1) t`;
console.log('district codes reused across states:', dupD[0].c);

await p.$disconnect();
