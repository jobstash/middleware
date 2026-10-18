import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
export async function prepareMcpTestTables(db: PostgresService) {
  await db.query(`CREATE TABLE IF NOT EXISTS graph_nodes(id bigserial PRIMARY KEY,label text,properties jsonb);
  CREATE TABLE IF NOT EXISTS candidate_subscriptions(charge_id text PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),status text,paid_until timestamptz);
  CREATE TABLE IF NOT EXISTS candidate_mutations(user_node_id bigint REFERENCES graph_nodes(id),request_id uuid,input_hash text,response jsonb,PRIMARY KEY(user_node_id,request_id));
  CREATE TABLE IF NOT EXISTS candidate_ai_connections(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),provider text,status text,generation integer DEFAULT 0,credential_ciphertext text,public_state jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS candidate_agent_sessions(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),connection_id uuid REFERENCES candidate_ai_connections(id),object_kind text,object_id uuid,object_classification text DEFAULT '',revision integer DEFAULT 1,created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS candidate_agent_requests(id uuid PRIMARY KEY,session_id uuid REFERENCES candidate_agent_sessions(id),user_node_id bigint REFERENCES graph_nodes(id),prompt text,status text DEFAULT 'queued',worker_id uuid,started_at timestamptz,heartbeat_at timestamptz,created_at timestamptz DEFAULT now(),finished_at timestamptz,request_kind text DEFAULT 'conversation');
  CREATE TABLE IF NOT EXISTS candidate_agent_events(id bigserial PRIMARY KEY,request_id uuid REFERENCES candidate_agent_requests(id),event jsonb,created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS candidate_documents(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),content_hash text,filename text,source_text text,storage_kind text DEFAULT 'object',embedding_node_id bigint,parsed_result jsonb,created_at timestamptz DEFAULT now(),UNIQUE(user_node_id,content_hash));
  CREATE TABLE IF NOT EXISTS graph_relationships(id bigserial PRIMARY KEY,source_id bigint REFERENCES graph_nodes(id),target_id bigint REFERENCES graph_nodes(id),type text,relationship_key text,properties jsonb,UNIQUE(source_id,target_id,type,relationship_key));
  CREATE TABLE IF NOT EXISTS user_job_preferences(user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),job_categories text[] DEFAULT '{}');
  `);
  await db.query(readFileSync("scripts/sql/mcp-access.sql", "utf8"));
  await db.query(readFileSync("scripts/sql/career-agent-hosted.sql", "utf8"));
  await db.query(readFileSync("scripts/sql/career-agent-provider-api.sql", "utf8"));
  for (const file of ["career-agent-screening.sql", "career-agent-screening-workflow.sql"])
    await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
  await db.query(readFileSync("scripts/sql/candidate-capabilities.sql", "utf8"));
  await db.query(readFileSync("scripts/sql/candidate-model-selection.sql", "utf8"));
  await db.query(readFileSync("scripts/sql/candidate-document-provenance.sql", "utf8"));
  await db.query(readFileSync("scripts/sql/candidate-device-execution.sql", "utf8"));
  await db.query(readFileSync("scripts/sql/candidate-voice.sql", "utf8"));
}

export async function prepareMcpScreeningTestTables(db: PostgresService) {
  await prepareMcpTestTables(db);
  await db.query(`
    ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS embedding_node_id bigint;
    ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS parsed_result jsonb;
    CREATE TABLE IF NOT EXISTS candidate_parse_attempts(id uuid PRIMARY KEY,user_node_id bigint,document_id uuid,status text);
    CREATE TABLE IF NOT EXISTS candidate_application_documents(id uuid PRIMARY KEY,user_node_id bigint,content jsonb);
    CREATE TABLE IF NOT EXISTS candidate_career_profiles(user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),revision integer DEFAULT 0,evidence jsonb DEFAULT '[]',directions text[] DEFAULT '{}',updated_at timestamptz DEFAULT now());
    ALTER TABLE candidate_career_profiles ADD COLUMN IF NOT EXISTS directions text[] DEFAULT '{}';
    ALTER TABLE user_job_preferences ADD COLUMN IF NOT EXISTS work_authorization text,
      ADD COLUMN IF NOT EXISTS requires_sponsorship boolean,ADD COLUMN IF NOT EXISTS minimum_salary numeric,
      ADD COLUMN IF NOT EXISTS salary_currency text,ADD COLUMN IF NOT EXISTS residence_country text,
      ADD COLUMN IF NOT EXISTS utc_offset_minutes integer,ADD COLUMN IF NOT EXISTS industries text[] DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS job_search_documents(job_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),short_uuid text,title text,payload jsonb,filter_labels jsonb,organization_id text,project_id text,online boolean DEFAULT true,blocked boolean DEFAULT false,published_timestamp bigint DEFAULT (extract(epoch FROM now())*1000)::bigint);
    ALTER TABLE job_search_documents ADD COLUMN IF NOT EXISTS search_vector tsvector DEFAULT '';
    CREATE TABLE IF NOT EXISTS organization_search_documents(organization_node_id bigint,organization_id text,payload jsonb);
    CREATE TABLE IF NOT EXISTS project_search_documents(project_node_id bigint,project_id text,payload jsonb);
    CREATE TABLE IF NOT EXISTS candidate_cv_job_scores(document_id uuid,job_node_id bigint,score numeric);
    CREATE TABLE IF NOT EXISTS candidate_applications(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),job_node_id bigint REFERENCES graph_nodes(id),state jsonb DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS user_activity_events(user_node_id bigint REFERENCES graph_nodes(id),job_node_id bigint REFERENCES graph_nodes(id),event_type text,metadata jsonb);
  `);
  for (const file of ["career-agent-screening-governance.sql", "candidate-document-provenance.sql"])
    await db.query(readFileSync(`scripts/sql/${file}`, "utf8"));
}
