import {readFile,writeFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
const local=new URL('./.local/',import.meta.url);
const env=JSON.parse(await readFile(new URL('environment.json',local))),fixtures=JSON.parse(await readFile(new URL('fixtures.json',local)));
function token(fixture,expired=false,forged=false){const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({address:fixture.wallet,iat:now-60,exp:expired?now-1:now+900})).toString('base64url');return `${head}.${body}.`+createHmac('sha256',forged?'invalid':env.JWT_SECRET).update(`${head}.${body}`).digest('base64url');}
async function call(fixture,path,{expired=false,forged=false}={}){const start=performance.now(),r=await fetch(`http://127.0.0.1:8085/profile/${path}`,{headers:{Authorization:`Bearer ${token(fixture,expired,forged)}`},signal:AbortSignal.timeout(30000)});let value;try{value=await r.json()}catch{value=null}return{status:r.status,ms:Math.round(performance.now()-start),value};}
const paid=fixtures.find(f=>f.key==='benchmark-us-1'),advanced=fixtures.find(f=>f.key==='advanced');
const feed=await call(paid,'stacks/best/results?page=1&limit=20');const ids=[...new Set(feed.value.jobs.map(j=>j.job.organization?.orgId).filter(Boolean))].slice(0,3);ids.push("3804");
const result=[];for(const id of ids){const r=await call(advanced,`network/${id}/paths`);result.push({organizationId:id,status:r.status,ms:r.ms,verified:r.value?.verified,available:r.value?.available,truncated:r.value?.truncated,paths:r.value?.paths?.length});}
await writeFile(new URL('network-live-proof.json',local),JSON.stringify({checkedAt:new Date().toISOString(),root:'playjok3r',results:result},null,2));console.log(JSON.stringify(result));
