// Invoke only the existing embedding worker, never cron/email or customer fx credentials.
const fs=require('node:fs'),dotenv=require('dotenv');
const env={...JSON.parse(fs.readFileSync('dev/career/.local/environment.json')), ...dotenv.parse(fs.readFileSync('dev/career/.local/database.env'))};
const url=new URL(env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.port!=='55480')throw Error('Dedicated local snapshot only');
const {PostgresService}=require('../../src/postgres/postgres.service');
const {RecommendationEmbeddingRepository}=require('../../src/postgres/recommendation-embedding.repository');
const {RecommendationEmbeddingService}=require('../../src/auth/profile/recommendation-embedding.service');
const {ConfigService}=require('@nestjs/config');
(async()=>{
 const db=new PostgresService({url:env.DATABASE_URL,applicationName:'local-career-sentence-worker',maxConnections:8,statementTimeoutMs:30000});await db.onModuleInit();
 try{process.env.MIDDLEWARE_SCHEDULE_OWNER='1';await new RecommendationEmbeddingService(new RecommendationEmbeddingRepository(db),new ConfigService(env)).refresh();}
 finally{await db.onModuleDestroy();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
