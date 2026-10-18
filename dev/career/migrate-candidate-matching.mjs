import { readFile } from 'node:fs/promises';
import pg from 'pg';

const env = JSON.parse(await readFile(new URL('./.local/recruiters-environment.json', import.meta.url), 'utf8'));
const target = new URL(env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '55480' || target.pathname !== '/recruiters_rip_local' || env.LOCAL_ONLY !== 'true')
  throw Error('Dedicated local recruiters database required');
const modelSelectionOnly = process.argv.length === 3 && process.argv[2] === '--model-selection-only';
if (process.argv.length > 2 && !modelSelectionOnly)
  throw Error('Expected no arguments or --model-selection-only');
const db = new pg.Client({ connectionString: target.href });
await db.connect();
try {
  if (!modelSelectionOnly) {
    const { rows: [work] } = await db.query("SELECT count(*)::int AS active FROM candidate_agent_requests WHERE status IN ('queued','running')");
    if (work.active) throw Error('Wait for active candidate work before migrating');
  }
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout = '5s'");
  await db.query('SELECT pg_advisory_xact_lock(73129011)');
  const files = modelSelectionOnly
    ? ['candidate-model-selection.sql']
    : ['candidate-model-selection.sql', 'candidate-geographic-eligibility.sql', 'career-agent-screening.sql', 'career-agent-screening-workflow.sql', 'career-agent-screening-governance.sql', 'candidate-document-provenance.sql'];
  for (const file of files)
    await db.query(await readFile(new URL(`../../scripts/sql/${file}`, import.meta.url), 'utf8'));
  await db.query('COMMIT');
  console.log(modelSelectionOnly
    ? 'Applied local model-selection schema without changing saved requests.'
    : 'Applied local model-selection, geographic-eligibility and staged-screening migrations.');
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally { await db.end(); }
