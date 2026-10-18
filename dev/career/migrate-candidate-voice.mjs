import { readFile } from 'node:fs/promises';
import pg from 'pg';
const env=JSON.parse(await readFile(new URL('./.local/recruiters-environment.json',import.meta.url),'utf8'));
const url=new URL(env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='55480'||url.pathname!=='/recruiters_rip_local')throw Error('Dedicated local product database required');
const db=new pg.Client({connectionString:url.href});await db.connect();
try{
 for(const file of ['candidate-device-execution.sql','candidate-voice.sql'])await db.query(await readFile(new URL('../../scripts/sql/'+file,import.meta.url),'utf8'));
 console.log('Device-owned voice lifecycle schema applied.');
}finally{await db.end();}
