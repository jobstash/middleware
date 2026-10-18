// Separate loopback-only test portal. Never included in either release application.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const requireWeb=createRequire(new URL('../../../webapp/package.json',import.meta.url));
const {sealData}=requireWeb('iron-session');
const local=new URL('./.local/',import.meta.url);
const env=JSON.parse(await readFile(new URL('environment.json',local),'utf8'));
const origin='http://localhost:8910';
// Keep explicit loopback fixture sessions alive through multi-day local testing.
const sessionSeconds=7*24*60*60;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=content=>`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JobStash local test</title><style>body{max-width:760px;margin:5vh auto;padding:24px;background:#101114;color:#e9e9ef;font:16px/1.6 system-ui}h1{font-size:30px}a{color:#c4b5fd}button{padding:12px 18px;background:#a78bfa;border:0;border-radius:10px;cursor:pointer;font:inherit;color:#15101e}section{padding:20px;margin:20px 0;border:1px solid #444;border-radius:16px}form{display:inline-block;margin:5px}small{color:#aaa}</style><h1>JobStash local test</h1>${content}</html>`;
function jwt(address){const stamp=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({address,iat:stamp,exp:stamp+sessionSeconds})).toString('base64url'),signature=createHmac('sha256',env.JWT_SECRET).update(head+'.'+body).digest('base64url');return head+'.'+body+'.'+signature;}
http.createServer(async(req,res)=>{
 try{
  if(!['localhost:8910','127.0.0.1:8910'].includes(req.headers.host))throw Error('Local host only');
  if(req.method==='POST'&&!['http://localhost:8910','http://127.0.0.1:8910'].includes(req.headers.origin))throw Error('Local form origin required');
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://localhost:3000; frame-ancestors 'none'; base-uri 'none'");
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/'){
    let accounts=[];try{accounts=JSON.parse(await readFile(new URL('fixtures.json',local),'utf8'));}catch{}
    res.end(page(`<p>PostgreSQL is restored from the copied database dump. Network queries use the remote ClickHouse warehouse in read-only mode. These are explicit local fixtures. Free and Advanced contain synthetic facts; New Profile retains the CVs, evidence and drafts created during local acceptance. The Advanced account has a seeded synthetic membership and GitHub verification. Candidate payment operations are disabled in this local stack.</p><section><h2>Choose a test account</h2>${accounts.map(a=>`<form method="post" action="/signin/${a.key}"><button>Open ${escape(a.name)}</button></form>`).join('')||'<p>The database is still being prepared.</p>'}<p><small>Local fixture sign-in lasts seven days. Return here to switch accounts or renew your local session.</small></p></section><p>AI sign-in connects to the real provider and uses the account you choose. JobStash Advanced and an AI subscription are separate. No email is delivered from this local stack.</p><a href="http://localhost:3000">Open JobStash</a>`));return;
  }
  const signin=/^\/signin\/(free|advanced|new|benchmark-us-[12])$/.exec(url.pathname);
  if(req.method==='POST'&&signin){
    const account=JSON.parse(await readFile(new URL('fixtures.json',local),'utf8')).find(a=>a.key===signin[1]);
    if(!account)throw Error('Test account not ready');
    const sealed=await sealData({apiToken:jwt(account.wallet),expiresAt:Date.now()+sessionSeconds*1000,privyDid:account.privyId,displayName:account.name,hasVerifiedEmail:true},{password:env.SESSION_SECRET,ttl:sessionSeconds});
    res.setHeader('Set-Cookie',`jobstash-session=${sealed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}`);res.writeHead(303,{Location:'http://localhost:3000/profile/discover'}).end();return;
  }
  res.writeHead(404).end(page('<p>Page not found.</p>'));
 }catch(error){res.writeHead(400).end(page(`<p>${escape(error.message)}</p><a href="/">Return to local tests</a>`));}
}).listen(8910,'127.0.0.1',()=>console.log('Local test portal: http://localhost:8910'));
