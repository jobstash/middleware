import {readFile,writeFile} from 'node:fs/promises';import {createHmac} from 'node:crypto';
const local=new URL('./.local/',import.meta.url),env=JSON.parse(await readFile(new URL('environment.json',local))),fixtures=JSON.parse(await readFile(new URL('fixtures.json',local)));
function headers(key){const f=fixtures.find(f=>f.key===key),t=Math.floor(Date.now()/1000),a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({address:f.wallet,iat:t,exp:t+1800})).toString('base64url');return{'Content-Type':'application/json',Authorization:`Bearer ${a}.${b}.`+createHmac('sha256',env.JWT_SECRET).update(`${a}.${b}`).digest('base64url')}}
async function call(path,body,key='new'){const r=await fetch('http://127.0.0.1:8085/profile/'+path,{headers:headers(key),...(body?{method:'POST',body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(`${r.status}: ${JSON.stringify(value)}`);return value;}
const doc='d8a06fa5-9481-4f89-8c4b-33b3102f48f4',connections=await call('ai-connections'),account=connections.find(c=>c.provider==='codex'&&c.status==='connected');if(!account)throw Error('The fixture needs its own connected Codex account');

const metrics=['overall_score','location_fit','technical_fit','factual_seniority_fit','culture_fit_company_size','culture_fit_company_phase','fitness_for_role','potential_to_grow_into_role'];
let checks=0;
for(const sort of metrics)for(const direction of ['asc','desc']) {
 const all=await call(`career/screening/${doc}?limit=50&sort=${sort}&direction=${direction}`);
 const score=j=>sort==='overall_score'?(j.assessment.evidence_coverage?j.assessment.overall_score:null):j.assessment.metric_assessments.find(m=>m.metric===sort)?.status==='assessed'?j.assessment[sort]:null;
 for(let i=1;i<all.jobs.length;i++){const a=score(all.jobs[i-1]),b=score(all.jobs[i]);if(a===null&&b!==null||a!==null&&b!==null&&(direction==='asc'?a>b:a<b))throw Error('Wrong sort '+sort+direction);}
 for(let page=1;page<=Math.min(2,all.jobs.length);page++){const one=await call(`career/screening/${doc}?limit=1&page=${page}&sort=${sort}&direction=${direction}`);if(one.jobs[0].id!==all.jobs[page-1].id)throw Error('Pagination sort mismatch');}
 checks++;
}
for(const f of fixtures.filter(f=>f.key!=='new')){const r=await fetch(`http://127.0.0.1:8085/profile/career/screening/${doc}?sort=technical_fit`,{headers:headers(f.key)});if(r.ok)throw Error('Foreign assessment disclosed');checks++;}
const samples=await Promise.all(Array.from({length:50},async(_,i)=>{const t=performance.now();await call(`career/screening/${doc}?limit=10&sort=${metrics[i%metrics.length]}&direction=${i%2?'asc':'desc'}`);return performance.now()-t;}));samples.sort((a,b)=>a-b);
console.log(JSON.stringify({checks,concurrency:50,failures:0,warmP95Ms:Math.round(samples[47])}));
