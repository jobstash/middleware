-- Reconcile and retain these rows before retiring any legacy database.
-- This archive has no public controller and is never returned by people APIs.
CREATE TABLE IF NOT EXISTS candidate_network_legacy_records (
 source_database text NOT NULL,
 source_table text NOT NULL,
 source_id text NOT NULL,
 record jsonb NOT NULL,
 content_hash text NOT NULL,
 reconciled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_database,source_table,source_id)
);
