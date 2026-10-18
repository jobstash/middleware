import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
const local=new URL('./.local/',import.meta.url);
const configs=await Promise.all(['legacy-database.env','database.env'].map(async name=>dotenv.parse(await readFile(new URL(name,local)))));
configs.forEach((env,i)=>{const url=new URL(env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.port!==['55481','55480'][i])throw Error('Guarded local databases only');});
const [source,target]=configs.map(env=>new pg.Client({connectionString:env.DATABASE_URL}));
await source.connect();await target.connect();
try {
 await target.query('BEGIN');
 for(const table of ['orgs','investors']) {
  const {rows}=await source.query(`SELECT * FROM public.${table} ORDER BY id`);
  for(let i=0;i<rows.length;i+=500){
   const batch=rows.slice(i,i+500).map(record=>({id:String(record.id),record,hash:createHash('sha256').update(JSON.stringify(record)).digest('hex')}));
   await target.query(`INSERT INTO candidate_network_legacy_records(source_database,source_table,source_id,record,content_hash)
    SELECT 'sitdownwith',$1,r.id,r.record,r.hash FROM jsonb_to_recordset($2) r(id text,record jsonb,hash text)
    ON CONFLICT(source_database,source_table,source_id) DO UPDATE SET record=EXCLUDED.record,content_hash=EXCLUDED.content_hash,reconciled_at=now()`,[table,JSON.stringify(batch)]);
  }
 }
 await target.query('COMMIT');
 console.log('Retained trusted legacy organization and investor identity mappings; staff records unchanged.');
} catch(error){await target.query('ROLLBACK');throw error;} finally{await source.end();await target.end();}
