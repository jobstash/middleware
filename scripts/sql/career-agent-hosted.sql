-- Serialize provider token use across CV parsing and agent runs for one connection.
ALTER TABLE candidate_ai_connections ADD COLUMN IF NOT EXISTS credential_lease uuid;
ALTER TABLE candidate_ai_connections ADD COLUMN IF NOT EXISTS credential_lease_until timestamptz;
