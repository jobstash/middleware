import {readFile} from 'node:fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';
const target=dotenv.parse(await readFile(new URL('./.local/database.env',import.meta.url))).DATABASE_URL;
const url=new URL(target);
if(url.hostname!=='127.0.0.1'||url.port!=='55480')throw Error('Guarded local snapshot only');
const db=new pg.Client({connectionString:target});await db.connect();
try {await db.query('BEGIN');const before=(await db.query('SELECT count(*)::int AS count FROM candidate_documents')).rows[0].count;
await db.query(await readFile(new URL('../../scripts/sql/career-agent-cv-matching.sql',import.meta.url),'utf8'));
await db.query(await readFile(new URL('../../scripts/sql/career-agent-screening.sql',import.meta.url),'utf8'));
for(const file of ['career-agent-screening-workflow.sql','career-agent-screening-governance.sql','candidate-document-provenance.sql'])await db.query(await readFile(new URL('../../scripts/sql/'+file,import.meta.url),'utf8'));
const after=(await db.query('SELECT count(*)::int AS count FROM candidate_documents')).rows[0].count;
if(before!==after)throw Error('Document count changed');await db.query('COMMIT');console.log(JSON.stringify({applied:true,documentsPreserved:after}));
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
