import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const prisma = new PrismaClient();
const DATASET_DIR = join(import.meta.dirname, 'all-india-villages-master-list-excel', 'dataset');

type Row = (string | number)[];

interface FlatRecord {
  stateCode: string; stateName: string;
  districtCode: string; districtName: string;
  subDistrictCode: string; subDistrictName: string;
  villageCode: string; villageName: string;
}

function parseStandardFile(filePath: string): FlatRecord[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const records: FlatRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sc = String(r[0] ?? '').trim();
    const sn = String(r[1] ?? '').trim();
    const dc = String(r[2] ?? '').trim();
    const dn = String(r[3] ?? '').trim();
    const sdc = String(r[4] ?? '').trim();
    const sdn = String(r[5] ?? '').trim();
    const vc = String(r[6] ?? '').trim();
    const vn = String(r[7] ?? '').trim();
    if (!sc || !sn) continue;
    records.push({ stateCode: sc, stateName: sn, districtCode: dc, districtName: dn, subDistrictCode: sdc, subDistrictName: sdn, villageCode: vc, villageName: vn });
  }
  return records;
}

function parseMpFile(filePath: string): FlatRecord[] {
  // MP file has two sheets: Sheet2 (district list) and Village Directory (actual villages)
  // We must read the Village Directory sheet which has standard MDDS columns
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes('Village Directory') ? 'Village Directory' : wb.SheetNames[wb.SheetNames.length - 1];
  const ws = wb.Sheets[sheetName];
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const records: FlatRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sc = String(r[0] ?? '').trim();
    const sn = String(r[1] ?? '').trim();
    const dc = String(r[2] ?? '').trim();
    const dn = String(r[3] ?? '').trim();
    const sdc = String(r[4] ?? '').trim();
    const sdn = String(r[5] ?? '').trim();
    const vc = String(r[6] ?? '').trim();
    const vn = String(r[7] ?? '').trim();
    if (!sc || !sn) continue;
    records.push({ stateCode: sc, stateName: sn, districtCode: dc, districtName: dn, subDistrictCode: sdc, subDistrictName: sdn, villageCode: vc, villageName: vn });
  }
  return records;
}

function parseAllFiles(): FlatRecord[] {
  const files = readdirSync(DATASET_DIR).filter(f => f.endsWith('.xls') || f.endsWith('.ods'));
  console.log(`Found ${files.length} data files\n`);
  const all: FlatRecord[] = [];
  for (const file of files) {
    const isMp = file.includes('23_MADHYA');
    const records = isMp ? parseMpFile(join(DATASET_DIR, file)) : parseStandardFile(join(DATASET_DIR, file));
    const villageCount = records.filter(r => r.villageCode !== '000000' && r.villageName).length;
    console.log(`  ${records[0]?.stateName ?? file}: ${records.length} rows, ${villageCount} villages`);
    all.push(...records);
  }
  return all;
}

async function main() {
  const t0 = Date.now();
  console.log('Step 1: Parsing XLS files...');
  const records = parseAllFiles();
  console.log(`\nParsed ${records.length} total rows\n`);

  console.log('Step 2: Clearing old data...');
  await prisma.village.deleteMany();
  await prisma.subDistrict.deleteMany();
  await prisma.district.deleteMany();
  await prisma.state.deleteMany();
  await prisma.country.deleteMany();
  console.log('  Done\n');

  console.log('Step 3: Inserting country...');
  const country = await prisma.country.create({ data: { code: 'IN', name: 'India' } });

  console.log('Step 4: Building lookup maps...');

  const stateMap = new Map<string, { code: string; name: string }>();
  const districtMap = new Map<string, { stateCode: string; code: string; name: string }>();
  const subDistrictMap = new Map<string, { stateCode: string; districtCode: string; code: string; name: string }>();
  const villageMap = new Map<string, { stateCode: string; districtCode: string; subDistrictCode: string; code: string; name: string }>();

  for (const r of records) {
    const sk = `${r.stateCode}`;
    if (!stateMap.has(sk)) stateMap.set(sk, { code: r.stateCode, name: r.stateName });

    const dk = `${r.stateCode}|${r.districtCode}`;
    if (!districtMap.has(dk)) districtMap.set(dk, { stateCode: r.stateCode, code: r.districtCode, name: r.districtName });

    const sdk = `${r.districtCode}|${r.subDistrictCode}`;
    if (!subDistrictMap.has(sdk) && r.subDistrictCode !== '00000') subDistrictMap.set(sdk, { stateCode: r.stateCode, districtCode: r.districtCode, code: r.subDistrictCode, name: r.subDistrictName });

    if (r.villageCode && r.villageCode !== '000000' && r.villageName) {
      const vk = `${r.subDistrictCode}|${r.villageCode}`;
      if (!villageMap.has(vk)) villageMap.set(vk, { stateCode: r.stateCode, districtCode: r.districtCode, subDistrictCode: r.subDistrictCode, code: r.villageCode, name: r.villageName });
    }
  }

  console.log(`  States: ${stateMap.size}, Districts: ${districtMap.size}, Sub-districts: ${subDistrictMap.size}, Villages: ${villageMap.size}\n`);

  console.log('Step 5: Inserting states...');
  const stateRows = [...stateMap.values()].map(s => ({ code: s.code, name: s.name, countryId: country.id }));
  await prisma.state.createMany({ data: stateRows, skipDuplicates: true });
  const dbStates = await prisma.state.findMany({ select: { id: true, code: true } });
  const stateIdByCode = new Map(dbStates.map(s => [s.code, s.id]));
  console.log(`  Inserted ${dbStates.length} states\n`);

  console.log('Step 6: Inserting districts...');
  const districtRows = [...districtMap.values()].map(d => ({ code: d.code, name: d.name, stateId: stateIdByCode.get(d.stateCode)! })).filter(d => d.stateId);
  await prisma.district.createMany({ data: districtRows, skipDuplicates: true });
  const dbDistricts = await prisma.district.findMany({ select: { id: true, code: true, stateId: true } });
  const districtIdByComposite = new Map(dbDistricts.map(d => [`${d.stateId}|${d.code}`, d.id]));
  console.log(`  Inserted ${dbDistricts.length} districts\n`);

  console.log('Step 7: Inserting sub-districts...');
  const sdRows = [...subDistrictMap.values()].map(sd => {
    const sId = stateIdByCode.get(sd.stateCode)!;
    const dId = districtIdByComposite.get(`${sId}|${sd.districtCode}`);
    return dId ? { code: sd.code, name: sd.name, districtId: dId } : null;
  }).filter(Boolean) as { code: string; name: string; districtId: string }[];
  await prisma.subDistrict.createMany({ data: sdRows, skipDuplicates: true });
  const dbSubDistricts = await prisma.subDistrict.findMany({ select: { id: true, code: true, districtId: true } });
  const sdIdByComposite = new Map(dbSubDistricts.map(sd => [`${sd.districtId}|${sd.code}`, sd.id]));
  console.log(`  Inserted ${dbSubDistricts.length} sub-districts\n`);

  console.log('Step 8: Inserting villages (batched)...');
  const BATCH = 1000;
  const villageRows: { code: string; name: string; subDistrictId: string }[] = [];
  for (const v of villageMap.values()) {
    const sId = stateIdByCode.get(v.stateCode);
    const dId = sId ? districtIdByComposite.get(`${sId}|${v.districtCode}`) : undefined;
    const sdId = dId ? sdIdByComposite.get(`${dId}|${v.subDistrictCode}`) : undefined;
    if (sdId) villageRows.push({ code: v.code, name: v.name, subDistrictId: sdId });
  }

  let inserted = 0;
  for (let i = 0; i < villageRows.length; i += BATCH) {
    const batch = villageRows.slice(i, i + BATCH);
    await prisma.village.createMany({ data: batch, skipDuplicates: true });
    inserted += batch.length;
    if (inserted % 10000 === 0 || inserted === villageRows.length) process.stdout.write(`  ${inserted}/${villageRows.length}\r`);
  }
  console.log(`\n  Inserted ${inserted} villages\n`);

  console.log('Step 9: Verifying...');
  const [c, s, d, sd, v] = await Promise.all([
    prisma.country.count(), prisma.state.count(), prisma.district.count(),
    prisma.subDistrict.count(), prisma.village.count()
  ]);
  console.log(`  Countries: ${c}`);
  console.log(`  States: ${s}`);
  console.log(`  Districts: ${d}`);
  console.log(`  Sub-districts: ${sd}`);
  console.log(`  Villages: ${v}`);
  console.log(`\nTotal time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
