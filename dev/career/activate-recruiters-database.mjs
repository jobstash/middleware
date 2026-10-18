// Atomically activate a verified local staging database, retaining the prior database.
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { identifier, validateTarget, localEnvironment, assertQuiescent, catalogueFingerprint, fixtureFingerprint, verifyManifest } from './preserve-recruiters-state.mjs';
import { assertProviderSecretsRetired } from './device-runtime-config.mjs';

const local = new URL('./.local/', import.meta.url);
const targetName = validateTarget(process.argv[2]);
const { url } = await localEnvironment();
const restore = JSON.parse(await readFile(new URL(`${targetName}-restore.json`, local), 'utf8'));
const preserved = JSON.parse(await readFile(new URL(`${targetName}-preserved.json`, local), 'utf8'));
if (restore.status !== 'complete' || preserved.status !== 'complete' || restore.targetDatabase !== targetName ||
    preserved.targetDatabase !== targetName || String(restore.databaseOid) !== preserved.targetOid ||
    restore.archiveSha256 !== preserved.archiveSha256 || !preserved.sourceOid || !preserved.targetSelection ||
    restore.providerSecretColumnsRetired !== true || preserved.providerSecretColumnsRetired !== true || preserved.providerSecretsImported !== false)
  throw Error('Complete and verify fresh restore and fixture preservation for this target first');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
try {
  await admin.query('BEGIN');
  await admin.query('SELECT pg_advisory_xact_lock(73129109)');
  const databases = (await admin.query('SELECT datname,oid::text FROM pg_database WHERE datname=ANY($1)', [['recruiters_rip_local', targetName]])).rows;
  const current = databases.find(row => row.datname === 'recruiters_rip_local');
  const staging = databases.find(row => row.datname === targetName);
  if (!current || !staging || current.oid !== preserved.sourceOid || staging.oid !== preserved.targetOid) throw Error('Database identity changed; no activation performed');
  const assertNoClients = async () => {
    const { rows: [{ count }] } = await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=ANY($1) AND backend_type='client backend'", [['recruiters_rip_local', targetName]]);
    if (count) throw Error('Stop all clients of both local databases before activation; none will be terminated automatically');
  };
  await assertNoClients();
  for (const [name, expectedState, expectedCatalogue, expectedManifest] of [
    ['recruiters_rip_local', preserved.sourceStateSha256, preserved.sourceCatalogue, preserved.sourceManifest],
    [targetName, preserved.targetSelection.sha256, preserved.freshCatalogue, preserved.targetManifest],
  ]) {
    const connection = new URL(url); connection.pathname = `/${name}`;
    const db = new pg.Client({ connectionString: connection.href });
    await db.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await assertQuiescent(db);
      // Both databases must be sanitized before the old runtime becomes a retained archive.
      await assertProviderSecretsRetired(db);
      const state = await fixtureFingerprint(db);
      if (state.fixturesSha256 !== preserved.fixturesSha256 || state.sha256 !== expectedState) throw Error(`Candidate state changed after preservation in ${name}`);
      const manifestSha256 = await verifyManifest(db, expectedManifest);
      if (manifestSha256 !== (name === targetName ? preserved.candidateStateSha256 : preserved.sourceStateSha256)) throw Error(`Preservation receipt fingerprint changed for ${name}`);
      if (!same(await catalogueFingerprint(db), expectedCatalogue)) throw Error(`Catalogue changed after preservation in ${name}`);
      await assertQuiescent(db);
      await db.query('COMMIT');
    } finally { await db.end(); }
  }
  await assertNoClients();
  const archive = 'recruiters_rip_before_neodb_' + new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [archive])).rowCount) throw Error('Rollback archive name already exists; nothing renamed');
  // PostgreSQL rejects either rename if a client connects in the final interval;
  // both names change in one transaction or neither does. No session is killed.
  await admin.query(`ALTER DATABASE ${identifier('recruiters_rip_local')} RENAME TO ${identifier(archive)}`);
  await admin.query(`ALTER DATABASE ${identifier(targetName)} RENAME TO ${identifier('recruiters_rip_local')}`);
  await admin.query('COMMIT');
  const receipt = {
    status: 'complete', activeDatabase: 'recruiters_rip_local', activeOid: staging.oid,
    stagedDatabase: targetName, archivedDatabase: archive, archivedOid: current.oid,
    activatedAt: new Date().toISOString(), archiveSha256: restore.archiveSha256,
    sourceStateSha256: preserved.sourceStateSha256, candidateStateSha256: preserved.candidateStateSha256,
    preservedConnectionIds: preserved.connectionIds, preservedDocumentIds: preserved.documentIds,
    catalogue: preserved.freshCatalogue, runtimeConfigurationUnchanged: true,
    providerSecretColumnsRetired: true, providerSecretsImported: false, historicalBackupsAndWalErased: false,
  };
  await writeFile(new URL('recruiters-database-active.json', local), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ activeDatabase: receipt.activeDatabase, activeOid: receipt.activeOid, archivedDatabase: archive, priorDatabasePreserved: true, runtimeConfigurationUnchanged: true }));
} catch (error) { await admin.query('ROLLBACK').catch(() => {}); throw error; }
finally { await admin.end(); }
