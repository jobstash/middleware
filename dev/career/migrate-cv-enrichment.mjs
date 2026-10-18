import { readFile } from 'node:fs/promises';
import pg from 'pg';

const env = JSON.parse(await readFile(new URL('./.local/recruiters-environment.json', import.meta.url), 'utf8'));
const target = new URL(env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '55480' || target.pathname !== '/recruiters_rip_local' || env.LOCAL_ONLY !== 'true')
  throw Error('Dedicated local recruiters database required');
const db = new pg.Client({ connectionString: target.href });
await db.connect();
try {
  const { rows: [work] } = await db.query("SELECT count(*)::int AS active FROM candidate_agent_requests WHERE status IN ('queued','running')");
  if (work.active) throw Error('Wait for active candidate work before migrating');
  for (const file of ['career-evidence-usability.sql', 'career-agent-draft-editing.sql', 'career-agent-enrichment.sql', 'career-agent-cv-baseline.sql']) {
    await db.query(await readFile(new URL(`../../scripts/sql/${file}`, import.meta.url), 'utf8'));
    console.log(`Applied ${file}`);
  }
} finally { await db.end(); }
