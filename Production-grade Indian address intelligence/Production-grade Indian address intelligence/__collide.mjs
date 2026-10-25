import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const DIR = join('apps/api/prisma/all-india-villages-master-list-excel/dataset');

const files = readdirSync(DIR).filter(f => f.endsWith('.xls') || f.endsWith('.ods'));
const subDistrictKeys = new Map();   // districtCode|subDistrictCode -> states
const villageKeys = new Map();       // subDistrictCode|villageCode -> record
let totalVillageRows = 0;
let dupVillageRows = 0;
let dupSubDistrictRows = 0;
let totalRows = 0;
const stateNames = new Set();

for (const file of files) {
  const wb = XLSX.readFile(join(DIR, file));
  const isMp = file.includes('23_MADHYA');
  const sheetName = isMp && wb.SheetNames.includes('Village Directory') ? 'Village Directory' : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sc = String(r[0] ?? '').trim(), sn = String(r[1] ?? '').trim();
    const dc = String(r[2] ?? '').trim(), dn = String(r[3] ?? '').trim();
    const sdc = String(r[4] ?? '').trim(), sdn = String(r[5] ?? '').trim();
    const vc = String(r[6] ?? '').trim(), vn = String(r[7] ?? '').trim();
    if (!sc || !sn) continue;
    totalRows++;
    stateNames.add(sn);
    if (sdc && sdc !== '00000') {
      const k = dc + '|' + sdc;
      const prev = subDistrictKeys.get(k);
      if (prev && prev.stateCode !== sc) dupSubDistrictRows++;
      else if (!prev) subDistrictKeys.set(k, { stateCode: sc, name: sdn });
    }
    if (vc && vc !== '000000' && vn) {
      totalVillageRows++;
      const k = sdc + '|' + vc;
      const prev = villageKeys.get(k);
      if (prev) {
        dupVillageRows++;
        if (prev.stateCode !== sc) console.log('CROSS-STATE village collision:', k, prev.stateCode, sc, prev.name, '/', vn);
      } else villageKeys.set(k, { stateCode: sc, code: vc, name: vn });
    }
  }
}
console.log({
  files: files.length,
  totalRows,
  states: stateNames.size,
  villageRows: totalVillageRows,
  uniqueVillageKeys: villageKeys.size,
  duplicateVillageRowsDropped: dupVillageRows,
  crossStateSubDistrictCollisions: dupSubDistrictRows
});
console.log('states:', [...stateNames].sort().join(', '));
