-- Reusable IP blocking and administrator action history.
CREATE TABLE IF NOT EXISTS visitor_ip_blocks (
 ip inet PRIMARY KEY, blocked boolean NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), changed_by text NOT NULL,
 CHECK (masklen(ip)=CASE family(ip) WHEN 4 THEN 32 ELSE 128 END)
);
CREATE TABLE IF NOT EXISTS visitor_ip_block_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ip inet NOT NULL, blocked boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(), changed_by text NOT NULL
);
CREATE TABLE IF NOT EXISTS visitor_ip_block_proxy_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), revision text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jobstash_app') THEN
 GRANT SELECT,INSERT,UPDATE ON visitor_ip_blocks,visitor_ip_block_proxy_state TO jobstash_app;
 GRANT SELECT,INSERT ON visitor_ip_block_history TO jobstash_app;
 GRANT USAGE,SELECT ON SEQUENCE visitor_ip_block_history_id_seq TO jobstash_app;
END IF; END $$;
