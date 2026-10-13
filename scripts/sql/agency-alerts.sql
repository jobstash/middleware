-- Apply after the existing graph/search and access-workspace schema, before Alert code.
-- The permanent publication ledger is intentionally independent of projection lifetimes.
BEGIN;
-- Prevent a role from crossing the baseline while ETL changes its graph/projection.
LOCK TABLE graph_nodes, job_search_documents IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE access_workspaces ADD COLUMN IF NOT EXISTS alerts_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE access_workspaces ADD COLUMN IF NOT EXISTS alerts_whitelist_updated_by text;
ALTER TABLE access_workspaces ADD COLUMN IF NOT EXISTS alerts_whitelist_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS agency_alert_publications (
  short_uuid text PRIMARY KEY,
  organization_id text,
  observed_at timestamptz
);
CREATE INDEX IF NOT EXISTS agency_alert_publications_due
  ON agency_alert_publications (organization_id, observed_at, short_uuid)
  WHERE observed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS agency_alert_follows (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES access_workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  email_node_id bigint REFERENCES graph_nodes(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  organization_id text NOT NULL,
  organization_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at timestamptz,
  UNIQUE (workspace_id, user_id, organization_id),
  FOREIGN KEY (workspace_id, user_id) REFERENCES access_workspace_members(workspace_id, user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS agency_alert_deliveries (
  id uuid PRIMARY KEY,
  follow_id uuid NOT NULL REFERENCES agency_alert_follows(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('claimed', 'accepted', 'skipped', 'failed_unknown')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS agency_alert_delivery_jobs (
  follow_id uuid NOT NULL REFERENCES agency_alert_follows(id) ON DELETE CASCADE,
  short_uuid text NOT NULL REFERENCES agency_alert_publications(short_uuid),
  delivery_id uuid NOT NULL REFERENCES agency_alert_deliveries(id) ON DELETE CASCADE,
  PRIMARY KEY (follow_id, short_uuid)
);
CREATE INDEX IF NOT EXISTS agency_alert_delivery_jobs_batch ON agency_alert_delivery_jobs(delivery_id);

-- Baseline exactly once. Reapplying this file must not suppress newly captured roles.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agency_alert_capture_publication'
    AND tgrelid = 'job_search_documents'::regclass AND NOT tgisinternal) THEN
    INSERT INTO agency_alert_publications(short_uuid)
    SELECT properties ->> 'shortUUID' FROM graph_nodes
    WHERE label = 'StructuredJobpost' AND NULLIF(properties ->> 'shortUUID', '') IS NOT NULL
    UNION SELECT short_uuid FROM job_search_documents WHERE NULLIF(short_uuid, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agency_alert_capture_publication() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.online AND NOT NEW.blocked AND NEW.legacy_list_eligible
    AND NEW.organization_id IS NOT NULL AND NEW.project_id IS NULL
    AND cardinality(NEW.tags) > 0 AND NEW.access = 'public'
    AND NOT NEW.organization_has_expert_jobs AND NULLIF(NEW.short_uuid, '') IS NOT NULL THEN
    INSERT INTO agency_alert_publications(short_uuid, organization_id, observed_at)
    VALUES (NEW.short_uuid, NEW.organization_id,
      GREATEST(clock_timestamp(), to_timestamp(NEW.published_timestamp / 1000.0)))
    ON CONFLICT (short_uuid) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agency_alert_capture_publication ON job_search_documents;
CREATE TRIGGER agency_alert_capture_publication AFTER INSERT OR UPDATE ON job_search_documents
  FOR EACH ROW EXECUTE FUNCTION agency_alert_capture_publication();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jobstash_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agency_alert_follows, agency_alert_deliveries,
      agency_alert_delivery_jobs TO jobstash_app;
    -- ETL and middleware projection writers must both be able to record publications.
    GRANT SELECT, INSERT ON agency_alert_publications TO jobstash_app;
  END IF;
END $$;
COMMIT;
