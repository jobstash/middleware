import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
const local = new URL('./.local/',import.meta.url);
const root = new URL('../../',import.meta.url);
const frontend = new URL('../../../recruiters.rip/',import.meta.url);
const values = JSON.parse(await readFile(new URL('recruiters-environment.json',local),'utf8'));
const mode = process.argv[2];
if(!['middleware','web','mcp'].includes(mode))throw Error('Use middleware, web or mcp; inference runs on the user device');
const target = new URL(values.DATABASE_URL);
if(target.hostname!=='127.0.0.1'||target.port!=='55480'||target.pathname!=='/recruiters_rip_local'||values.LOCAL_ONLY!=='true'||values.LOCAL_BACKEND_FIXTURES!=='true')throw Error('Dedicated local product configuration required');
const port = mode==='middleware'?8086:mode==='mcp'?3334:Number(new URL(values.APP_ORIGIN).port);
await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(Error(`Port ${port} is occupied; reuse the existing service or configure another local port.`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
const webKeys = new Set(['NODE_ENV','APP_ORIGIN','MW_URL','LOCAL_ONLY','LOCAL_BACKEND_FIXTURES','SESSION_SECRET','LOCAL_AUTH_FIXTURES','LOCAL_AUTH_ACCOUNT','LOCAL_JWT_SECRET','NEXT_PUBLIC_PRIVY_APP_ID','NEXT_PUBLIC_PRIVY_CLIENT_ID','PRIVY_APP_SECRET','NEXT_PUBLIC_BROWSER_EXTENSION_ID','COMPANION_INSTALLER_PATH']);
const mcpKeys = new Set(['NODE_ENV','LOCAL_ONLY','MCP_RESOURCE_URL','MCP_ISSUER_URL']);
const forbidden = new Set(['CAREER_CREDENTIAL_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GROK_API_KEY','CODEX_ACCESS_TOKEN']);
const serviceValues = Object.fromEntries(Object.entries(values).filter(([key]) =>
  !forbidden.has(key) && !key.startsWith('CAREER_WORKER_') &&
  (mode === 'middleware' || (mode === 'web' ? webKeys : mcpKeys).has(key))));
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,...serviceValues,NEXT_TELEMETRY_DISABLED:'1',RECRUITERS_DEVICE_ONLY:'true',RECRUITERS_LOCAL_MCP:'true'};
for(const key of Object.keys(env))if(env[key]==='')delete env[key];
if(mode==='web'&&!env.COMPANION_INSTALLER_PATH)env.COMPANION_INSTALLER_PATH=fileURLToPath(new URL('companion/dist/local/Recruiters.rip-Companion-macOS-arm64.zip',frontend));
env.NODE_OPTIONS = `--require=${fileURLToPath(new URL('local-network.cjs', import.meta.url))}`;
if(mode==='mcp'){
 env.MCP_BACKEND_URL=`${values.MW_URL}/mcp/data`;
 env.MCP_ALLOWED_ORIGINS=values.APP_ORIGIN;
 env.PORT=String(port);env.HOST='127.0.0.1';
}
let args,cwd;
if(mode==='middleware'){
 env.TS_NODE_PROJECT=fileURLToPath(new URL('tsconfig.json',root));env.TS_NODE_TRANSPILE_ONLY='1';
 args=['-r',fileURLToPath(new URL('node_modules/ts-node/register/index.js',root)),'-r',fileURLToPath(new URL('node_modules/tsconfig-paths/register.js',root)),fileURLToPath(new URL('recruiters-middleware.ts',import.meta.url))];cwd=fileURLToPath(local);
}else if(mode==='mcp'){args=[fileURLToPath(new URL('../../../mcp/packages/mcp-server/dist/src/remote-runner.js',import.meta.url))];cwd=fileURLToPath(root);}
else{args=[fileURLToPath(new URL('node_modules/next/dist/bin/next',frontend)),'dev','--hostname','127.0.0.1','--port',String(port)];cwd=fileURLToPath(frontend);}
const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
