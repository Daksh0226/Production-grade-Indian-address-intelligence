import dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const prisma = new PrismaClient();
const DATASET_DIR = join("apps/api/prisma/all-india-villages-master-list-excel/dataset");
function parseAll(){
  const files = readdirSync(DATASET_DIR).filter(f=>f.endsWith(".xls")||f.endsWith(".ods"));
  const stateMap=new Map(), districtMap=new Map(), subDistrictMap=new Map(), villageMap=new Map();
  for(const file of files){
    const isMp=file.includes("23_MADHYA");
    const wb=XLSX.readFile(join(DATASET_DIR,file));
    const sheetName=(isMp && wb.SheetNames.includes("Village Directory"))?"Village Directory":wb.SheetNames[0];
    const ws=wb.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
    for(let i=1;i<rows.length;i++){
      const r=rows[i];
      const sc=String(r[0]??"").trim(), sn=String(r[1]??"").trim();
      const dc=String(r[2]??"").trim(), dn=String(r[3]??"").trim();
      const sdc=String(r[4]??"").trim(), sdn=String(r[5]??"").trim();
      const vc=String(r[6]??"").trim(), vn=String(r[7]??"").trim();
      if(!sc||!sn) continue;
      if(!stateMap.has(sc)) stateMap.set(sc,{code:sc,name:sn});
      districtMap.set(sc+"|"+dc,{stateCode:sc,code:dc,name:dn});
      if(sdc!=="00000") subDistrictMap.set(dc+"|"+sdc,{stateCode:sc,districtCode:dc,code:sdc,name:sdn});
      if(vc && vc!=="000000" && vn) villageMap.set(sdc+"|"+vc,{stateCode:sc,districtCode:dc,subDistrictCode:sdc,code:vc,name:vn});
    }
  }
  return {stateMap,districtMap,subDistrictMap,villageMap};
}
async function main(){
  console.log("Parsing files...");
  const {villageMap}=parseAll();
  console.log("VillageMap size "+villageMap.size);
  const existingVillages=await prisma.village.findMany({select:{code:true,subDistrictId:true}});
  console.log("Existing villages in DB: "+existingVillages.length);
  // Need mapping subDistrict code -> id to compare
  const dbStates=await prisma.state.findMany({select:{id:true,code:true}});
  const stateIdByCode=new Map(dbStates.map(s=>[s.code,s.id]));
  const dbDistricts=await prisma.district.findMany({select:{id:true,code:true,stateId:true}});
  const districtIdByComposite=new Map(dbDistricts.map(d=>[d.stateId+"|"+d.code,d.id]));
  const dbSubDistricts=await prisma.subDistrict.findMany({select:{id:true,code:true,districtId:true}});
  const sdIdByComposite=new Map(dbSubDistricts.map(sd=>[sd.districtId+"|"+sd.code,sd.id]));
  const existingSet=new Set(existingVillages.map(v=> v.subDistrictId+"|"+v.code));
  let missing=[];
  for(const v of villageMap.values()){
    const sId=stateIdByCode.get(v.stateCode);
    if(!sId) continue;
    const dId=districtIdByComposite.get(sId+"|"+v.districtCode);
    if(!dId) continue;
    const sdId=sdIdByComposite.get(dId+"|"+v.subDistrictCode);
    if(!sdId) continue;
    const key=sdId+"|"+v.code;
    if(!existingSet.has(key)) missing.push({code:v.code,name:v.name,subDistrictId:sdId});
  }
  console.log("Missing villages to insert: "+missing.length);
  if(missing.length===0){ console.log("No missing villages - DB already complete"); return; }
  const BATCH=2000;
  let inserted=0;
  for(let i=0;i<missing.length;i+=BATCH){
    const batch=missing.slice(i,i+BATCH);
    await prisma.village.createMany({data:batch,skipDuplicates:true});
    inserted+=batch.length;
    console.log("Inserted "+inserted+"/"+missing.length);
  }
  const total=await prisma.village.count();
  console.log("Final villages count: "+total);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
