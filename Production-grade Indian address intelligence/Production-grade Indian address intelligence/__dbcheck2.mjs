import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/gaubo/Desktop/Production-grade Indian address intelligence/.env' });
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const states = await p.state.findMany({ orderBy: { code: 'asc' }, select: { code: true, name: true, _count: { select: { districts: true } } } });
console.log(states.map(s => `${s.code} ${s.name} (${s._count.districts})`).join('\n'));
const users = await p.user.findMany({ select: { email: true, role: true, planType: true, status: true, _count: { select: { apiKeys: true } } } });
console.log(JSON.stringify(users, null, 1));
await p.$disconnect();
