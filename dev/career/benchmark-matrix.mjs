import {readFile,writeFile} from 'node:fs/promises';
import {createHmac,randomUUID} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
const local=new URL('./.local/',import.meta.url);
const base=process.argv[2] ?? 'http://127.0.0.1:8085';
if(!['http://127.0.0.1:8085','http://127.0.0.1:8086'].includes(base))throw Error('Local benchmark target only');
const env=JSON.parse(await readFile(new URL('environment.json',local),'utf8'));
const dbEnv=dotenv.parse(await readFile(new URL('database.env',local)));
const target=new URL(dbEnv.DATABASE_URL);if(target.hostname!=='127.0.0.1'||target.port!=='55480')throw Error('Guarded local snapshot only');
const db=new pg.Client({connectionString:dbEnv.DATABASE_URL});await db.connect();
const fixtures=JSON.parse(await readFile(new URL('fixtures.json',local),'utf8'));
const matrix=[];
try {
 for(let i=0;i<2;i++) {
  const fixture={key:`benchmark-us-${i+1}`,name:`Local Benchmark US ${i+1}`,wallet:`0x00000000000000000000000000000000cb00000${i+1}`,privyId:`did:privy:career-local-benchmark-us-${i+1}`,github:null};
  await db.query('BEGIN');
  const {rows:[owner]}=await db.query(`INSERT INTO graph_nodes(label,labels,node_key,properties) VALUES('User',ARRAY['User'],$1,$2) ON CONFLICT(label,node_key) DO UPDATE SET node_key=EXCLUDED.node_key RETURNING id`,[`career-local:${fixture.key}`,JSON.stringify({wallet:fixture.wallet,name:fixture.name,privyId:fixture.privyId,availableForWork:true})]);
  fixture.owner=owner.id;
  await db.query(`INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties) SELECT $1,id,'HAS_PERMISSION','','{}' FROM graph_nodes WHERE label='UserPermission' AND node_key='career-local:USER' ON CONFLICT DO NOTHING`,[owner.id]);
  await db.query(`INSERT INTO user_job_preferences(user_node_id,work_modes,residence_country,attendance_preference) VALUES($1,ARRAY['remote'],'US','remote_only') ON CONFLICT DO NOTHING`,[owner.id]);
  await db.query(`INSERT INTO candidate_career_profiles(user_node_id) VALUES($1) ON CONFLICT DO NOTHING`,[owner.id]);
  await db.query(`INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,status,paid_until) VALUES($1,$2,'https://example.invalid/local-benchmark','active',now()+interval '1 month') ON CONFLICT DO NOTHING`,[`local-fixture-${fixture.key}`,owner.id]);
  await db.query('COMMIT');
  if(!fixtures.some(f=>f.key===fixture.key))fixtures.push(fixture);
  const stamp=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({address:fixture.wallet,iat:stamp,exp:stamp+900})).toString('base64url');
  const token=`${head}.${body}.`+createHmac('sha256',env.JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const stacks=await fetch(base+'/profile/stacks',{headers}).then(r=>r.json());
  let saved=stacks.stacks?.find(s=>s.name==='Local benchmark salary filter');
  if(!saved){const r=await fetch(base+'/profile/stacks',{method:'POST',headers,body:JSON.stringify({requestId:randomUUID(),revision:0,name:'Local benchmark salary filter',intent:'best',pinned:false,classifications:[],workModes:['remote'],filters:{minSalaryRange:50000}})});if(!r.ok)throw Error(`Fixture stack creation failed: ${r.status}`);saved=await r.json();}
  for(const id of ['best','fresh',saved.id])matrix.push({fixture:fixture.key,stack:id,headers});
 }
 await writeFile(new URL('fixtures.json',local),JSON.stringify(fixtures,null,2),{mode:0o600});
 async function sample(test){const start=performance.now();try{const r=await fetch(`${base}/profile/stacks/${test.stack}/results?page=1&limit=20`,{headers:test.headers,signal:AbortSignal.timeout(30000)});const value=await r.json();return {fixture:test.fixture,stack:test.stack,ms:Math.round(performance.now()-start),status:r.status,jobs:value.jobs?.length??0,total:value.total??0,rankingVersion:value.rankingVersion};}catch{return {fixture:test.fixture,stack:test.stack,ms:Math.round(performance.now()-start),status:0,jobs:0};}}
 const cold=[];for(const test of matrix)cold.push(await sample(test));
 const warm=await Promise.all(Array.from({length:50},(_,i)=>sample(matrix[i%matrix.length])));
 const sorted=warm.map(s=>s.ms).sort((a,b)=>a-b);
 const report={measuredAt:new Date().toISOString(),concurrency:50,users:2,stackVariants:3,cold,warm:{p50Ms:sorted[24],p95Ms:sorted[47],maxMs:sorted[49],failures:warm.filter(s=>s.status!==200).length,minJobs:Math.min(...warm.map(s=>s.jobs))}};
 report.accepted=report.warm.failures===0&&report.warm.p95Ms<1000&&report.warm.minJobs>0;
 await writeFile(new URL(base.endsWith('8086')?'feed-failure-isolation.json':'feed-matrix-benchmark.json',local),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));if(!report.accepted)process.exitCode=1;
} finally{await db.end();}
