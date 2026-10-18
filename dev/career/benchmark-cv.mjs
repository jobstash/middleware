import {readFile,writeFile} from 'node:fs/promises';import {createHmac} from 'node:crypto';
const local=new URL('./.local/',import.meta.url),env=JSON.parse(await readFile(new URL('environment.json',local))),fixtures=JSON.parse(await readFile(new URL('fixtures.json',local)));
function headers(f){const t=Math.floor(Date.now()/1000),a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({address:f.wallet,iat:t,exp:t+900})).toString('base64url');return{Authorization:`Bearer ${a}.${b}.`+createHmac('sha256',env.JWT_SECRET).update(`${a}.${b}`).digest('base64url')}}
const base=process.argv[2]??'http://127.0.0.1:8085';
if(!/^http:\/\/127\.0\.0\.1:808[56]$/.test(base))throw Error('Local benchmark only');
const variants=[];
for(const key of ['benchmark-us-1','new']){const h=headers(fixtures.find(f=>f.key===key));const docs=await(await fetch(`${base}/profile/career/cv-matches`,{headers:h})).json();for(const d of docs.filter(d=>d.status==='ready').slice(0,2))variants.push({headers:h,url:`${base}/profile/career/cv-matches/${d.id}?limit=10`});}
if(variants.length<3)throw Error('At least three CVs across two fixture users required');
async function call(v){const start=performance.now(),r=await fetch(v.url,{headers:v.headers,signal:AbortSignal.timeout(30000)});const data=await r.json();return{ms:Math.round(performance.now()-start),status:r.status,total:data.total,jobs:data.jobs?.length};}
const cold=[];for(const v of variants)cold.push(await call(v));
const warm=await Promise.all(Array.from({length:50},(_,i)=>call(variants[i%variants.length]))),sorted=warm.map(r=>r.ms).sort((a,b)=>a-b);
const report={at:new Date().toISOString(),users:2,variants:variants.length,concurrency:50,firstReads:cold,warm:{p50:sorted[24],p95:sorted[47],max:sorted[49],failures:warm.filter(r=>r.status!==200||r.jobs!==10).length,minTotal:Math.min(...warm.map(r=>r.total))}};
await writeFile(new URL(base.endsWith('8086')?'cv-match-isolation-benchmark.json':'cv-match-benchmark.json',local),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.warm.failures||report.warm.p95>=1000)process.exitCode=1;
