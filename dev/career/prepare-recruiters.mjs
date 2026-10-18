// Creates the local product from the complete backup; never resets an existing database.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { migrateDeviceRuntimeConfig, assertProviderSecretsRetired } from './device-runtime-config.mjs';
import { restoreRecruitersDatabase } from './restore-recruiters-database.mjs';
const local = new URL('./.local/', import.meta.url);
const source = dotenv.parse(await readFile(new URL('database.env', local)));
const sourceUrl = new URL(source.DATABASE_URL);
if(sourceUrl.hostname!=='127.0.0.1'||sourceUrl.port!=='55480')throw Error('Dedicated loopback database required');
const target = new URL(sourceUrl); target.pathname='/recruiters_rip_local';
const adminUrl = new URL(sourceUrl);adminUrl.pathname='/postgres';
const admin = new pg.Client({connectionString:adminUrl.href}); await admin.connect();
let needsRestore;
try {
 const {rows}=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',['recruiters_rip_local']);
 needsRestore=!rows.length;
} finally {await admin.end();}
if(needsRestore)await restoreRecruitersDatabase('recruiters_rip_local');
const db=new pg.Client({connectionString:target.href});await db.connect();
const fixtureAccounts=[{key:'free',displayName:'Local Free',privyDid:'did:privy:recruiters-local-free',address:'0x00000000000000000000000000000000ca100001'},{key:'advanced',displayName:'Local Advanced',privyDid:'did:privy:recruiters-local-advanced',address:'0x00000000000000000000000000000000ca100002'},{key:'new',displayName:'Local New Account',privyDid:'did:privy:recruiters-local-new',address:'0x00000000000000000000000000000000ca100003'}];
try {
 for(const file of ['career-agent-provider-api.sql','candidate-capabilities.sql','candidate-documents.sql','candidate-introductions.sql','career-evidence-usability.sql','career-agent-draft-editing.sql','career-agent-enrichment.sql','career-agent-cv-baseline.sql','candidate-model-selection.sql','candidate-geographic-eligibility.sql','career-agent-screening-workflow.sql','career-agent-screening-governance.sql','candidate-document-provenance.sql','candidate-browser-applications.sql','candidate-device-execution.sql','candidate-voice.sql'])await db.query(await readFile(new URL('../../scripts/sql/'+file,import.meta.url),'utf8'));
 await assertProviderSecretsRetired(db);
 const {rows:[permission]}=await db.query("INSERT INTO graph_nodes(label,labels,node_key,properties) VALUES('UserPermission',ARRAY['UserPermission'],'recruiters-local:USER','{\"name\":\"USER\"}') ON CONFLICT(label,node_key) DO UPDATE SET properties=EXCLUDED.properties RETURNING id");
 for(const fixture of fixtureAccounts){
  const properties={wallet:fixture.address,name:fixture.displayName,privyId:fixture.privyDid,cryptoNative:false,cryptoAdjacent:false,email:fixture.key+'@example.invalid',available:false};
  const {rows:[owner]}=await db.query("INSERT INTO graph_nodes(label,labels,node_key,properties) VALUES('User',ARRAY['User'],$1,$2) ON CONFLICT(label,node_key) DO UPDATE SET properties=graph_nodes.properties RETURNING id",['recruiters-local:'+fixture.key,JSON.stringify(properties)]);
  await db.query("INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties) VALUES($1,$2,'HAS_PERMISSION','','{}') ON CONFLICT DO NOTHING",[owner.id,permission.id]);
  await db.query('INSERT INTO candidate_career_profiles(user_node_id) VALUES($1) ON CONFLICT DO NOTHING',[owner.id]);
  if(fixture.key==='advanced')await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,status,paid_until) VALUES('recruiters-local-advanced',$1,'http://127.0.0.1:8912/pay/local-fixture','active',now()+interval '1 month') ON CONFLICT(charge_id) DO NOTHING",[owner.id]);
 }
} finally {await db.end();}
const inherited=JSON.parse(await readFile(new URL('environment.json',local),'utf8'));
let saved={};try{saved=JSON.parse(await readFile(new URL('recruiters-environment.json',local),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const frontendOrigin = 'http://127.0.0.1:3001';
const storage=new URL('recruiters-documents/',local);await mkdir(storage,{recursive:true,mode:0o700});
const protectedConfig = migrateDeviceRuntimeConfig({ ...inherited, ...saved,
 CAREER_DATA_PROTECTION_KEY: saved.CAREER_DATA_PROTECTION_KEY || saved.CAREER_CREDENTIAL_KEY || inherited.CAREER_DATA_PROTECTION_KEY || inherited.CAREER_CREDENTIAL_KEY });
const values={...protectedConfig,NODE_ENV:'development',LOCAL_ONLY:'true',LOCAL_BACKEND_FIXTURES:'true',APP_ORIGIN:frontendOrigin,RECRUITERS_PUBLIC_ORIGIN:frontendOrigin,MW_URL:'http://127.0.0.1:8086',DATABASE_URL:target.href,APP_PORT:'8086',JWT_EXPIRES_IN:'7d',SESSION_SECRET:saved.SESSION_SECRET||randomBytes(48).toString('hex'),CAREER_DOCUMENT_ID_KEY:saved.CAREER_DOCUMENT_ID_KEY||randomBytes(32).toString('hex'),CAREER_DOCUMENT_STORAGE:'local',CAREER_DOCUMENT_LOCAL_DIRECTORY:fileURLToPath(storage),LOCAL_AUTH_FIXTURES:fileURLToPath(new URL('recruiters-fixtures.json',local)),LOCAL_JWT_SECRET:inherited.JWT_SECRET,MCP_RESOURCE_URL:'http://127.0.0.1:3334/mcp',MCP_ISSUER_URL:'http://127.0.0.1:8086/mcp',MCP_FRONTEND_URL:frontendOrigin,MCP_ADVANCED_MONTHLY_LIMIT:'1000',CAREER_MIDDLEWARE_URL:'http://127.0.0.1:8086',MIDDLEWARE_SCHEDULE_OWNER:'0',SENTRY_DSN:'',R2_ACCESS_KEY_ID:'',R2_SECRET_ACCESS_KEY:'',R2_ENDPOINT:'',R2_BUCKET_NAME:''};
values.CAREER_DOCUMENT_LOCAL_DIRECTORY = await realpath(storage);
values.LOCAL_AUTH_ACCOUNT = saved.LOCAL_AUTH_ACCOUNT || 'advanced';
values.APP_ORIGIN = frontendOrigin;
values.RECRUITERS_PUBLIC_ORIGIN = frontendOrigin;
values.MCP_FRONTEND_URL = frontendOrigin;
await writeFile(new URL('recruiters-fixtures.json',local),JSON.stringify({accounts:fixtureAccounts},null,2),{mode:0o600});
await writeFile(new URL('recruiters-environment.json',local),JSON.stringify(values,null,2),{mode:0o600});
console.log('Prepared isolated recruiters_rip_local database, local document storage and private fixture configuration. No production changes.');
