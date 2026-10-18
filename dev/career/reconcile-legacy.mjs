import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
const local=new URL('./.local/',import.meta.url);
const sourceEnv=dotenv.parse(await readFile(new URL('legacy-database.env',local)));
const targetEnv=dotenv.parse(await readFile(new URL('database.env',local)));
for(const [env,port] of [[sourceEnv,'55481'],[targetEnv,'55480']]){const url=new URL(env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.port!==port)throw Error('Reconciliation is local-only');}
const source=new pg.Client({connectionString:sourceEnv.DATABASE_URL}),target=new pg.Client({connectionString:targetEnv.DATABASE_URL});
await source.connect();await target.connect();
const tables=['staff','staff_socials','person_suppressions','org_denylist','identity_links','affiliations','org_edit_proposals','org_socials','investor_socials','project_socials'];
const report={source:'sitdownwith',reconciledAt:new Date().toISOString(),tables:{},unlinkedStaff:0};
try{
 await target.query(await readFile(new URL('../../scripts/sql/career-agent-network.sql',import.meta.url),'utf8'));
 await target.query('BEGIN');
 for(const table of tables){
  const {rows}=await source.query(`SELECT * FROM public.${table} ORDER BY id`);
  for(const row of rows){const serialized=JSON.stringify(row),digest=createHash('sha256').update(serialized).digest('hex');await target.query('INSERT INTO candidate_network_legacy_records(source_database,source_table,source_id,record,content_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_database,source_table,source_id) DO UPDATE SET record=EXCLUDED.record,content_hash=EXCLUDED.content_hash,reconciled_at=now()',['sitdownwith',table,row.id,serialized,digest]);}
  const {rows:check}=await target.query('SELECT count(*)::int AS count FROM candidate_network_legacy_records WHERE source_database=$1 AND source_table=$2',['sitdownwith',table]);
  if(check[0].count!==rows.length)throw Error('Legacy row count mismatch');
  const {rows:archived}=await target.query('SELECT source_id,content_hash FROM candidate_network_legacy_records WHERE source_database=$1 AND source_table=$2',['sitdownwith',table]);
  const hashes=new Map(archived.map(r=>[String(r.source_id),r.content_hash]));
  for(const row of rows)if(hashes.get(String(row.id))!==createHash('sha256').update(JSON.stringify(row)).digest('hex'))throw Error('Legacy content checksum mismatch');
  report.tables[table]={rows:rows.length,verifiedHashes:archived.length};
 }
 const {rows:staff}=await source.query(`SELECT s.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',ss.kind,'value',ss.value)) FROM staff_socials ss WHERE ss.staff_id=s.id),'[]'::jsonb) AS socials FROM staff s`);
 for(const row of staff){
  if(!row.github_login){report.unlinkedStaff++;continue;}
  const login=row.github_login.toLowerCase();if(!/^[a-z0-9][a-z0-9-]{0,38}$/.test(login))continue;
  const contacts=row.socials.filter(c=>['linkedin','twitter','telegram','warpcast'].includes(c.kind)&&typeof c.value==='string').map(c=>({...c,source:`SitDownWith staff ${row.id}; ${row.source}`,asOf:row.updated_at}));
  const annotations={staffId:row.id,name:row.name,title:row.job_title,source:row.source,organizationId:row.org_id,investorId:row.investor_id,asOf:row.updated_at};
  await target.query(`INSERT INTO candidate_network_metadata(login,contacts,sources,annotations) VALUES($1,$2,$3,$4) ON CONFLICT(login) DO UPDATE SET contacts=(SELECT COALESCE(jsonb_agg(DISTINCT x),'[]'::jsonb) FROM jsonb_array_elements(candidate_network_metadata.contacts||EXCLUDED.contacts) x),annotations=(SELECT COALESCE(jsonb_agg(DISTINCT x),'[]'::jsonb) FROM jsonb_array_elements(candidate_network_metadata.annotations||EXCLUDED.annotations) x),reconciled_at=now()`,[login,JSON.stringify(contacts),JSON.stringify(['sitdownwith.staff','sitdownwith.staff_socials']),JSON.stringify([annotations])]);
 }
 // Pending requests remain suppressed until reconciled; only an explicit denial removes suppression.
 const {rows:suppressions}=await source.query(`SELECT p.*,s.github_login AS staff_login FROM person_suppressions p LEFT JOIN staff s ON s.id=p.staff_id`);
 for(const row of suppressions){const login=(row.github_login??row.staff_login)?.toLowerCase();if(!login)continue;await target.query(`INSERT INTO candidate_network_metadata(login,suppressed,sources) VALUES($1,$2,'["sitdownwith.person_suppressions"]') ON CONFLICT(login) DO UPDATE SET suppressed=candidate_network_metadata.suppressed OR EXCLUDED.suppressed,reconciled_at=now()`,[login,!['rejected','denied','withdrawn'].includes(row.status)]);}
 await target.query('COMMIT');await writeFile(new URL('legacy-reconciliation.json',local),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
} catch(error){await target.query('ROLLBACK');throw error;}finally{await source.end();await target.end();}
