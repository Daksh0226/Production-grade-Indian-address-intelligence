// Spec 12.3 — data-integrity validation queries. Run after `prisma migrate deploy`
// on staging and production to verify the migration left the database healthy.
// Usage (from apps/api): DATABASE_URL=... node scripts/db-verify.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIN_ROWS = {
  State: 1,
  District: 1,
  SubDistrict: 1,
  Village: 1
};

const camel = (name) => name[0].toLowerCase() + name.slice(1);

const results = [];
const check = (label, ok, detail) => results.push({ label, ok, detail });

const run = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    check(label, false, err instanceof Error ? err.message : String(err));
  }
};

for (const [model, min] of Object.entries(MIN_ROWS)) {
  await run(`${model} row count`, async () => {
    const count = await prisma[camel(model)].count();
    check(`${model} row count`, count >= min, `${count.toLocaleString()} (min ${min})`);
  });
}

await run('User row count', async () => {
  const users = await prisma.user.count();
  check('User row count', true, `${users.toLocaleString()}`);
});

await run('No pending migrations', async () => {
  const pending = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "_prisma_migrations"
    WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`;
  const pendingN = Number(pending[0]?.n ?? 0);
  check('No pending migrations', pendingN === 0, String(pendingN));
});

await run('Migration history readable', async () => {
  const applied = await prisma.$queryRaw`
    SELECT "migration_name" FROM "_prisma_migrations"
    WHERE "rolled_back_at" IS NULL ORDER BY "started_at" DESC LIMIT 3`;
  check('Migration history readable', Array.isArray(applied) && applied.length > 0,
    (applied ?? []).map(r => r.migration_name).join(', '));
});

await prisma.$disconnect();

const failures = results.filter(r => !r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(28)} ${r.detail}`);
if (failures > 0) {
  console.log(`\nDB verification failed (${failures} check(s)).`);
  process.exit(1);
}
console.log('\nDB verification passed.');