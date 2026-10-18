import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import remoteClickHouse from './remote-clickhouse.cjs';
import { assertProviderSecretsRetired } from './device-runtime-config.mjs';
const local=new URL('./.local/',import.meta.url),env=dotenv.parse(await readFile(new URL('database.env',local)));
const url=new URL(env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.port!=='55480')throw Error('Dedicated local snapshot only');
const db=new pg.Client({connectionString:env.DATABASE_URL});await db.connect();
const fixtures=[{name:'Local Free',key:'free',wallet:'0x00000000000000000000000000000000ca000001',privyId:'did:privy:career-local-free',github:null},{name:'Local Advanced',key:'advanced',wallet:'0x00000000000000000000000000000000ca000002',privyId:'did:privy:career-local-advanced',github:'local-no-network'},{name:'Local New Profile',key:'new',wallet:'0x00000000000000000000000000000000ca000003',privyId:'did:privy:career-local-new',github:null}];
try{
 for(const file of ['career-agent.sql','career-agent-workflows.sql','career-agent-network.sql','career-agent-legacy-career.sql','career-agent-cv-matching.sql','career-agent-screening.sql','career-agent-hosted.sql','mcp-access.sql','career-agent-provider-api.sql','candidate-capabilities.sql','career-evidence-usability.sql','career-agent-draft-editing.sql','career-agent-enrichment.sql','career-agent-cv-baseline.sql','candidate-model-selection.sql','candidate-geographic-eligibility.sql'])await db.query(await readFile(new URL('../../scripts/sql/'+file,import.meta.url),'utf8'));
 for(const file of ['candidate-documents.sql','candidate-introductions.sql','career-agent-screening-workflow.sql','career-agent-screening-governance.sql','candidate-document-provenance.sql','candidate-browser-applications.sql','candidate-device-execution.sql','candidate-voice.sql','candidate-stripe-billing.sql'])await db.query(await readFile(new URL('../../scripts/sql/'+file,import.meta.url),'utf8'));
 await assertProviderSecretsRetired(db);
 await db.query('BEGIN');
 // Choose an existing graph root only for the explicitly labelled local network fixture.
 const [root]=await remoteClickHouse.query('SELECT user_login FROM intropath_graph.current_staff ORDER BY organization,user_login LIMIT 1');if(root)fixtures[1].github=root.user_login;
 const {rows:[permission]}=await db.query("INSERT INTO graph_nodes(label,labels,node_key,properties) VALUES('UserPermission',ARRAY['UserPermission'],'career-local:USER','{\"name\":\"USER\"}') ON CONFLICT(label,node_key) DO UPDATE SET properties=EXCLUDED.properties RETURNING id");
 for(const fixture of fixtures){
  const properties={wallet:fixture.wallet,name:fixture.name,privyId:fixture.privyId,cryptoNative:false,cryptoAdjacent:false,email:fixture.key+'@example.invalid',availableForWork:true};
  const {rows:[owner]}=await db.query("INSERT INTO graph_nodes(label,labels,node_key,properties) VALUES('User',ARRAY['User'],$1,$2) ON CONFLICT(label,node_key) DO UPDATE SET properties=graph_nodes.properties||EXCLUDED.properties RETURNING id",['career-local:'+fixture.key,JSON.stringify(properties)]);
  fixture.owner=owner.id;
  await db.query("INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties) VALUES($1,$2,'HAS_PERMISSION','','{}') ON CONFLICT DO NOTHING",[owner.id,permission.id]);
  if(fixture.key!=='new')await db.query("INSERT INTO user_job_preferences(user_node_id,work_modes,residence_country,attendance_preference,preferred_skills) VALUES($1,ARRAY['remote'],'NL','remote_only',ARRAY['TypeScript','PostgreSQL']) ON CONFLICT(user_node_id) DO NOTHING",[owner.id]);
  const evidence=[{id:randomUUID(),kind:'responsibility',statement:'Built and maintained a TypeScript API backed by PostgreSQL for an open-source scheduling project.',employer:'Local Example Project',role:'Software Engineer',source:{kind:'candidate',excerpt:null},confirmation:'confirmed',conflicts:[]},{id:randomUUID(),kind:'scope',statement:'Coordinated planning and code reviews for a team of four contributors.',employer:'Local Example Project',role:'Software Engineer',source:{kind:'candidate',excerpt:null},confirmation:'confirmed',conflicts:[]}];
  await db.query('INSERT INTO candidate_career_profiles(user_node_id,revision,evidence) VALUES($1,1,$2) ON CONFLICT(user_node_id) DO NOTHING',[owner.id,JSON.stringify(fixture.key==='new'?[]:evidence)]);
  if(fixture.key==='advanced')await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,checkout_url,status,paid_until) VALUES('local-fixture-advanced',$1,'https://example.invalid/legacy-checkout','active',now()+interval '1 month') ON CONFLICT(charge_id) DO NOTHING",[owner.id]);
 }
 await db.query('COMMIT');await writeFile(new URL('fixtures.json',local),JSON.stringify(fixtures,null,2),{mode:0o600});console.log('Local-only Free, Advanced and empty New Profile fixtures created. GitHub verification is simulated for the labelled network fixture.');
}finally{await db.end();}
