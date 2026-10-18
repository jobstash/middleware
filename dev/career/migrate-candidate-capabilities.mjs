import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';

const env = dotenv.parse(await readFile(new URL('./.local/database.env', import.meta.url)));
const target = new URL(env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '55480')
  throw Error('Dedicated local snapshot only');
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  for (const file of ['career-agent-provider-api.sql', 'candidate-capabilities.sql', 'candidate-device-execution.sql', 'candidate-voice.sql'])
    await db.query(await readFile(new URL(`../../scripts/sql/${file}`, import.meta.url), 'utf8'));
  console.log('Candidate capability schema applied to the local snapshot.');
} finally {
  await db.end();
}
