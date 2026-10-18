/** Local test entry point. Never imported by src/main.ts or the release build. */
import 'reflect-metadata';
import {Test} from '@nestjs/testing';
import {ValidationPipe} from '@nestjs/common';
import {NestExpressApplication} from '@nestjs/platform-express';
import {AppModule} from '../../src/app.module';
import {PrivyService} from '../../src/auth/privy/privy.service';
import {MailService} from '../../src/mail/mail.service';
import {ConfigService} from '@nestjs/config';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NetworkService} from '../../src/career-agent/network.service';
if(process.env.NODE_ENV!=='development'||new URL(process.env.DATABASE_URL!).hostname!=='127.0.0.1'||new URL(process.env.DATABASE_URL!).port!=='55480')throw Error('Local snapshot only');
async function main(){
 const module=await Test.createTestingModule({imports:[AppModule]})
  .overrideProvider(MailService).useValue(new Proxy({}, {get:(_target,key)=>key==='then'?undefined:async()=>({success:true,message:'Email retained in local test; no delivery'})}))
  .overrideProvider(PrivyService).useFactory({inject:[ConfigService],factory:(config:ConfigService)=>{
    const real=new PrivyService(config),original=real.getUserById.bind(real);
    real.getUserById=async(id:string)=>{if(!id.startsWith('did:privy:career-local-'))return original(id);const fixtures=JSON.parse(readFileSync(join(__dirname,'.local/fixtures.json'),'utf8'));const fixture=fixtures.find((f:{privyId:string})=>f.privyId===id);if(!fixture)throw Error('Unknown local fixture');return {id,linkedAccounts:fixture.github?[{type:'github_oauth',subject:'local-fixture',username:fixture.github,verifiedAt:new Date()}]:[]} as Awaited<ReturnType<PrivyService['getUserById']>>;};return real;
  }}).compile();
 (module.get(NetworkService) as unknown as {query:unknown}).query=require('./remote-clickhouse.cjs').query;
 const app=module.createNestApplication<NestExpressApplication>({rawBody:true});app.useBodyParser('json',{limit:'12mb'});app.useGlobalPipes(new ValidationPipe());app.enableCors({credentials:true,origin:['http://localhost:3000','http://127.0.0.1:3000']});await app.listen(8085,'127.0.0.1');console.log('Local middleware: http://127.0.0.1:8085 (email delivery and candidate billing disabled)');
}
void main();
