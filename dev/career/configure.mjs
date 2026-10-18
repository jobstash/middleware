// Generate local credentials without changing either repository's .env file.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import dotenv from 'dotenv';
import { migrateDeviceRuntimeConfig } from './device-runtime-config.mjs';
const local=new URL('./.local/',import.meta.url);await mkdir(local,{recursive:true,mode:0o700});
const secret=()=>randomBytes(32).toString('hex');
let shared;try{shared=JSON.parse(await readFile(new URL('secrets.json',local),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;shared={JWT_SECRET:secret(),SESSION_SECRET:secret(),CAREER_DATA_PROTECTION_KEY:secret(),CAREER_DOCUMENT_SECRET:secret()};}
shared=migrateDeviceRuntimeConfig(shared);
delete shared.LLAMAPAY_CANDIDATE_WEBHOOK_SECRET;
await writeFile(new URL('secrets.json',local),JSON.stringify(shared),{mode:0o600});
const original=dotenv.parse(await readFile(new URL('../../.env',import.meta.url)));
const webOriginal=dotenv.parse(await readFile(new URL('../../../webapp/.env',import.meta.url)));
const services=dotenv.parse(await readFile(new URL('services.env',local)));
// Local NetworkService uses the read-only SSH transport; no warehouse credentials
// or local ClickHouse copy are provisioned to the middleware environment.
const ch={CAREER_CLICKHOUSE_URL:'',CAREER_CLICKHOUSE_USER:'',CAREER_CLICKHOUSE_PASSWORD:''};
const base={...shared,...services,...ch,NODE_ENV:'development',ENVIRONMENT:'local',MIDDLEWARE_SCHEDULE_OWNER:'0',PORT:'8085',APP_PORT:'8085',ALLOWED_ORIGINS:'http://localhost:3000,http://127.0.0.1:3000',FE_DOMAIN:'http://localhost:3000',MW_DOMAIN:'http://127.0.0.1:8085',JOBSTASH_PUBLIC_ORIGIN:'https://jobstash.local.test',CAREER_MIDDLEWARE_URL:'http://127.0.0.1:8085',CAREER_AGENT_CONCURRENCY:'50',CAREER_AGENT_MAX_STEPS:'20',CAREER_AGENT_TIMEOUT_MS:'600000',CANDIDATE_STRIPE_SECRET_KEY:'',CANDIDATE_STRIPE_WEBHOOK_SECRET:'',CANDIDATE_STRIPE_MONTHLY_PRICE_ID:'',CANDIDATE_STRIPE_YEARLY_PRICE_ID:'',DATABASE_POOL_SIZE:'60',DATABASE_STATEMENT_TIMEOUT_MS:'30000',USER_CACHE_EXPIRATION_IN_DAYS:'1',ADMIN_EMAIL:'local@example.invalid',EMAIL:'local@example.invalid',REPORT_CONTENT_TO_EMAIL:'local@example.invalid',AUTH0_AUDIENCE:'https://local.invalid',AUTH0_DOMAIN:'http://127.0.0.1:8999',ETL_DOMAIN:'http://127.0.0.1:8999',SCORER_DOMAIN:'http://127.0.0.1:8999',EV_DOMAIN:'http://127.0.0.1:8999',ORG_ADMIN_DOMAIN:'http://localhost:3000',ETL_CLIENT_ID:'local',ETL_CLIENT_SECRET:'local',INFURA_API_KEY:'local',JOB_PROMOTION_PRICE:'0',JWT_EXPIRES_IN:'1h',MAGIC_LINK_EXPIRES_IN:'1h',MAGIC_LINK_SECRET:shared.JWT_SECRET,PRIVY_APP_ID:original.PRIVY_APP_ID,PRIVY_APP_SECRET:original.PRIVY_APP_SECRET,PRIVY_WEBHOOK_KEY:'local',SCORER_API_KEY:'local',SENDGRID_API_KEY:'SG.local.disabled',SENTRY_DSN:'http://public@127.0.0.1:8999/1',SENTRY_TRACES_SAMPLE_RATE:'0',SENTRY_PROFILE_SAMPLE_RATE:'0',SKILL_THRESHOLD:'0.5',STRIPE_API_KEY:'sk_test_local_disabled',STRIPE_WEBHOOK_SECRET:'local',SWAGGER_USER:'local',SWAGGER_PASSWORD:secret(),VCDATA_API_KEY:'local',R2_ENDPOINT:'http://127.0.0.1:59000',R2_BUCKET_NAME:'career-documents',UPSTASH_REDIS_REST_URL:'http://127.0.0.1:58079',NEXT_PUBLIC_FRONTEND_URL:'http://localhost:3000',NEXT_PUBLIC_MW_URL:'http://127.0.0.1:8085',NEXT_PUBLIC_PRIVY_APP_ID:webOriginal.NEXT_PUBLIC_PRIVY_APP_ID,NEXT_PUBLIC_PRIVY_CLIENT_ID:webOriginal.NEXT_PUBLIC_PRIVY_CLIENT_ID??'',NEXT_PUBLIC_ALLOW_INDEXING:'false',NEXT_PUBLIC_GA_MEASUREMENT_ID:'',SENTRY_AUTH_TOKEN:'',NEXT_PUBLIC_SENTRY_DSN:'',NEXT_TELEMETRY_DISABLED:'1'};
// Override every inherited integration variable first; only explicitly retained
// Privy app credentials above can reach the authentication service.
for(const key of new Set([...Object.keys(original),...Object.keys(webOriginal)]))if(!(key in base))base[key]='';
await writeFile(new URL('environment.json',local),JSON.stringify(migrateDeviceRuntimeConfig(base),null,2),{mode:0o600});console.log('Private local configuration generated; original .env files unchanged');
