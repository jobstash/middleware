import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import { assertProviderSecretsRetired } from './device-runtime-config.mjs';
const env = dotenv.parse(await readFile(new URL('./.local/database.env', import.meta.url)));
const target = new URL(env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '55480') throw Error('Dedicated local snapshot only');
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  const counts = async () => (await db.query(`SELECT
    (SELECT count(*) FROM candidate_career_profiles) AS profiles,
    (SELECT count(*) FROM candidate_documents) AS documents,
    (SELECT count(*) FROM candidate_cv_versions) AS cvs,
    (SELECT count(*) FROM candidate_application_documents) AS drafts,
    (SELECT count(*) FROM candidate_ai_connections) AS connections`)).rows[0];
  const before = await counts();
  // Apply only the pending additive tail; do not rerun fixture seeding or legacy reconciliation.
  const sql = await readFile(new URL('../../scripts/sql/career-agent-workflows.sql', import.meta.url), 'utf8');
  await db.query('BEGIN');
  await db.query(sql.slice(sql.indexOf('ALTER TABLE candidate_agent_events ADD COLUMN IF NOT EXISTS mutation_id')));
  await db.query(await readFile(new URL('../../scripts/sql/career-agent-cv-matching.sql', import.meta.url),'utf8'));
  await db.query(await readFile(new URL('../../scripts/sql/career-agent-screening.sql', import.meta.url),'utf8'));
  for (const file of ['career-agent-screening-workflow.sql', 'career-agent-screening-governance.sql', 'candidate-document-provenance.sql', 'candidate-browser-applications.sql'])
    await db.query(await readFile(new URL(`../../scripts/sql/${file}`, import.meta.url), 'utf8'));
  const after = await counts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Unexpected data count change');
  await db.query('COMMIT');
  // Device/voice migrations own their transactions; do not nest their COMMITs.
  for (const file of ['career-agent-provider-api.sql', 'candidate-capabilities.sql', 'candidate-documents.sql', 'candidate-device-execution.sql', 'candidate-voice.sql'])
    await db.query(await readFile(new URL(`../../scripts/sql/${file}`, import.meta.url), 'utf8'));
  await assertProviderSecretsRetired(db);
  if (JSON.stringify(before) !== JSON.stringify(await counts())) throw Error('Device cutover changed owned data counts');
  console.log(JSON.stringify({ applied: true, preserved: after }));
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally { await db.end(); }
