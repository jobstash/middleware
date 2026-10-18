import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';
const env = dotenv.parse(await readFile(new URL('./.local/database.env', import.meta.url)));
const target = new URL(env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '55480' || target.pathname !== '/jobstash') throw Error('Dedicated local snapshot only');
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  const before = (await db.query('SELECT count(*)::int AS count FROM candidate_agent_sessions')).rows[0].count;
  const sql = await readFile(new URL('../../scripts/sql/career-agent-workflows.sql', import.meta.url), 'utf8');
  const start = sql.indexOf('ALTER TABLE candidate_agent_sessions ADD COLUMN IF NOT EXISTS object_classification');
  const end = sql.indexOf('ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS original_ad_text', start);
  if (start < 0 || end < 0) throw Error('Category migration section not found');
  await db.query(sql.slice(start, end));
  const after = (await db.query('SELECT count(*)::int AS count FROM candidate_agent_sessions')).rows[0].count;
  if (before !== after) throw Error('Session count changed');
  await db.query('COMMIT');
  console.log(JSON.stringify({ applied: true, preservedSessions: after }));
} catch (error) { await db.query('ROLLBACK'); throw error; }
finally { await db.end(); }
