require('ts-node/register/transpile-only');require('tsconfig-paths/register');
const fs=require('node:fs'),dotenv=require('dotenv');
const {Auth0Service}=require('../../src/auth0/auth0.service');const {ConfigService}=require('@nestjs/config');
(async()=>{const env={...dotenv.parse(fs.readFileSync('.env')),...JSON.parse(fs.readFileSync('dev/career/.local/environment.json'))};
const cache=new Map();const service=new Auth0Service(new ConfigService(env),{get:async k=>cache.get(k),set:async(k,v)=>cache.set(k,v)});
const token=await service.getETLToken();if(!token)throw Error('Middleware could not obtain ETL token');
const url='http://127.0.0.1:8080/entity-enrichment/runs?limit=1';const authenticated=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});const unauthenticated=await fetch(url,{signal:AbortSignal.timeout(15000)});
const report={checkedAt:new Date().toISOString(),authenticated:authenticated.status,unauthenticated:unauthenticated.status,cached:cache.has('etl-token')};report.passed=authenticated.status===200&&[401,403].includes(unauthenticated.status);fs.writeFileSync('dev/career/.local/etl-auth-acceptance.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1});
