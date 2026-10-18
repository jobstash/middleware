import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import dotenv from 'dotenv';
const local=new URL('./.local/',import.meta.url),root=new URL('../../',import.meta.url),web=new URL('../../../webapp/',import.meta.url);
const values=JSON.parse(await readFile(new URL('environment.json',local),'utf8'));
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,...values};
const mode=process.argv[2];let args,cwd;
if(mode==='recruiters'){args=[fileURLToPath(new URL('run-recruiters.mjs',import.meta.url)),'web'];cwd=fileURLToPath(root);}
else if(mode==='recruiters-middleware'){args=[fileURLToPath(new URL('run-recruiters.mjs',import.meta.url)),'middleware'];cwd=fileURLToPath(root);}
else if(mode==='recruiters-mcp'){args=[fileURLToPath(new URL('run-recruiters.mjs',import.meta.url)),'mcp'];cwd=fileURLToPath(root);}
else if(mode==='web'){args=[fileURLToPath(new URL('node_modules/next/dist/bin/next',web)),'dev','--hostname','127.0.0.1','--port','3000'];cwd=fileURLToPath(web);}
else if(mode==='middleware'){
 Object.assign(env,dotenv.parse(await readFile(new URL('database.env',local))));
 // The loopback fixture portal issues seven-day JWTs; match the verifier's maxAge.
 env.JWT_EXPIRES_IN='7d';
 if(new URL(env.DATABASE_URL).hostname!=='127.0.0.1'||new URL(env.DATABASE_URL).port!=='55480')throw Error('Only the dedicated local snapshot is allowed');
 for(const key of Object.keys(env))if(env[key]==='')delete env[key];
 env.TS_NODE_PROJECT=fileURLToPath(new URL('tsconfig.json',root));env.TS_NODE_TRANSPILE_ONLY='1';
 args=['-r',fileURLToPath(new URL('node_modules/ts-node/register/index.js',root)),'-r',fileURLToPath(new URL('node_modules/tsconfig-paths/register.js',root)),fileURLToPath(new URL('middleware.ts',import.meta.url))];cwd=fileURLToPath(local);
}else throw Error('Use: node dev/career/run.mjs middleware|web|recruiters|recruiters-middleware|recruiters-mcp');
const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
