// Ephemeral local acceptance server. Production source/configuration is untouched.
import {readFile,writeFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import dotenv from 'dotenv';
const local=new URL('./.local/',import.meta.url),root=new URL('../../',import.meta.url);
const values=JSON.parse(await readFile(new URL('environment.json',local))),db=dotenv.parse(await readFile(new URL('database.env',local)));
const text=await readFile(new URL('middleware.ts',import.meta.url),'utf8');
const entry=text.replaceAll("from '../../","from '../../../").replace("join(__dirname,'.local/fixtures.json')","join(__dirname,'fixtures.json')").replace("require('./remote-clickhouse.cjs').query","async()=>{throw new Error('Injected warehouse outage for local acceptance')}").replace("app.listen(8085,","app.listen(8086,");
const path=new URL('failure-isolation-entry.ts',local);await writeFile(path,entry);
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,...values,...db,TS_NODE_PROJECT:fileURLToPath(new URL('tsconfig.json',root)),TS_NODE_TRANSPILE_ONLY:'1'};
for(const key of Object.keys(env))if(env[key]==='')delete env[key];
const child=spawn(process.execPath,['-r',fileURLToPath(new URL('node_modules/ts-node/register',root)),'-r',fileURLToPath(new URL('node_modules/tsconfig-paths/register.js',root)),fileURLToPath(path)],{cwd:fileURLToPath(local),env,stdio:['ignore','ignore','ignore']});
try{let ready=false;for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:8086/health');if(r.status<500){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Isolation server unavailable');
 const code=await new Promise(resolve=>{const run=spawn(process.execPath,[process.argv.includes('--cv')?'dev/career/benchmark-cv.mjs':'dev/career/benchmark-matrix.mjs','http://127.0.0.1:8086'],{cwd:fileURLToPath(root),stdio:'inherit'});run.on('exit',resolve);});if(code!==0)throw Error('Failure isolation benchmark failed');
 console.log('Feed benchmark passed with warehouse reads throwing.');
}finally{child.kill('SIGTERM');}
