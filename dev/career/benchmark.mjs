// Measures the actual loopback API against the restored local SQL snapshot.
import {readFile,writeFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
const local=new URL('./.local/',import.meta.url),env=JSON.parse(await readFile(new URL('environment.json',local),'utf8'));
const fixtures=JSON.parse(await readFile(new URL('fixtures.json',local),'utf8'));
const fixture=fixtures.find(row=>row.key==='advanced');
const stamp=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({address:fixture.wallet,iat:stamp,exp:stamp+300})).toString('base64url');
const token=header+'.'+body+'.'+createHmac('sha256',env.JWT_SECRET).update(header+'.'+body).digest('base64url');
async function sample(){const start=performance.now();const response=await fetch('http://127.0.0.1:8085/profile/stacks/best/results?page=1&limit=20',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const value=await response.json();return {ms:Math.round(performance.now()-start),status:response.status,jobs:value.jobs?.length??null};}
const cold=await sample();if(cold.status!==200)throw Error('Local benchmark request failed: '+cold.status);
await sample();const samples=await Promise.all(Array.from({length:50},sample));const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b);
const report={measuredAt:new Date().toISOString(),surface:'middleware paid best stack',concurrency:50,coldMs:cold.ms,p50Ms:sorted[24],p95Ms:sorted[47],maxMs:sorted[49],failures:samples.filter(s=>s.status!==200).length,minJobs:Math.min(...samples.map(s=>s.jobs??0))};
await writeFile(new URL('feed-benchmark.json',local),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));if(report.failures||report.p95Ms>=1000)process.exitCode=1;
