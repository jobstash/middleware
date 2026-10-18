-- Interactive requests retain their enqueue-time model when the connection choice changes.
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS requested_model text
  CHECK (requested_model IS NULL OR requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$');
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS requested_reasoning_effort text;

-- Replace the original low-only constraint without changing any saved request.
ALTER TABLE candidate_agent_requests
  DROP CONSTRAINT IF EXISTS candidate_agent_requests_requested_reasoning_effort_check;
ALTER TABLE candidate_agent_requests
  ADD CONSTRAINT candidate_agent_requests_requested_reasoning_effort_check
  CHECK (requested_reasoning_effort IS NULL OR requested_reasoning_effort ~ '^[a-z][a-z0-9_-]{0,31}$');
