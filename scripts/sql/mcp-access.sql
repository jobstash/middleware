-- Additive schema for subscriber MCP access. Apply through the normal release process.
BEGIN;
CREATE TABLE IF NOT EXISTS mcp_clients (
 id uuid PRIMARY KEY, name text NOT NULL, redirect_uris jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mcp_authorizations (
 id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES mcp_clients(id),
 redirect_uri text NOT NULL, resource text NOT NULL, scope text NOT NULL,
 state text NOT NULL, challenge text NOT NULL,
 user_node_id bigint REFERENCES graph_nodes(id) ON DELETE CASCADE,
 code_hash text UNIQUE, approved_at timestamptz, consumed_at timestamptz,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mcp_authorizations_expiry ON mcp_authorizations(expires_at);
CREATE TABLE IF NOT EXISTS mcp_grants (
 id uuid PRIMARY KEY, user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES mcp_clients(id), resource text NOT NULL, scope text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_grants_owner ON mcp_grants(user_node_id,created_at DESC);
CREATE TABLE IF NOT EXISTS mcp_tokens (
 hash text PRIMARY KEY, grant_id uuid NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('access','refresh')), expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_tokens_grant ON mcp_tokens(grant_id);
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS mcp_usage_periods (
 id uuid PRIMARY KEY, user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 subscription_id text NOT NULL, period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
 unit text NOT NULL CHECK(unit IN ('calls','records')), quota bigint NOT NULL CHECK(quota >= 0),
 used bigint NOT NULL DEFAULT 0 CHECK(used >= 0), reserved bigint NOT NULL DEFAULT 0 CHECK(reserved >= 0),
 UNIQUE(user_node_id,subscription_id,period_start), CHECK(period_end > period_start)
);
CREATE TABLE IF NOT EXISTS mcp_usage_receipts (
 user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, period_id uuid NOT NULL REFERENCES mcp_usage_periods(id),
 tool text NOT NULL, input_hash text NOT NULL, state text NOT NULL CHECK(state IN ('pending','completed','failed')),
 claim_id uuid NOT NULL, reserved bigint NOT NULL CHECK(reserved >= 0),
 units bigint NOT NULL DEFAULT 0 CHECK(units >= 0), records bigint NOT NULL DEFAULT 0 CHECK(records >= 0),
 response jsonb, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 PRIMARY KEY(user_node_id,request_id)
);
CREATE INDEX IF NOT EXISTS mcp_receipts_pending ON mcp_usage_receipts(period_id,expires_at) WHERE state='pending';
COMMIT;

-- Research requests use the same account-owned agent queue and worker as the CV builder.
CREATE TABLE IF NOT EXISTS mcp_research_requests (
 request_id uuid PRIMARY KEY,
 user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 grant_id uuid NOT NULL REFERENCES mcp_grants(id),
 input_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_research_owner ON mcp_research_requests(user_node_id,request_id);
CREATE INDEX IF NOT EXISTS mcp_research_grant ON mcp_research_requests(grant_id);
