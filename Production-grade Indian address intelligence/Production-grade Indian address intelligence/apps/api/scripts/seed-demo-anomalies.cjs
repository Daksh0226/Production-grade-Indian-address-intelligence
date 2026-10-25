const { PrismaClient, UsageAlertKind } = require('@prisma/client');

const prisma = new PrismaClient();

function dayStart(d) {
  const x = new Date(d);
  x.setUTCHours(0,0,0,0);
  return x;
}

async function run() {
  const users = await prisma.user.findMany({ where: { role: 'CLIENT', status: 'ACTIVE' }, select: { id: true, email: true, businessName: true } });
  const byEmail = {};
  for (let i=0;i<users.length;i++) byEmail[users[i].email] = users[i];

  const rahul = byEmail['rahul@agritech.co.in'];
  const meera = byEmail['meera@fintechlabs.io'];
  const arjun = byEmail['arjun@logisticsco.com'];

  const now = new Date();
  const today = dayStart(now);
  const days = [];
  for (let i=0;i<7;i++){ const d=new Date(today); d.setUTCDate(d.getUTCDate()-i); days.push(d); }

  async function log(userId, day, count) {
    if (!userId) return;
    const logs = [];
    for (let i=0;i<count;i++) {
      const status = Math.random() < 0.02 ? 500 : 200;
      logs.push({
        userId: userId,
        endpoint: '/v1/villages/search',
        method: 'GET',
        statusCode: status,
        responseTimeMs: Math.floor(Math.random()*150)+50,
        ipMasked: '203.192.x.x',
        createdAt: new Date(day.getTime() + Math.random()*86400000)
      });
    }
    const batch = 200;
    for (let i=0;i<logs.length;i+=batch) {
      await prisma.apiLog.createMany({ data: logs.slice(i,i+batch) });
    }
  }

  if (rahul) {
    await log(rahul.id, days[6], 15);
    await log(rahul.id, days[5], 18);
    await log(rahul.id, days[4], 12);
    await log(rahul.id, days[3], 20);
    await log(rahul.id, days[2], 16);
    await log(rahul.id, days[1], 14);
    await log(rahul.id, days[0], 2500);
  }
  if (arjun) {
    await log(arjun.id, days[6], 30);
    await log(arjun.id, days[5], 28);
    await log(arjun.id, days[4], 35);
    await log(arjun.id, days[3], 32);
    await log(arjun.id, days[2], 40);
    await log(arjun.id, days[1], 25);
    await log(arjun.id, days[0], 1800);
  }
  if (meera) {
    const mk = async (day,total,errCount) => {
      if (!meera) return;
      const logs=[];
      for (let i=0;i<total;i++){
        logs.push({
          userId: meera.id,
          endpoint: '/v1/states',
          method: 'GET',
          statusCode: i<errCount?500:200,
          responseTimeMs: Math.floor(Math.random()*200)+80,
          ipMasked: '103.45.x.x',
          createdAt: new Date(day.getTime() + Math.random()*86400000)
        });
      }
      const batch=200;
      for (let i=0;i<logs.length;i+=batch) await prisma.apiLog.createMany({ data: logs.slice(i,i+batch) });
    };
    await mk(days[6],80,40);
    await mk(days[5],90,45);
    await mk(days[4],70,35);
    await mk(days[3],85,42);
    await mk(days[2],75,38);
    await mk(days[1],95,48);
    await mk(days[0],60,30);
  }

  const weekStart = new Date(days[0]);
  weekStart.setUTCDate(weekStart.getUTCDate()-7);
  async function ensureAlert2(user, kind, threshold, used, limit, message){
    if(!user) return;
    const exists = await prisma.usageAlert.findFirst({ where:{ userId:user.id, kind: kind, createdAt:{gte:weekStart} } });
    if(exists) return;
    await prisma.usageAlert.create({ data:{ userId:user.id, kind: kind, threshold: threshold, used: used, limit: limit, emailed:true, emailStatus:'LOGGED', onDashboard:true, sentAt:new Date(), message: message } });
  }
  if (rahul){ await ensureAlert2(rahul, UsageAlertKind.USAGE_SPIKE, 500, 2500, 16, 'Traffic spike: 2500 requests vs ~16/day baseline (156.3x).'); await ensureAlert2(rahul, UsageAlertKind.LIMIT_95, 95, 2500, 5000, 'Usage alert: 95% of your daily API limit reached'); }
  if (arjun){ await ensureAlert2(arjun, UsageAlertKind.USAGE_SPIKE, 500, 1800, 32, 'Traffic spike: 1800 requests vs ~32/day baseline (56.3x).'); }
  if (meera){ await ensureAlert2(meera, UsageAlertKind.HIGH_ERROR_RATE, 40, 278, 555, 'Elevated error rate: 278 of 555 requests failed (50.1%).'); }

  console.log('done');
}

run().then(function(){ return prisma.(); }).catch(function(e){ console.error(e); return prisma.().then(function(){ process.exit(1); }); });
