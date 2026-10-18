import {readFile,writeFile} from 'node:fs/promises';import {createHmac} from 'node:crypto';
const local=new URL('./.local/',import.meta.url),env=JSON.parse(await readFile(new URL('environment.json',local))),fixtures=JSON.parse(await readFile(new URL('fixtures.json',local)));
function headers(key){const f=fixtures.find(f=>f.key===key),t=Math.floor(Date.now()/1000),a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({address:f.wallet,iat:t,exp:t+1800})).toString('base64url');return{'Content-Type':'application/json',Authorization:`Bearer ${a}.${b}.`+createHmac('sha256',env.JWT_SECRET).update(`${a}.${b}`).digest('base64url')}}
async function call(path,body,key='new'){const r=await fetch('http://127.0.0.1:8085/profile/'+path,{headers:headers(key),...(body?{method:'POST',body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(`${r.status}: ${JSON.stringify(value)}`);return value;}
const doc='d8a06fa5-9481-4f89-8c4b-33b3102f48f4',connections=await call('ai-connections'),account=connections.find(c=>c.provider==='codex'&&c.status==='connected');if(!account)throw Error('The fixture needs its own connected Codex account');
const mode=process.argv[2]??'status';
if(mode==='start')console.log(JSON.stringify(await call(`career/screening/${doc}/start`,{connectionId:account.id})));
let status=await call(`career/screening/${doc}?limit=10`);
if(mode==='resume'&&status.run)await call(`career/screening/runs/${status.run.id}/resume`,{});
if(mode==='pause'&&status.run)await call(`career/screening/runs/${status.run.id}/pause`,{});
if(mode==='watch')for(let i=0;i<150;i++){status=await call(`career/screening/${doc}?limit=10`);if(status.run?.assessed>=2||status.run?.status!=='running')break;await new Promise(r=>setTimeout(r,4000));}
if(mode==='watch'&&status.run?.status==='running')await call(`career/screening/runs/${status.run.id}/pause`,{});
status=await call(`career/screening/${doc}?limit=10`);
const report={checkedAt:new Date().toISOString(),run:status.run,jobs:status.jobs.map(j=>({id:j.id,relationshipId:j.relationshipId,title:j.title,metrics:j.assessment.metric_assessments.length,overall:j.assessment.overall_score,coverage:j.assessment.evidence_coverage,recommendation:j.assessment.recommendation}))};
await writeFile(new URL('screening-proof.json',local),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
