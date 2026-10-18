// Full local restores never mutate production, drop databases, or switch runtime.
import { readFile, mkdir, chmod, stat, statfs, rename, open, realpath, lstat, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { relative, isAbsolute, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import { assertProviderSecretsRetired, connectionMetadataExpression } from './device-runtime-config.mjs';

const local = new URL('./.local/', import.meta.url);
const container = 'jobstash-career-postgres';
const allowedTargets = new Set(['recruiters_rip_local_full', 'recruiters_rip_local']);
const migrations = ['career-agent-provider-api.sql', 'candidate-capabilities.sql',
  'candidate-documents.sql', 'candidate-introductions.sql',
  'career-evidence-usability.sql', 'career-agent-draft-editing.sql', 'career-agent-enrichment.sql', 'career-agent-cv-baseline.sql', 'candidate-model-selection.sql', 'candidate-geographic-eligibility.sql',
  'career-agent-screening-workflow.sql', 'career-agent-screening-governance.sql', 'candidate-document-provenance.sql', 'candidate-browser-applications.sql',
  'candidate-device-execution.sql', 'candidate-voice.sql', 'candidate-stripe-billing.sql'];
const archiveMigrations = ['career-agent.sql', 'career-agent-workflows.sql',
  'career-agent-cv-matching.sql', 'career-agent-screening.sql', 'career-agent-hosted.sql',
  'mcp-access.sql', ...migrations];
const ident = value => `"${value.replaceAll('"', '""')}"`;
const measuredTables = ['graph_nodes', 'graph_relationships', 'job_search_documents',
  'organization_search_documents', 'project_search_documents', 'job_canonical_tags',
  'job_embeddings', 'tag_embeddings', 'recommendation_embedding_documents',
  'recommendation_sentence_embeddings', 'place_reference', 'place_aliases',
  'job_availability_extractions', 'job_work_location_options', 'candidate_career_profiles',
  'candidate_documents', 'candidate_cv_versions', 'candidate_applications',
  'candidate_application_documents', 'candidate_ai_connections', 'candidate_agent_sessions',
  'candidate_agent_requests', 'candidate_screening_runs', 'candidate_screening_jobs'];

async function counts(db) {
  const result = {};
  for (const table of measuredTables) {
    const { rows: [row] } = await db.query(`SELECT count(*)::text AS count FROM ${ident(table)}`);
    result[table] = row.count;
  }
  return result;
}
async function connectionOwnershipDigest(db, table) {
  const { rows: [present] } = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [table]);
  if (!present.present) return { rows: 0, digest: null };
  const { rows: [row] } = await db.query(`SELECT count(*)::int AS rows,
    md5(COALESCE(string_agg(id::text||':'||user_node_id::text,'|' ORDER BY id),'')) AS digest FROM ${ident(table)}`);
  return row;
}
async function connectionOwnership(db) {
  return { reasoning: await connectionOwnershipDigest(db, 'candidate_ai_connections'),
    voice: await connectionOwnershipDigest(db, 'candidate_voice_connections') };
}
function verifyConnectionOwnership(before, after) {
  for (const purpose of ['reasoning', 'voice']) {
    if (before[purpose].rows !== after[purpose].rows ||
        (before[purpose].rows > 0 && before[purpose].digest !== after[purpose].digest))
      throw Error('Device cutover changed historical connection ownership');
  }
}
async function quarantineImportedDeviceWork(db) {
  const actions = {
    cancelledDeviceTasks: "UPDATE candidate_device_tasks SET status='cancelled',lease_id=NULL,lease_expires_at=NULL,finished_at=COALESCE(finished_at,now()) WHERE status IN ('waiting_for_device','running')",
    revokedDevices: "UPDATE candidate_devices SET status='revoked',challenge=NULL,challenge_expires_at=NULL,revoked_at=COALESCE(revoked_at,now()) WHERE status<>'revoked'",
    cancelledBrowserRuns: `UPDATE candidate_browser_applications SET status='cancelled',
      state=jsonb_set(state,'{view}',COALESCE(state->'view','{}')||jsonb_build_object('status','cancelled','command',NULL,'question',NULL,'message','This saved browser run was restored. Inspect the employer page before starting another application.')),updated_at=now()
      WHERE status NOT IN ('submitted','failed','cancelled')`,
  };
  const counts = {};
  for (const [name, sql] of Object.entries(actions)) counts[name] = (await db.query(sql)).rowCount;
  return counts;
}
async function retainSanitizedArchive(target, targetUrl, archive, log, maximumBytes) {
  await assertProviderSecretsRetired(target);
  const partial = new URL(`${archive.pathname}.partial`, 'file:');
  const dump = docker(targetUrl, 'pg_dump', ['-h', '127.0.0.1', '-p', '5432', '-U', decodeURIComponent(targetUrl.username),
    '--format=custom', '--compress=zstd:1', '--no-owner', '--no-privileges', targetUrl.pathname.slice(1)],
    '-c default_transaction_read_only=on');
  dump.stdin.end();
  const hash = createHash('sha256');
  let bytes = 0;
  const measure = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > maximumBytes) return callback(Error('Sanitized dump exceeded reserved archive capacity'));
    hash.update(chunk); callback(null, chunk);
  } });
  const completed = [exit(dump, log, 'Sanitized local archive export'),
    pipeline(dump.stdout, measure, createWriteStream(partial, { flags: 'wx', mode: 0o600 }))];
  try {
    await Promise.all(completed);
    const file = await open(partial, 'r');
    try { await file.sync(); } finally { await file.close(); }
    await rename(partial, archive);
    return { archiveBytes: bytes, archiveSha256: hash.digest('hex'), archivePolicy: 'New full target archive created only after provider secret retirement and work quarantine.' };
  } catch (error) {
    dump.kill(); await Promise.allSettled(completed);
    await rm(partial, { force: true });
    throw error;
  }
}
async function saveReceipt(path, receipt) {
  const temporary = new URL(`${path.pathname}.writing`, 'file:');
  const file = await open(temporary, 'w', 0o600);
  try {
    await file.writeFile(JSON.stringify(receipt, null, 2) + '\n');
    await file.sync();
  } finally { await file.close(); }
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  const directory = await open(new URL('./', path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
function docker(url, program, args, options = '') {
  return spawn('docker', ['exec', '-i', '-e', 'PGPASSWORD', '-e', 'PGOPTIONS', container,
    program, ...args], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      PGPASSWORD: decodeURIComponent(url.password), PGOPTIONS: options },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
function exit(child, log, operation) {
  // PostgreSQL COPY diagnostics can echo imported credential bytes. Retain only
  // operation/exit metadata; never copy raw restoration stderr into a new log.
  child.stderr.resume();
  return new Promise((resolve, reject) => {
    child.once('error', () => {
      log.write(`${operation}: could not start\n`);
      reject(Error(`${operation} could not start; inspect the private restore log`));
    });
    child.once('exit', code => {
      log.write(`${operation}: exit ${code}\n`);
      if (code === 0) resolve();
      else reject(Error(`${operation} failed; inspect the private restore log`));
    });
  });
}
function restoreSearchPath() {
  // pg_dump clears search_path, but this backup has CHECK functions calling
  // unqualified public helpers. Correct the one startup command, never COPY data.
  const command = Buffer.from("SELECT pg_catalog.set_config('search_path', '', false);");
  let pending = Buffer.alloc(0);
  let changed = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (changed) return callback(null, chunk);
      pending = Buffer.concat([pending, chunk]);
      const offset = pending.indexOf(command);
      if (offset >= 0) {
        this.push(pending.subarray(0, offset));
        this.push("SELECT pg_catalog.set_config('search_path', 'pg_catalog, public', false);");
        this.push(pending.subarray(offset + command.length));
        pending = Buffer.alloc(0); changed = true;
        return callback();
      }
      if (pending.length > 65536) return callback(Error('Expected pg_dump startup search_path command not found'));
      callback();
    },
    flush(callback) { callback(changed ? null : Error('Incomplete pg_restore startup header')); },
  });
}

export async function restoreRecruitersDatabase(targetName = 'recruiters_rip_local_full') {
  if (!allowedTargets.has(targetName)) throw Error('Only dedicated recruiters local database names are allowed');
  const sourceConfig = dotenv.parse(await readFile(new URL('database.env', local)));
  const sourceUrl = new URL(sourceConfig.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(sourceUrl.protocol) || sourceUrl.hostname !== '127.0.0.1'
      || sourceUrl.port !== '55480' || sourceUrl.pathname !== '/jobstash' || sourceUrl.search || sourceUrl.hash)
    throw Error('The source must be the existing 127.0.0.1:55480/jobstash backup restore');
  const targetUrl = new URL(sourceUrl); targetUrl.pathname = `/${targetName}`;
  const adminUrl = new URL(sourceUrl); adminUrl.pathname = '/postgres';
  const source = new pg.Client({ connectionString: sourceUrl.href });
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const target = new pg.Client({ connectionString: targetUrl.href });
  const receiptPath = new URL(`${targetName}-restore.json`, local);
  let receipt;
  let targetConnected = false;
  let sourceTransaction = false;
  let log;
  try {
    await mkdir(local, { recursive: true, mode: 0o700 });
    await admin.connect();
    const { rows: [lock] } = await admin.query("SELECT pg_try_advisory_lock(hashtext('recruiters-full-restore:'||$1)) AS acquired", [targetName]);
    if (!lock.acquired) throw Error('This dedicated database restore is already running');
    const { rows: [existing] } = await admin.query('SELECT oid::text AS oid FROM pg_database WHERE datname=$1', [targetName]);
    let saved = null;
    try { saved = JSON.parse(await readFile(receiptPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing) {
      if (saved?.status === 'complete' && saved.providerSecretColumnsRetired === true
          && saved.databaseOid === existing.oid && saved.targetDatabase === targetName)
        return { ...saved, alreadyRestored: true };
      throw Error(`Database ${targetName} already exists without a completed device-only restore receipt; preserved without changes`);
    }
    await source.connect();
    await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'); sourceTransaction = true;
    const { rows: [snapshot] } = await source.query('SELECT pg_export_snapshot() AS id,current_database() AS database,inet_server_port() AS port');
    if (snapshot.database !== 'jobstash' || snapshot.port !== 5432) throw Error('Unexpected local snapshot server');
    const sourceBytes = Number((await source.query('SELECT pg_database_size(current_database())::text AS bytes')).rows[0].bytes);
    const maximumArchiveBytes = Math.ceil(sourceBytes * 1.25);
    const reserveBytes = 10 * 1024 ** 3;
    const capacity = await statfs(local);
    const availableBytes = capacity.bavail * capacity.bsize;
    if (availableBytes < sourceBytes + maximumArchiveBytes + reserveBytes)
      throw Error('Insufficient local disk space for a full clone, bounded archive and 10 GiB reserve');
    const sourceCounts = await counts(source);
    const ownershipBefore = await connectionOwnership(source);
    const { rows: [catalogue] } = await source.query(`SELECT count(*)::int AS jobs,
      count(*) FILTER(WHERE online AND NOT blocked)::int AS onlineNonblocked,
      count(*) FILTER(WHERE online AND NOT blocked AND EXISTS(SELECT 1 FROM graph_relationships e JOIN graph_nodes n ON n.id=e.source_id AND n.label='Jobpost'
        WHERE e.target_id=j.job_node_id AND e.type='HAS_STRUCTURED_JOBPOST' AND nullif(btrim(n.properties->>'content'),'') IS NOT NULL))::int AS onlineOriginalAds,
      max(to_timestamp(published_timestamp/1000.0)) AS latestPublication FROM job_search_documents j`);
    const { rows: [objects] } = await source.query(`SELECT
      (SELECT count(*)::int FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS tables,
      (SELECT count(*)::int FROM pg_sequences WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS sequences,
      (SELECT count(*)::int FROM pg_views WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS views,
      (SELECT count(*)::int FROM pg_matviews WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS materialized_views`);
    const provenance = JSON.parse(await readFile(new URL('jobstash-snapshot.json', local), 'utf8'));
    const runId = randomUUID();
    const archive = new URL(`${targetName}-${runId}.dump`, local);
    const logPath = new URL(`${targetName}-${runId}.restore.log`, local);
    log = createWriteStream(logPath, { flags: 'wx', mode: 0o600 });
    receipt = { version: 3, status: 'streaming', startedAt: new Date().toISOString(), targetDatabase: targetName,
      sourceDatabase: '127.0.0.1:55480/jobstash', sourceReadOnly: true, sourceSnapshot: provenance,
      sourceCounts, sourceObjects: objects, catalogue, archive: fileURLToPath(archive), log: fileURLToPath(logPath),
      capacity: { sourceBytes, maximumArchiveBytes, availableBytes, reserveBytes },
      policy: 'Complete local snapshot copy, all schemas/tables/data/graphs/vectors/identities. No runtime/configuration switch.' };
    await saveReceipt(receiptPath, receipt);
    console.log(`Streaming the complete local snapshot into isolated ${targetName}; no source credential archive is retained.`);
    const connectionArgs = ['-h', '127.0.0.1', '-p', '5432', '-U', decodeURIComponent(sourceUrl.username)];
    await admin.query(`CREATE DATABASE ${ident(targetName)} TEMPLATE template0`);
    receipt.databaseOid = (await admin.query('SELECT oid::text AS oid FROM pg_database WHERE datname=$1', [targetName])).rows[0].oid;
    receipt.status = 'restoring'; await saveReceipt(receiptPath, receipt);
    const dump = docker(sourceUrl, 'pg_dump', [...connectionArgs, '--format=custom', '--compress=zstd:1',
      '--no-owner', '--no-privileges', `--snapshot=${snapshot.id}`, 'jobstash'], '-c default_transaction_read_only=on');
    dump.stdin.end();
    const restore = docker(sourceUrl, 'pg_restore', ['--no-owner', '--no-privileges', '-f', '-']);
    const psql = docker(targetUrl, 'psql', [...connectionArgs, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-d', targetName, '-f', '-'],
      '-c maintenance_work_mem=4GB -c max_parallel_maintenance_workers=0');
    psql.stdout.resume();
    const restoreDone = [exit(dump, log, 'Read-only snapshot export'), exit(restore, log, 'Local pg_restore'), exit(psql, log, 'Local transactional restore'),
      pipeline(dump.stdout, restore.stdin), pipeline(restore.stdout, restoreSearchPath(), psql.stdin)];
    try { await Promise.all(restoreDone); }
    catch (error) { dump.kill(); restore.kill(); psql.kill(); await Promise.allSettled(restoreDone); throw error; }
    await source.query('ROLLBACK'); sourceTransaction = false;
    if (!targetConnected) { await target.connect(); targetConnected = true; }
    const restoredCounts = await counts(target);
    if (JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) throw Error('Full restored table counts differ from the exported snapshot');
    verifyConnectionOwnership(ownershipBefore, await connectionOwnership(target));
    receipt.status = 'migrating'; await saveReceipt(receiptPath, receipt);
    for (const migration of migrations) await target.query(await readFile(new URL(`../../scripts/sql/${migration}`, import.meta.url), 'utf8'));
    await assertProviderSecretsRetired(target);
    await target.query('BEGIN');
    try {
      const reasoning = await target.query(`UPDATE candidate_ai_connections SET status='disconnected',execution_lease=NULL,execution_lease_until=NULL,
        public_state=${connectionMetadataExpression('public_state')},updated_at=now()`);
      const voice = await target.query(`UPDATE candidate_voice_connections SET status='disconnected',public_state=${connectionMetadataExpression('public_state')},updated_at=now()`);
      const requests = await target.query("UPDATE candidate_agent_requests SET status='paused',worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL,finished_at=NULL WHERE status IN ('queued','running')");
      const runs = await target.query("UPDATE candidate_screening_runs SET status='paused',pause_reason='Local backup restore: connect your device before resuming',updated_at=now() WHERE status='running'");
      const jobs = await target.query("UPDATE candidate_screening_jobs SET status='pending',last_error='Local backup restore: run paused',next_retry_at=NULL WHERE status='running'");
      const voices = await target.query("UPDATE candidate_voice_sessions SET status='closed',closed_at=COALESCE(closed_at,now()),updated_at=now(),usage_complete=false WHERE status IN ('creating','active','closing')");
      const delegations = await target.query("UPDATE candidate_voice_delegations SET status='cancelled',updated_at=now() WHERE status IN ('queued','running')");
      const interruptedParses = await target.query("UPDATE candidate_parse_attempts SET status='failed',finished_at=COALESCE(finished_at,now()) WHERE status IN ('queued','running','processing')");
      const interruptedUploads = await target.query("UPDATE candidate_document_uploads SET status='failed',error_code='local_restore_quarantined',updated_at=now() WHERE status='processing'");
      const interruptedMcpUsage = await target.query("UPDATE mcp_usage_receipts SET state='failed',completed_at=COALESCE(completed_at,now()) WHERE state='pending'");
      const deviceQuarantine = await quarantineImportedDeviceWork(target);
      verifyConnectionOwnership(ownershipBefore, await connectionOwnership(target));
      receipt.quarantine = { reasoningConnections: reasoning.rowCount, voiceConnections: voice.rowCount, pausedRequests: requests.rowCount,
        pausedScreeningRuns: runs.rowCount, resetRunningScreeningJobs: jobs.rowCount, closedVoiceSessions: voices.rowCount, cancelledVoiceDelegations: delegations.rowCount,
        interruptedParses: interruptedParses.rowCount, interruptedUploads: interruptedUploads.rowCount, interruptedMcpUsage: interruptedMcpUsage.rowCount,
        ...deviceQuarantine, connectionOwnershipPreserved: true, providerSecretsRetired: true };
      await target.query('COMMIT');
    } catch (error) { await target.query('ROLLBACK'); throw error; }
    const { rows: [safety] } = await target.query(`SELECT
      (SELECT count(*)::int FROM candidate_ai_connections WHERE status<>'disconnected' OR execution_lease IS NOT NULL OR execution_lease_until IS NOT NULL) AS unsafe_reasoning_connections,
      (SELECT count(*)::int FROM candidate_voice_connections WHERE status<>'disconnected') AS unsafe_voice_connections,
      (SELECT count(*)::int FROM candidate_agent_requests WHERE status IN ('queued','running')) AS active_requests,
      (SELECT count(*)::int FROM candidate_screening_runs WHERE status='running') AS active_screening_runs,
      (SELECT count(*)::int FROM candidate_screening_jobs WHERE status='running') AS running_screening_jobs,
      (SELECT count(*)::int FROM candidate_voice_sessions WHERE status IN ('creating','active','closing')) AS active_voice_sessions,
      (SELECT count(*)::int FROM candidate_voice_delegations WHERE status IN ('queued','running')) AS active_voice_delegations,
      (SELECT count(*)::int FROM candidate_parse_attempts WHERE status IN ('queued','running','processing')) AS active_parses,
      (SELECT count(*)::int FROM candidate_document_uploads WHERE status='processing') AS active_uploads,
      (SELECT count(*)::int FROM mcp_usage_receipts WHERE state='pending') AS active_mcp_usage,
      (SELECT count(*)::int FROM candidate_device_tasks WHERE status IN ('waiting_for_device','running')) AS active_device_tasks,
      (SELECT count(*)::int FROM candidate_devices WHERE status<>'revoked') AS active_devices,
      (SELECT count(*)::int FROM candidate_browser_applications WHERE status NOT IN ('submitted','failed','cancelled')) AS active_browser_runs`);
    if (Object.values(safety).some(value => value !== 0)) throw Error('Copied work is not fully quarantined');
    const finalCounts = await counts(target);
    if (JSON.stringify(sourceCounts) !== JSON.stringify(finalCounts)) throw Error('Additive migrations or quarantine changed snapshot row counts');
    const sequences = (await target.query(`SELECT sequencename,last_value::text FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows;
    const sanitizedArchive = await retainSanitizedArchive(target, targetUrl, archive, log, maximumArchiveBytes);
    receipt = { ...receipt, status: 'complete', completedAt: new Date().toISOString(), restoredCounts: finalCounts,
      migrations, safety, sequences, ...sanitizedArchive, providerSecretColumnsRetired: true,
      historicalBackupsAndWalErased: false,
      freshness: 'Original publication timestamps preserved. This is the existing backup, not a live production refresh.',
      handoff: 'Runtime is not pointed here. Provider secrets retired; connection ownership and non-provider data preserved.' };
    await saveReceipt(receiptPath, receipt);
    console.log(JSON.stringify({ targetDatabase: targetName, sourceObjects: objects, counts: finalCounts, catalogue,
      quarantine: receipt.quarantine, safety, receipt: fileURLToPath(receiptPath) }, null, 2));
    return receipt;
  } catch (error) {
    if (receipt) { receipt.status = 'failed'; receipt.failedAt = new Date().toISOString(); await saveReceipt(receiptPath, receipt); }
    throw error;
  } finally {
    if (sourceTransaction) await source.query('ROLLBACK').catch(() => {});
    await Promise.all([source.end(), admin.end(), targetConnected ? target.end() : Promise.resolve()]);
    if (log) await new Promise(resolve => log.end(resolve));
  }
}

// Archive mode is deliberately separate from the existing local-backup mode.
const tableName = value => {
  const parts = value.split('.');
  if (parts.length === 1) parts.unshift('public');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(part)))
    throw Error('Source counts require ordinary schema-qualified PostgreSQL table names');
  return parts;
};
const userSchema = "n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'";
async function archiveInventory(db) {
  const tables = (await db.query(`SELECT n.nspname AS schema,c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE ${userSchema} AND c.relkind IN ('r','p','f') ORDER BY 1,2`)).rows;
  const objects = (await db.query(`SELECT
    (SELECT count(*)::int FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS tables,
    (SELECT count(*)::int FROM pg_sequences WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS sequences,
    (SELECT count(*)::int FROM pg_views WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS views,
    (SELECT count(*)::int FROM pg_matviews WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema') AS materialized_views,
    (SELECT count(*)::int FROM pg_namespace n WHERE ${userSchema}) AS schemas,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${userSchema}) AS functions,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${userSchema} AND c.relkind IN ('i','I')) AS indexes,
    (SELECT count(*)::int FROM pg_extension) AS extensions`)).rows[0];
  return { tables, objects };
}
async function archiveCounts(db, expected) {
  const result = {};
  for (const name of Object.keys(expected)) {
    result[name] = (await db.query(`SELECT count(*)::text AS count FROM ${tableName(name).map(ident).join('.')}`)).rows[0].count;
  }
  return result;
}
async function archiveCatalogue(db) {
  const row = (await db.query(`SELECT count(*)::text AS jobs,
    count(*) FILTER (WHERE online AND NOT blocked)::text AS online_nonblocked FROM public.job_search_documents`)).rows[0];
  return { jobs: row.jobs, onlineNonblocked: row.online_nonblocked };
}
function sameMeasurements(expected, actual, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (String(value) !== String(actual[key])) throw Error(`${label} differs for ${key}; staging database preserved`);
  }
}
async function dockerOutput(url, program, args, log) {
  const child = docker(url, program, args);
  const done = exit(child, log, program);
  child.stdin.end();
  let output = '';
  const consume = (async () => {
    for await (const chunk of child.stdout) {
      output += chunk;
      if (output.length > 65536) throw Error('Unexpectedly large local tool output');
    }
  })();
  try { await Promise.all([done, consume]); }
  catch (error) { child.kill(); await Promise.allSettled([done, consume]); throw error; }
  return output.trim();
}
async function copyIntoContainer(path, destination, log) {
  const child = spawn('docker', ['cp', path, `${container}:${destination}`],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  await exit(child, log, 'Copying verified archive into PostgreSQL container');
}
function removeMigrationSection(sql, start, end) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw Error('Archive-safe migration boundaries changed; refusing historical data deletion');
  return sql.slice(0, from) + sql.slice(to);
}
async function archiveMigration(name) {
  let sql = await readFile(new URL(`../../scripts/sql/${name}`, import.meta.url), 'utf8');
  if (name === 'career-agent.sql') {
    // Install the schema, not the old bookmark/profile import from graph records.
    sql = removeMigrationSection(sql, 'INSERT INTO candidate_applications(', 'CREATE TABLE IF NOT EXISTS candidate_mutations');
    sql = removeMigrationSection(sql, 'INSERT INTO candidate_career_profiles(', '-- Retain the existing sentence inputs');
  } else if (name === 'career-agent-workflows.sql') {
    // Never delete/deduplicate imported application rows. A conflicting unique
    // index fails closed and leaves the complete staging database for inspection.
    sql = removeMigrationSection(sql, 'WITH duplicates AS (', 'CREATE UNIQUE INDEX IF NOT EXISTS candidate_applications_stable_job');
  } else if (name === 'career-agent-enrichment.sql') {
    // Retired review intents/columns remain historical data. Enforce the current
    // contract on new writes without removing old records.
    sql = `ALTER TABLE candidate_setup_intents DROP CONSTRAINT IF EXISTS candidate_setup_intents_kind_check;
      ALTER TABLE candidate_setup_intents ADD CONSTRAINT candidate_setup_intents_kind_check
      CHECK (kind IN ('provider','voice','upload')) NOT VALID;`;
  }
  return sql;
}


export async function restoreRecruitersArchive({ archivePath, archiveSha256, sourceMetadata, targetName }) {
  if (!/^recruiters_rip_neodb_\d{14}$/.test(targetName || ''))
    throw Error('Archive restore requires a new recruiters_rip_neodb_<UTC timestamp> staging database');
  if (!/^[a-fA-F0-9]{64}$/.test(archiveSha256 || '')) throw Error('A SHA256 archive checksum is required');
  archiveSha256 = archiveSha256.toLowerCase();
  if (sourceMetadata?.host !== 'neodb.jobstash.xyz' || sourceMetadata.database !== 'jobstash'
      || sourceMetadata.sourceReadOnly !== true || !sourceMetadata.snapshot
      || !Number.isFinite(Date.parse(sourceMetadata.capturedAt))
      || !/^(?:PostgreSQL\s+)?18(?:\.|\b)/.test(String(sourceMetadata.version))
      || !Number.isSafeInteger(Number(sourceMetadata.bytes)) || Number(sourceMetadata.bytes) <= 0)
    throw Error('Fresh neodb jobstash PostgreSQL 18 snapshot metadata is required');
  const sourceCounts = sourceMetadata.counts;
  const sourceObjects = sourceMetadata.objects;
  const nonnegative = value => /^(0|[1-9]\d*)$/.test(String(value));
  if (!sourceCounts || !Object.keys(sourceCounts).length || !Object.values(sourceCounts).every(nonnegative)
      || !sourceObjects || !['tables', 'sequences', 'views', 'materialized_views'].every(key => nonnegative(sourceObjects[key]))
      || !['jobs', 'onlineNonblocked'].every(key => nonnegative(sourceMetadata.catalogue?.[key])))
    throw Error('Exact source table/object counts and catalogue counts are required');
  const objectKeys = new Set(['tables', 'sequences', 'views', 'materialized_views', 'schemas', 'functions', 'indexes', 'extensions']);
  if (Object.keys(sourceObjects).some(key => !objectKeys.has(key) || !nonnegative(sourceObjects[key])))
    throw Error('Unsupported source object inventory; provide measured PostgreSQL object totals');
  const catalogueCounts = { jobs: sourceMetadata.catalogue.jobs, onlineNonblocked: sourceMetadata.catalogue.onlineNonblocked };
  const expectedTables = Object.keys(sourceCounts).map(name => tableName(name).join('.'));
  if (new Set(expectedTables).size !== expectedTables.length || !expectedTables.includes('public.job_search_documents'))
    throw Error('Source counts must uniquely cover the full catalogue');
  const localPath = await realpath(local);
  const localInfo = await stat(localPath);
  if (!localInfo.isDirectory() || (localInfo.mode & 0o077)) throw Error('Restore directory must be private (0700)');
  const archive = resolve(archivePath instanceof URL ? fileURLToPath(archivePath) : archivePath);
  const archiveRelative = relative(localPath, await realpath(archive));
  if (!archiveRelative || archiveRelative === '..' || archiveRelative.startsWith('../') || isAbsolute(archiveRelative)
      || !(await lstat(archive)).isFile()) throw Error('Archive must be a regular file inside the private .local directory');
  const config = JSON.parse(await readFile(new URL('recruiters-environment.json', local), 'utf8'));
  const runtimeUrl = new URL(config.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(runtimeUrl.protocol) || runtimeUrl.hostname !== '127.0.0.1'
      || runtimeUrl.port !== '55480' || runtimeUrl.pathname !== '/recruiters_rip_local'
      || runtimeUrl.search || runtimeUrl.hash || config.LOCAL_ONLY !== 'true')
    throw Error('Configured runtime must be the dedicated local recruiters PostgreSQL database');
  const adminUrl = new URL(runtimeUrl); adminUrl.pathname = '/postgres';
  const targetUrl = new URL(runtimeUrl); targetUrl.pathname = `/${targetName}`;
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const target = new pg.Client({ connectionString: targetUrl.href });
  const receiptPath = new URL(`${targetName}-restore.json`, local);
  const archiveFile = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
  let receipt, log, restoreWorkDir, targetConnected = false, phase = 'preflight';
  try {
    const archiveInfo = await archiveFile.stat();
    if (!archiveInfo.isFile() || archiveInfo.size < 5 || (archiveInfo.mode & 0o077))
      throw Error('Archive must be a nonempty private regular file (0600)');
    const archiveBytes = archiveInfo.size;
    const header = Buffer.alloc(5);
    await archiveFile.read(header, 0, 5, 0);
    if (header.toString() !== 'PGDMP') throw Error('Archive is not a full PostgreSQL custom-format dump');
    const hash = createHash('sha256');
    for await (const chunk of archiveFile.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
    if (hash.digest('hex') !== archiveSha256) throw Error('Archive SHA256 mismatch; no database created');
    await admin.connect();
    const identity = (await admin.query(`SELECT current_setting('server_version_num')::int AS version,
      inet_server_port() AS port,system_identifier::text AS system_identifier FROM pg_control_system()`)).rows[0];
    if (identity.version < 180000 || identity.version >= 190000 || identity.port !== 5432)
      throw Error('Expected the dedicated local PostgreSQL 18 server');
    const lock = (await admin.query("SELECT pg_try_advisory_lock(hashtext('recruiters-full-restore:'||$1)) AS acquired", [targetName])).rows[0];
    if (!lock.acquired) throw Error('This staging restore is already running');
    const existing = (await admin.query('SELECT oid::text AS oid FROM pg_database WHERE datname=$1', [targetName])).rows[0];
    let saved;
    try { saved = JSON.parse(await readFile(receiptPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing) {
      if (saved?.status === 'complete' && saved.providerSecretColumnsRetired === true && saved.sourceMode === 'neodb-full-archive' && saved.databaseOid === existing.oid
          && saved.targetDatabase === targetName && saved.archive === archive && saved.archiveSha256 === archiveSha256
          && saved.archiveBytes === archiveBytes
          && JSON.stringify(saved.sourceSnapshot) === JSON.stringify(sourceMetadata)) return { ...saved, alreadyRestored: true };
      throw Error('Staging database already exists without this completed archive receipt; preserved without changes');
    }
    if (saved) throw Error('A receipt already owns this staging name; choose a fresh timestamp');
    const estimatedDatabaseBytes = Math.ceil(Number(sourceMetadata.bytes) * 1.10);
    const reserveBytes = 10 * 1024 ** 3;
    const capacity = await statfs(localPath);
    const availableBytes = capacity.bavail * capacity.bsize;
    // The host file is already allocated; reserve its container copy and the database.
    if (availableBytes < estimatedDatabaseBytes + archiveBytes + reserveBytes)
      throw Error('Insufficient host disk for the full database, container archive copy and 10 GiB reserve');
    const logPath = new URL(`${targetName}-${randomUUID()}.restore.log`, local);
    log = createWriteStream(logPath, { flags: 'wx', mode: 0o600 });
    const connectionArgs = ['-h', '127.0.0.1', '-p', '5432', '-U', decodeURIComponent(runtimeUrl.username)];
    const containerIdentity = await dockerOutput(runtimeUrl, 'psql', [...connectionArgs, '-X', '-At', '-d', 'postgres',
      '-c', 'SELECT system_identifier::text FROM pg_control_system()'], log);
    if (containerIdentity !== identity.system_identifier) throw Error('Container tools do not address the configured local PostgreSQL server');
    const toolVersion = await dockerOutput(runtimeUrl, 'pg_restore', ['--version'], log);
    if (!/^pg_restore \(PostgreSQL\) 18\./.test(toolVersion)) throw Error('PostgreSQL 18 restore tools are required');
    const dataDirectory = (await admin.query('SHOW data_directory')).rows[0].data_directory;
    const disk = await dockerOutput(runtimeUrl, 'df', ['-Pk', dataDirectory], log);
    const diskRows = disk.split('\n');
    const diskColumns = diskRows.at(-1).trim().split(/\s+/);
    const containerAvailableBytes = Number(diskColumns[3]) * 1024;
    if (!Number.isSafeInteger(containerAvailableBytes) || containerAvailableBytes < estimatedDatabaseBytes + archiveBytes + reserveBytes)
      throw Error('Insufficient PostgreSQL volume space for the full database, archive and 10 GiB reserve');
    receipt = { version: 2, sourceMode: 'neodb-full-archive', status: 'verified',
      transport: 'private-local-file', startedAt: new Date().toISOString(),
      targetDatabase: targetName, archive, archiveSha256, archiveBytes,
      sourceDatabase: 'neodb.jobstash.xyz/jobstash', sourceReadOnly: true, sourceSnapshot: sourceMetadata,
      sourceCounts, sourceObjects, catalogue: sourceMetadata.catalogue, log: fileURLToPath(logPath),
      capacity: { archiveBytes, localArchiveBytes: archiveBytes,
        sourceBytes: Number(sourceMetadata.bytes), estimatedDatabaseBytes, availableBytes, containerAvailableBytes, reserveBytes } };
    await saveReceipt(receiptPath, receipt);
    restoreWorkDir = `/tmp/recruiters-archive-${randomUUID()}`;
    await dockerOutput(runtimeUrl, 'mkdir', ['-m', '700', restoreWorkDir], log);
    const containerArchive = `${restoreWorkDir}/catalogue.dump`;
    console.log('Copying the verified local backup file into PostgreSQL.');
    await copyIntoContainer(archive, containerArchive, log);
    const finalArchiveInfo = await archiveFile.stat();
    if (finalArchiveInfo.size !== archiveInfo.size || finalArchiveInfo.mtimeMs !== archiveInfo.mtimeMs
        || finalArchiveInfo.ctimeMs !== archiveInfo.ctimeMs) throw Error('Local archive changed during verification/copy');
    await admin.query(`CREATE DATABASE ${ident(targetName)} TEMPLATE template0`);
    receipt.databaseOid = (await admin.query('SELECT oid::text AS oid FROM pg_database WHERE datname=$1', [targetName])).rows[0].oid;
    receipt.transfer = { bytes: archiveBytes, sha256: archiveSha256, verifiedAt: new Date().toISOString(), sha256VerifiedBeforeRestore: true };
    phase = receipt.status = 'restoring'; await saveReceipt(receiptPath, receipt);
    const restoreSections = async sections => {
      const restore = docker(runtimeUrl, 'pg_restore', [...connectionArgs, '--jobs=4', '--verbose',
        '--no-owner', '--no-privileges', '--exit-on-error', '--dbname', targetName,
        ...sections.map(section => `--section=${section}`), containerArchive],
        '-c maintenance_work_mem=4GB -c max_parallel_maintenance_workers=0');
      const restored = exit(restore, log, 'Native PostgreSQL archive restore');
      restore.stdin.end(); restore.stdout.resume();
      await restored;
    };
    console.log('Restoring schema with native pg_restore.');
    await restoreSections(['pre-data']);
    await target.connect(); targetConnected = true;
    // This production CHECK function calls unqualified public helpers, while
    // pg_restore clears search_path. Pin it only for loading, then restore its setting.
    const summaryCheck = (await target.query("SELECT proconfig FROM pg_proc WHERE oid=to_regprocedure('public.profile_summary_sentence_is_valid(text)')")).rows[0];
    const pinSummaryCheck = summaryCheck && !summaryCheck.proconfig?.some(setting => setting.startsWith('search_path='));
    if (pinSummaryCheck) await target.query('ALTER FUNCTION public.profile_summary_sentence_is_valid(text) SET search_path=pg_catalog,public');
    console.log('Restoring all table data and indexes with pg_restore --jobs=4.');
    await restoreSections(['data', 'post-data']);
    if (pinSummaryCheck) await target.query('ALTER FUNCTION public.profile_summary_sentence_is_valid(text) RESET search_path');
    phase = receipt.status = 'verifying'; await saveReceipt(receiptPath, receipt);
    const inventory = await archiveInventory(target);
    const restoredTables = inventory.tables.map(table => `${table.schema}.${table.name}`);
    if (restoredTables.length !== expectedTables.length || restoredTables.some(name => !expectedTables.includes(name)))
      throw Error('Source metadata does not describe every restored table');
    sameMeasurements(sourceObjects, inventory.objects, 'Database object inventory');
    receipt.restoredObjects = inventory.objects;
    receipt.restoredCounts = await archiveCounts(target, sourceCounts);
    sameMeasurements(sourceCounts, receipt.restoredCounts, 'Full snapshot row count');
    sameMeasurements(catalogueCounts, await archiveCatalogue(target), 'Catalogue');
    const ownershipBefore = await connectionOwnership(target);
    phase = receipt.status = 'migrating'; await saveReceipt(receiptPath, receipt);
    for (const migration of archiveMigrations) await target.query(await archiveMigration(migration));
    await assertProviderSecretsRetired(target);
    phase = receipt.status = 'quarantining'; await saveReceipt(receiptPath, receipt);
    await target.query('BEGIN');
    try {
      const actions = {
        reasoningConnections: `UPDATE candidate_ai_connections SET status='disconnected',execution_lease=NULL,execution_lease_until=NULL,
          public_state=${connectionMetadataExpression('public_state')},updated_at=now()`,
        voiceConnections: `UPDATE candidate_voice_connections SET status='disconnected',public_state=${connectionMetadataExpression('public_state')},updated_at=now()`,
        pausedRequests: "UPDATE candidate_agent_requests SET status='paused',worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL,finished_at=NULL WHERE status IN ('queued','running')",
        pausedScreeningRuns: "UPDATE candidate_screening_runs SET status='paused',pause_reason='Fresh neodb restore: imported work quarantined',updated_at=now() WHERE status='running'",
        resetRunningScreeningJobs: "UPDATE candidate_screening_jobs SET status='pending',last_error='Fresh neodb restore: run paused',next_retry_at=NULL WHERE status='running'",
        closedVoiceSessions: "UPDATE candidate_voice_sessions SET status='closed',closed_at=COALESCE(closed_at,now()),updated_at=now(),usage_complete=false WHERE status IN ('creating','active','closing')",
        cancelledVoiceDelegations: "UPDATE candidate_voice_delegations SET status='cancelled',updated_at=now() WHERE status IN ('queued','running')",
        interruptedParses: "UPDATE candidate_parse_attempts SET status='failed',finished_at=COALESCE(finished_at,now()) WHERE status IN ('queued','running','processing')",
        interruptedUploads: "UPDATE candidate_document_uploads SET status='failed',error_code='local_restore_quarantined',updated_at=now() WHERE status='processing'",
        interruptedMcpUsage: "UPDATE mcp_usage_receipts SET state='failed',completed_at=COALESCE(completed_at,now()) WHERE state='pending'",
        revokedImportedGrants: "UPDATE mcp_grants SET revoked_at=COALESCE(revoked_at,now()) WHERE revoked_at IS NULL",
      };
      receipt.quarantine = await quarantineImportedDeviceWork(target);
      for (const [name, sql] of Object.entries(actions)) receipt.quarantine[name] = (await target.query(sql)).rowCount;
      verifyConnectionOwnership(ownershipBefore, await connectionOwnership(target));
      receipt.quarantine.connectionOwnershipPreserved = true;
      receipt.quarantine.providerSecretsRetired = true;
      await target.query('COMMIT');
    } catch (error) { await target.query('ROLLBACK'); throw error; }
    receipt.safety = (await target.query(`SELECT
      (SELECT count(*)::int FROM candidate_ai_connections WHERE status<>'disconnected' OR execution_lease IS NOT NULL OR execution_lease_until IS NOT NULL) AS unsafe_reasoning_connections,
      (SELECT count(*)::int FROM candidate_voice_connections WHERE status<>'disconnected') AS unsafe_voice_connections,
      (SELECT count(*)::int FROM candidate_agent_requests WHERE status IN ('queued','running')) AS active_requests,
      (SELECT count(*)::int FROM candidate_screening_runs WHERE status='running') AS active_screening_runs,
      (SELECT count(*)::int FROM candidate_screening_jobs WHERE status='running') AS running_screening_jobs,
      (SELECT count(*)::int FROM candidate_voice_sessions WHERE status IN ('creating','active','closing')) AS active_voice_sessions,
      (SELECT count(*)::int FROM candidate_voice_delegations WHERE status IN ('queued','running')) AS active_voice_delegations,
      (SELECT count(*)::int FROM candidate_parse_attempts WHERE status IN ('queued','running','processing')) AS active_parses,
      (SELECT count(*)::int FROM candidate_document_uploads WHERE status='processing') AS active_uploads,
      (SELECT count(*)::int FROM mcp_usage_receipts WHERE state='pending') AS active_mcp_usage,
      (SELECT count(*)::int FROM mcp_grants WHERE revoked_at IS NULL) AS active_imported_grants,
      (SELECT count(*)::int FROM candidate_device_tasks WHERE status IN ('waiting_for_device','running')) AS active_device_tasks,
      (SELECT count(*)::int FROM candidate_devices WHERE status<>'revoked') AS active_devices,
      (SELECT count(*)::int FROM candidate_browser_applications WHERE status NOT IN ('submitted','failed','cancelled')) AS active_browser_runs`)).rows[0];
    if (Object.values(receipt.safety).some(value => value !== 0)) throw Error('Imported work is not fully quarantined');
    receipt.finalCounts = await archiveCounts(target, sourceCounts);
    for (const [name, value] of Object.entries(sourceCounts)) {
      if (BigInt(receipt.finalCounts[name]) < BigInt(value)) throw Error(`Migration removed rows from ${name}`);
    }
    receipt.catalogue = { ...sourceMetadata.catalogue, ...await archiveCatalogue(target) };
    sameMeasurements(catalogueCounts, receipt.catalogue, 'Final catalogue');
    receipt.status = 'complete'; receipt.completedAt = new Date().toISOString();
    receipt.migrations = archiveMigrations;
    receipt.providerSecretColumnsRetired = true;
    receipt.historicalBackupsAndWalErased = false;
    receipt.archivePolicy = 'Original input archive is unchanged and may contain historical provider ciphertext. No new unsanitized archive is retained.';
    receipt.migrationPolicy = 'No legacy bookmark/profile reimport, application deduplication, or retired-intent deletion; historical rows retained.';
    receipt.handoff = 'Staging only. Preserve current product-owned state before the separately authorized atomic runtime cutover.';
    await saveReceipt(receiptPath, receipt);
    return receipt;
  } catch (error) {
    if (receipt) {
      receipt.status = 'failed'; receipt.failedPhase = phase; receipt.failedAt = new Date().toISOString();
      await saveReceipt(receiptPath, receipt);
    }
    throw Error(`Archive restore stopped during ${phase}; archive and any staging database are preserved. ${error.message}`, { cause: error });
  } finally {
    if (restoreWorkDir && log) {
      await dockerOutput(runtimeUrl, 'rm', ['-f', `${restoreWorkDir}/catalogue.dump`], log).catch(() => {});
      await dockerOutput(runtimeUrl, 'rmdir', [restoreWorkDir], log).catch(() => {});
    }
    await Promise.allSettled([admin.end(), targetConnected ? target.end() : Promise.resolve(),
      archiveFile.close()]);
    if (log) await new Promise(resolve => log.end(resolve));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restoreRecruitersDatabase(process.argv[2]).then(receipt => {
    if (receipt.alreadyRestored) console.log(`Full local snapshot already restored into ${receipt.targetDatabase}; no changes made.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
