import {readFile,writeFile} from 'node:fs/promises';import {createHmac} from 'node:crypto';
const local=new URL('./.local/',import.meta.url),env=JSON.parse(await readFile(new URL('environment.json',local))),fixtures=JSON.parse(await readFile(new URL('fixtures.json',local)));
const f=fixtures.find(f=>f.key==='benchmark-us-1');
function token(f){const t=Math.floor(Date.now()/1000),a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({address:f.wallet,iat:t,exp:t+900})).toString('base64url');return`${a}.${b}.`+createHmac('sha256',env.JWT_SECRET).update(`${a}.${b}`).digest('base64url')}
async function get(path,fixture=f){const start=performance.now(),r=await fetch('http://127.0.0.1:8085/profile/'+path,{headers:{Authorization:'Bearer '+token(fixture)}});return{status:r.status,ms:Math.round(performance.now()-start),data:await r.json()}}
const docs=await get('career/cv-matches');const results=[];for(const d of docs.data){results.push(await get(`career/cv-matches/${d.id}?limit=10`));}
const foreign=await get(`career/cv-matches/${docs.data[0].id}`,fixtures.find(f=>f.key==='benchmark-us-2'));
await writeFile(new URL('cv-match-live.json',local),JSON.stringify({docs,results,foreign},null,2));console.log(JSON.stringify({documents:docs.data,results:results.map(r=>({status:r.status,ms:r.ms,total:r.data.total,jobs:r.data.jobs?.map(m=>({title:m.job.title,related:m.requirements.filter(r=>r.excerpt).length}))})),foreign:foreign.status}));
