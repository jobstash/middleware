// User-initiated local runtime proof, using only the explicit New Profile fixture.
import {readFile,writeFile} from 'node:fs/promises';import {createHmac,randomUUID} from 'node:crypto';
const local=new URL('./.local/',import.meta.url),env=JSON.parse(await readFile(new URL('environment.json',local),'utf8')),fixtures=JSON.parse(await readFile(new URL('fixtures.json',local),'utf8'));
const fixture=fixtures.find(f=>f.key==='new');if(!fixture||fixture.privyId!=='did:privy:career-local-new')throw Error('Explicit local fixture required');
const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({address:fixture.wallet,iat:now,exp:now+900})).toString('base64url'),token=head+'.'+payload+'.'+createHmac('sha256',env.JWT_SECRET).update(head+'.'+payload).digest('base64url');
async function call(path,body){const response=await fetch('http://127.0.0.1:8085/profile/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Local API ${path}: ${response.status}`);return response.json();}
if(process.argv[2]==='status'||process.argv[2]==='cancel'){
 const proof=JSON.parse(await readFile(new URL('connected-agent-proof.json',local),'utf8'));
 const result=await call(`agent/requests/${proof.requestId}/${process.argv[2]==='status'?'events':'cancel'}`,process.argv[2]==='cancel'?{revision:0,requestId:randomUUID()}:undefined);
 console.log(JSON.stringify(result));process.exit(0);
}
const connection=(await call('ai-connections')).find(c=>c.provider==='codex'&&c.status==='connected');if(!connection)throw Error('Connect your Codex account in the local New Profile fixture first');
const session=await call('agent/sessions',{connectionId:connection.id,revision:0,requestId:randomUUID()});
const request=await call(`agent/sessions/${session.id}/prompts`,{revision:session.revision,requestId:randomUUID(),prompt:process.env.CAREER_PROOF_PROMPT || 'Local integration check: read my Career context using the available JobStash tool. Briefly tell me whether there is existing career evidence and what I should do next. Do not create facts or change any objects.'});
const report={sessionId:session.id,requestId:request.id,provider:'codex',startedAt:new Date().toISOString()};await writeFile(new URL('connected-agent-proof.json',local),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
