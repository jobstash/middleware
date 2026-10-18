// Transplant explicit local fixture ownership, never the old database catalogue.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { providerConnectionTables, isRetiredColumn, connectionMetadataExpression, assertProviderSecretsRetired } from './device-runtime-config.mjs';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, project: fileURLToPath(new URL('../../tsconfig.json', import.meta.url)) });
const { openCareerData, protectCareerData } = require('../../src/career-agent/data-protection.ts');
for (const type of [1082, 1114, 1184]) pg.types.setTypeParser(type, value => value);
const local = new URL('./.local/', import.meta.url);
export const identifier = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Unexpected database identifier');
  return `"${name}"`;
};
export const validateTarget = name => {
  if (!/^recruiters_rip_neodb_\d{14}$/.test(name ?? '')) throw Error('Supply staging database recruiters_rip_neodb_<14-digit UTC timestamp>');
  return name;
};
export async function localEnvironment() {
  const env = JSON.parse(await readFile(new URL('recruiters-environment.json', local), 'utf8'));
  const url = new URL(env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '55480' || url.pathname !== '/recruiters_rip_local' || env.LOCAL_ONLY !== 'true') throw Error('Dedicated local product database required');
  return { env, url };
}
const canonical = value => {
  if (Buffer.isBuffer(value)) return { bytes: value.toString('base64') };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const serialize = value => JSON.stringify(canonical(value));
const digest = value => createHash('sha256').update(serialize(value)).digest('hex');
const numeric = value => ['string', 'number'].includes(typeof value) && /^\d+$/.test(String(value));
const nodeFields = new Set(['owner', 'actor', 'userId', 'user_id', 'userNodeId', 'user_node_id', 'jobId', 'jobNodeId', 'job_node_id', 'nodeId', 'node_id', 'embeddingNodeId', 'embedding_node_id', 'organizationNodeId', 'organization_node_id', 'projectNodeId', 'project_node_id', 'email_node_id', 'source_node_id', 'target_node_id']);
const relationshipFields = new Set(['relationshipId', 'relationship_id']);
const disposable = new Set(['candidate_network_cache', 'candidate_network_leases', 'user_cache_locks']);
const ownedLabel = label => /^User(?!Permission$)/.test(label) || ['CandidateDocument', 'LinkedAccount', 'LinkedWallet'].includes(label);
const candidateTable = name => /^(candidate_|mcp_|user_)/.test(name) && !disposable.has(name);

async function metadata(db) {
  const columns = (await db.query(`SELECT table_name,column_name,data_type,is_generated,column_default,is_identity,identity_generation
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows
    .filter(column => !isRetiredColumn(column.table_name, column.column_name));
  const keys = (await db.query(`SELECT t.relname AS table_name, array_agg(a.attname::text ORDER BY k.ordinality) AS columns
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
    WHERE c.contype='p' AND c.connamespace='public'::regnamespace GROUP BY t.relname`)).rows;
  const foreignKeys = (await db.query(`SELECT c.conname,t.relname AS table_name,p.relname AS target_table,
    array_agg(a.attname::text ORDER BY k.ordinality) AS columns,array_agg(b.attname::text ORDER BY k.ordinality) AS target_columns,c.confmatchtype
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_class p ON p.oid=c.confrelid
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(local_key,foreign_key,ordinality)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.local_key
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.foreign_key
    WHERE c.contype='f' AND c.connamespace='public'::regnamespace GROUP BY c.oid,t.relname,p.relname`)).rows;
  return { columns, keys: new Map(keys.map(row => [row.table_name, row.columns])), foreignKeys };
}
function selectedColumns(table, columns) {
  return columns.map(column => providerConnectionTables.has(table) && column === 'public_state'
    ? `${connectionMetadataExpression(identifier(column))} AS ${identifier(column)}` : identifier(column)).join(',');
}
function selectOwnedColumns(table, meta) {
  return selectedColumns(table, meta.columns.filter(column => column.table_name === table).map(column => column.column_name));
}
export async function assertQuiescent(db) {
  const { rows: [{ count }] } = await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'");
  if (count) throw Error('Stop all clients of this database; none will be terminated automatically');
  const checks = [
    ['candidate_agent_requests', "status IN ('queued','running')"],
    ['candidate_screening_runs', "status='running'"],
    // Pausing leaves job rows 'running' with cancelled requests; the run and
    // executable request states above, not historical job labels, define activity.
    ['candidate_voice_sessions', "status IN ('creating','active','closing')"],
    ['candidate_voice_delegations', "status IN ('queued','running')"],
    ['candidate_parse_attempts', "status IN ('queued','running','processing')"],
    ['candidate_document_uploads', "status='processing'"],
    ['mcp_usage_receipts', "state='pending'"],
    ['candidate_device_tasks', "status IN ('waiting_for_device','running')"],
    ['candidate_browser_applications', "status IN ('ready','running','awaiting_approval')"],
  ];
  for (const [table, condition] of checks) {
    if ((await db.query('SELECT to_regclass($1) AS name', [`public.${table}`])).rows[0].name &&
        (await db.query(`SELECT 1 FROM ${identifier(table)} WHERE ${condition} LIMIT 1`)).rowCount) throw Error(`Finish or pause active work in ${table} before preservation`);
  }
}
export async function catalogueFingerprint(db) {
  const { rows: [value] } = await db.query(`SELECT count(*)::text AS jobs,
    count(*) FILTER (WHERE online AND NOT blocked)::text AS online_nonblocked,
    md5(COALESCE(string_agg(row_hash,'' ORDER BY job_node_id),'')) AS rows_md5
    FROM (SELECT job_node_id,online,blocked,md5(to_jsonb(j)::text) AS row_hash FROM job_search_documents j) catalogue`);
  return value;
}
function manifest(data, meta) {
  return Object.fromEntries([...data].sort(([a], [b]) => a.localeCompare(b)).filter(([, rows]) => rows.length).map(([table, rows]) => {
    const keys = meta.keys.get(table);
    if (!keys?.length) throw Error(`Cannot fingerprint unkeyed state ${table}`);
    const columns = meta.columns.filter(c => c.table_name === table).map(c => c.column_name);
    const entries = rows.map(row => ({ key: keys.map(key => row[key]), hash: digest(Object.fromEntries(columns.map(column => [column, row[column]]))) }));
    entries.sort((a, b) => serialize(a.key).localeCompare(serialize(b.key)));
    return [table, { keys, columns, count: rows.length, entries, sha256: digest(entries) }];
  }));
}
export async function verifyManifest(db, expected) {
  for (const [table, entry] of Object.entries(expected)) {
    const actual = [];
    for (const item of entry.entries) {
      const rows = (await db.query(`SELECT ${selectedColumns(table, entry.columns)} FROM ${identifier(table)} WHERE ${entry.keys.map((key, index) => `${identifier(key)}=$${index + 1}`).join(' AND ')}`, item.key)).rows;
      if (rows.length !== 1) throw Error(`Preserved row disappeared from ${table}`);
      actual.push({ key: item.key, hash: digest(rows[0]) });
    }
    if (actual.length !== entry.count || digest(actual) !== entry.sha256) throw Error(`State fingerprint changed in ${table}`);
  }
  return digest(expected);
}

async function collectOwnedState(source, fixtures, meta) {
  const data = new Map();
  const rowKeys = new Map();
  const owners = new Set();
  const add = (table, rows) => {
    if (!rows.length) return false;
    const keys = meta.keys.get(table);
    if (!keys?.length) throw Error(`Missing primary key for selected state ${table}`);
    if (!data.has(table)) { data.set(table, []); rowKeys.set(table, new Set()); }
    let changed = false;
    for (const row of rows) {
      if (row.user_node_id != null && !owners.has(String(row.user_node_id))) throw Error(`Cross-owner state in ${table}`);
      const key = serialize(keys.map(key => row[key]));
      if (rowKeys.get(table).has(key)) continue;
      rowKeys.get(table).add(key); data.get(table).push(row); changed = true;
    }
    return changed;
  };
  for (const fixture of fixtures.accounts ?? []) {
    if (!/^[a-z][a-z0-9-]*$/.test(fixture.key) || !fixture.privyDid || !fixture.address) throw Error('Invalid explicit local fixture');
    const rows = (await source.query(`SELECT * FROM graph_nodes WHERE label='User' AND node_key=$1
      AND properties->>'privyId'=$2 AND lower(properties->>'wallet')=lower($3)`, [`recruiters-local:${fixture.key}`, fixture.privyDid, fixture.address])).rows;
    if (rows.length !== 1) throw Error(`Cannot identify local fixture ${fixture.key}`);
    owners.add(String(rows[0].id)); add('graph_nodes', rows);
  }
  if (!owners.size || owners.size !== fixtures.accounts.length) throw Error('Explicit distinct fixture owners required');
  const ownerTables = [...new Set(meta.columns.filter(c => c.column_name === 'user_node_id' && candidateTable(c.table_name)).map(c => c.table_name))];
  for (const table of ownerTables) add(table, (await source.query(`SELECT ${selectOwnedColumns(table, meta)} FROM ${identifier(table)} WHERE user_node_id=ANY($1::bigint[])`, [[...owners]])).rows);
  // Only dependent candidate records and required MCP client/grant parents. Never traverse
  // backwards through a shared client or graph node, which would import other accounts.
  let changed;
  do {
    changed = false;
    for (const fk of meta.foreignKeys) {
      if (!candidateTable(fk.table_name) || !candidateTable(fk.target_table)) continue;
      for (const row of [...(data.get(fk.table_name) ?? [])]) {
        const values = fk.columns.map(column => row[column]);
        if (values.some(value => value == null)) continue;
        changed = add(fk.target_table, (await source.query(`SELECT ${selectOwnedColumns(fk.target_table, meta)} FROM ${identifier(fk.target_table)} WHERE ${fk.target_columns.map((column, i) => `${identifier(column)}=$${i + 1}`).join(' AND ')}`, values)).rows) || changed;
      }
      if (ownerTables.includes(fk.table_name) || fk.target_table === 'mcp_clients') continue;
      for (const row of [...(data.get(fk.target_table) ?? [])]) {
        const values = fk.target_columns.map(column => row[column]);
        changed = add(fk.table_name, (await source.query(`SELECT ${selectOwnedColumns(fk.table_name, meta)} FROM ${identifier(fk.table_name)} WHERE ${fk.columns.map((column, i) => `${identifier(column)}=$${i + 1}`).join(' AND ')}`, values)).rows) || changed;
      }
    }
  } while (changed);
  // Payment events deliberately have no FK in older schemas.
  if (meta.keys.has('candidate_payment_events')) for (const subscription of data.get('candidate_subscriptions') ?? []) add('candidate_payment_events', (await source.query('SELECT * FROM candidate_payment_events WHERE charge_id=$1', [subscription.charge_id])).rows);
  const ownedNodes = new Set([...owners, ...(data.get('candidate_documents') ?? []).map(row => row.embedding_node_id).filter(Boolean).map(String)]);
  const visited = new Set();
  while ([...ownedNodes].some(id => !visited.has(id))) {
    const frontier = [...ownedNodes].filter(id => !visited.has(id));
    frontier.forEach(id => visited.add(id));
    add('graph_nodes', (await source.query('SELECT * FROM graph_nodes WHERE id=ANY($1::bigint[])', [frontier])).rows);
    const edges = (await source.query('SELECT * FROM graph_relationships WHERE source_id=ANY($1::bigint[]) OR target_id=ANY($1::bigint[])', [frontier])).rows;
    add('graph_relationships', edges);
    const ids = [...new Set(edges.flatMap(row => [String(row.source_id), String(row.target_id)]))];
    const nodes = (await source.query('SELECT * FROM graph_nodes WHERE id=ANY($1::bigint[])', [ids])).rows;
    for (const node of nodes) {
      if (node.label === 'User' && !owners.has(String(node.id))) throw Error('Fixture graph reaches an unrelated user; refusing to import it');
      if (ownedLabel(node.label)) ownedNodes.add(String(node.id));
    }
    add('graph_nodes', nodes);
  }
  const graphIds = new Set();
  const relationshipIds = new Set();
  const scanJson = value => {
    if (Array.isArray(value)) { value.forEach(scanJson); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (numeric(entry) && nodeFields.has(key)) graphIds.add(String(entry));
      if (numeric(entry) && relationshipFields.has(key)) relationshipIds.add(String(entry));
      scanJson(entry);
    }
  };
  for (const [table, rows] of data) for (const row of rows) {
    for (const fk of meta.foreignKeys.filter(fk => fk.table_name === table && ['graph_nodes', 'graph_relationships'].includes(fk.target_table))) {
      if (fk.columns.length !== 1) throw Error('Unexpected composite graph reference');
      if (row[fk.columns[0]] != null) (fk.target_table === 'graph_nodes' ? graphIds : relationshipIds).add(String(row[fk.columns[0]]));
    }
    for (const [key, value] of Object.entries(row)) if (nodeFields.has(key) && numeric(value)) graphIds.add(String(value));
    for (const column of meta.columns.filter(c => c.table_name === table && ['json', 'jsonb'].includes(c.data_type))) scanJson(row[column.column_name]);
  }
  if (relationshipIds.size) add('graph_relationships', (await source.query('SELECT * FROM graph_relationships WHERE id=ANY($1::bigint[])', [[...relationshipIds]])).rows);
  for (const edge of data.get('graph_relationships') ?? []) { graphIds.add(String(edge.source_id)); graphIds.add(String(edge.target_id)); }
  if (graphIds.size) add('graph_nodes', (await source.query('SELECT * FROM graph_nodes WHERE id=ANY($1::bigint[])', [[...graphIds]])).rows);
  for (const id of graphIds) if (!(data.get('graph_nodes') ?? []).some(node => String(node.id) === id)) throw Error(`Missing source graph reference ${id}`);
  return { data, owners, ownedNodes };
}

export async function fixtureFingerprint(db) {
  const fixtures = JSON.parse(await readFile(new URL('recruiters-fixtures.json', local), 'utf8'));
  const meta = await metadata(db);
  const { data } = await collectOwnedState(db, fixtures, meta);
  return {
    fixturesSha256: digest(fixtures), sha256: digest(manifest(data, meta)),
    counts: Object.fromEntries([...data].map(([table, rows]) => [table, rows.length])),
  };
}

export async function preserveRecruitersState(targetName) {
  validateTarget(targetName);
  const { env, url } = await localEnvironment();
  const restore = JSON.parse(await readFile(new URL(`${targetName}-restore.json`, local), 'utf8'));
  if (restore.status !== 'complete' || restore.targetDatabase !== targetName || !/^[a-f0-9]{64}$/i.test(restore.archiveSha256 ?? '')) throw Error('Complete the fresh archive restore first');
  const fixtures = JSON.parse(await readFile(new URL('recruiters-fixtures.json', local), 'utf8'));
  const targetUrl = new URL(url); targetUrl.pathname = `/${targetName}`;
  const source = new pg.Client({ connectionString: url.href });
  const target = new pg.Client({ connectionString: targetUrl.href });
  await source.connect();
  try {
    await target.connect();
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await assertQuiescent(source);
    const sourceOid = (await source.query('SELECT oid::text FROM pg_database WHERE datname=current_database()')).rows[0].oid;
    const sourceSnapshot = (await source.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0].snapshot;
    const sourceCatalogue = await catalogueFingerprint(source);
    const meta = await metadata(source);
    const { data, owners, ownedNodes } = await collectOwnedState(source, fixtures, meta);
    const sourceManifest = manifest(data, meta);
    await target.query('BEGIN');
    await target.query('SELECT pg_advisory_xact_lock(73129109)');
    const targetOid = (await target.query('SELECT oid::text FROM pg_database WHERE datname=current_database()')).rows[0].oid;
    if (targetOid !== String(restore.databaseOid)) throw Error('Restore database identity changed');
    await assertQuiescent(target);
    await assertProviderSecretsRetired(target);
    const targetMeta = await metadata(target);
    for (const [table] of data) for (const column of meta.columns.filter(c => c.table_name === table)) {
      if (!targetMeta.columns.some(c => c.table_name === table && c.column_name === column.column_name && c.data_type === column.data_type)) throw Error(`Apply local schema migrations before preservation: ${table}.${column.column_name}`);
    }
    const catalogueBefore = await catalogueFingerprint(target);
    // Only this staging transaction bypasses ETL/embedding triggers. Every imported FK
    // is checked against the target schema, including composite constraints, before commit.
    await target.query('SET LOCAL session_replication_role=replica');
    const mappings = new Map();
    const newRows = new Map([...data].map(([table, rows]) => [table, [...rows]]));
    const graphMap = new Map(); mappings.set('graph_nodes', { primary: 'id', ids: graphMap });
    const reusedNodes = [], archivalJobs = [];
    const allocate = async (table, primary) => {
      const sequence = (await target.query('SELECT pg_get_serial_sequence($1,$2) AS sequence', [table, primary])).rows[0].sequence;
      if (!sequence) throw Error(`Missing target sequence ${table}.${primary}`);
      return (await target.query('SELECT nextval($1::regclass)::text AS id', [sequence])).rows[0].id;
    };
    for (const node of data.get('graph_nodes') ?? []) {
      const candidates = new Map();
      const match = rows => rows.forEach(row => candidates.set(String(row.id), row));
      if (node.node_key) match((await target.query('SELECT id FROM graph_nodes WHERE label=$1 AND node_key=$2', [node.label, node.node_key])).rows);
      if (node.label === 'StructuredJobpost') {
        const docs = (await source.query('SELECT short_uuid,structured_jobpost_id FROM job_search_documents WHERE job_node_id=$1', [node.id])).rows;
        const shorts = [...new Set([node.properties?.shortUUID, ...docs.map(row => row.short_uuid)].filter(Boolean))];
        const stableIds = [...new Set([node.properties?.id, ...docs.map(row => row.structured_jobpost_id)].filter(Boolean))];
        // Public UUIDs and graph keys identify a record. ATS IDs can be shared by
        // duplicate listings, so use them only when no stronger identity exists.
        if (!candidates.size) match((await target.query('SELECT job_node_id AS id FROM job_search_documents WHERE short_uuid=ANY($1::text[])', [shorts])).rows);
        if (!candidates.size) match((await target.query('SELECT job_node_id AS id FROM job_search_documents WHERE structured_jobpost_id=ANY($1::text[])', [stableIds])).rows);
      }
      if (['Organization', 'Project'].includes(node.label)) {
        const field = node.label === 'Organization' ? 'organization' : 'project';
        const docs = (await source.query(`SELECT ${field}_id AS stable_id FROM ${field}_search_documents WHERE ${field}_node_id=$1`, [node.id])).rows;
        const stableIds = [...new Set([node.properties?.id, node.properties?.orgId, ...docs.map(row => row.stable_id)].filter(Boolean))];
        match((await target.query(`SELECT ${field}_node_id AS id FROM ${field}_search_documents WHERE ${field}_id=ANY($1::text[])`, [stableIds])).rows);
      }
      if (candidates.size > 1) throw Error(`Ambiguous stable identity for ${node.label}:${node.id}`);
      if (ownedNodes.has(String(node.id))) {
        if (candidates.size) throw Error(`Local owner/profile identity already exists in staging: ${node.node_key}`);
        if (node.label === 'User' && (await target.query("SELECT 1 FROM graph_nodes WHERE label='User' AND (properties->>'privyId'=$1 OR lower(properties->>'wallet')=lower($2)) LIMIT 1", [node.properties.privyId, node.properties.wallet])).rowCount) throw Error('Fixture identity collides with a production user');
      } else if (candidates.size) {
        const id = [...candidates.keys()][0]; graphMap.set(String(node.id), id);
        reusedNodes.push({ sourceId: String(node.id), targetId: id, label: node.label, nodeKey: node.node_key });
        continue;
      } else if (!['StructuredJobpost', 'UserPermission'].includes(node.label)) {
        throw Error(`Referenced ${node.label}:${node.node_key} is absent from fresh catalogue`);
      }
      graphMap.set(String(node.id), await allocate('graph_nodes', 'id'));
      if (!ownedNodes.has(String(node.id)) && node.label === 'StructuredJobpost') archivalJobs.push(String(node.id));
    }
    newRows.set('graph_nodes', (data.get('graph_nodes') ?? []).filter(node => !reusedNodes.some(reused => reused.sourceId === String(node.id))));
    for (const [table, rows] of newRows) {
      if (table === 'graph_nodes' || !rows.length) continue;
      const keys = meta.keys.get(table);
      if (keys?.length !== 1) continue;
      const column = meta.columns.find(c => c.table_name === table && c.column_name === keys[0]);
      if (!['bigint', 'integer'].includes(column.data_type) || (column.is_identity !== 'YES' && !column.column_default?.startsWith('nextval('))) continue;
      const ids = new Map();
      for (const row of rows) ids.set(String(row[keys[0]]), await allocate(table, keys[0]));
      mappings.set(table, { primary: keys[0], ids });
    }
    const mapped = (table, value) => {
      if (value == null) return value;
      const result = mappings.get(table)?.ids.get(String(value));
      if (result == null) throw Error(`Missing remapped ${table} reference ${value}`);
      return result;
    };
    const remapJson = value => {
      if (Array.isArray(value)) return value.map(remapJson);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
        let next = entry;
        if (numeric(entry) && (nodeFields.has(key) || relationshipFields.has(key))) {
          next = mapped(nodeFields.has(key) ? 'graph_nodes' : 'graph_relationships', entry);
          if (typeof entry === 'number') { next = Number(next); if (!Number.isSafeInteger(next)) throw Error('Unsafe numeric JSON graph identifier'); }
        } else next = remapJson(entry);
        return [key, next];
      }));
    };
    const preserved = new Map();
    const encryptedBindings = [];
    const revokedAt = newRows.get('candidate_devices')?.length ? (await target.query('SELECT now()::text AS value')).rows[0].value : null;
    for (const [table, rows] of newRows) {
      const tableColumns = meta.columns.filter(c => c.table_name === table && c.is_generated === 'NEVER');
      const inserted = [];
      for (const original of rows) {
        const row = { ...original };
        const primaryMap = mappings.get(table);
        if (primaryMap) row[primaryMap.primary] = mapped(table, original[primaryMap.primary]);
        for (const fk of meta.foreignKeys.filter(fk => fk.table_name === table)) for (let i = 0; i < fk.columns.length; i++) {
          const map = mappings.get(fk.target_table);
          if (map?.primary === fk.target_columns[i] && original[fk.columns[i]] != null) row[fk.columns[i]] = mapped(fk.target_table, original[fk.columns[i]]);
        }
        for (const field of nodeFields) if (numeric(original[field])) row[field] = mapped('graph_nodes', original[field]);
        for (const column of tableColumns) if (['json', 'jsonb'].includes(column.data_type)) row[column.column_name] = remapJson(row[column.column_name]);
        // Profile mutation responses use a generic `id`, including responses predating
        // an earlier local transplant. The owning row, not that stale number, is authoritative.
        if (table === 'candidate_mutations' && numeric(original.response?.id) && ['/profile/career', '/settings'].includes(original.response?.href)) row.response.id = mapped('graph_nodes', original.user_node_id);
        for (const field of Object.keys(row)) if (/(^|_)lease($|_)/.test(field)) row[field] = null;
        if (table === 'candidate_agent_requests') row.worker_id = null;
        if (providerConnectionTables.has(table)) {
          row.status = 'disconnected';
          if ('device_id' in row) row.device_id = null;
          row.generation = Number(row.generation) + 1;
          row.public_state = { ...row.public_state, execution: 'device' };
        }
        if (table === 'candidate_devices') {
          row.status = 'revoked';
          row.challenge = null;
          row.challenge_expires_at = null;
          row.revoked_at = row.revoked_at || revokedAt;
        }
        if (table === 'candidate_browser_applications' && !['submitted', 'failed', 'cancelled'].includes(row.status)) {
          row.status = 'cancelled';
          row.state = { ...row.state, view: { ...row.state?.view, status: 'cancelled', command: null, question: null,
            message: 'This saved browser run was restored. Inspect the employer page before starting another application.' } };
        }
        if (table === 'graph_relationships' && original.properties?.encryptedMetadata) {
          const document = (data.get('candidate_documents') ?? []).find(document => String(document.embedding_node_id) === String(original.source_id));
          if (!document) throw Error('Encrypted screening relation has no owned source document');
          const oldBinding = `screening:${document.user_node_id}:${document.id}:${original.target_id}`;
          const newBinding = `screening:${mapped('graph_nodes', document.user_node_id)}:${document.id}:${row.target_id}`;
          const previous = openCareerData(original.properties.encryptedMetadata, env.CAREER_DATA_PROTECTION_KEY, oldBinding);
          const next = remapJson(previous);
          row.properties.encryptedMetadata = protectCareerData(next, env.CAREER_DATA_PROTECTION_KEY, newBinding);
          if (digest(openCareerData(row.properties.encryptedMetadata, env.CAREER_DATA_PROTECTION_KEY, newBinding)) !== digest(next)) throw Error('Screening metadata resealing verification failed');
          encryptedBindings.push({ table, id: row.id, oldBinding, newBinding, previousCiphertextSha256: digest(original.properties.encryptedMetadata), plaintextSha256: digest(next) });
        }
        if (table === 'graph_nodes' && archivalJobs.includes(String(original.id))) row.properties = { ...row.properties, online: false, preservedArchive: { sourceDatabase: 'recruiters_rip_local', sourceNodeId: String(original.id), reason: 'Absent from fresh production snapshot' } };
        const values = tableColumns.map(column => ['json', 'jsonb'].includes(column.data_type) && row[column.column_name] != null ? JSON.stringify(row[column.column_name]) : row[column.column_name]);
        const override = tableColumns.some(c => c.identity_generation === 'ALWAYS') ? ' OVERRIDING SYSTEM VALUE' : '';
        // A shared MCP client may already exist, but it must be byte-for-byte identical.
        if (table === 'mcp_clients') {
          const existing = (await target.query('SELECT * FROM mcp_clients WHERE id=$1', [row.id])).rows[0];
          if (existing) { if (digest(existing) !== digest(row)) throw Error('MCP client identity collision'); inserted.push(existing); continue; }
        }
        const result = await target.query(`INSERT INTO ${identifier(table)} (${tableColumns.map(c => identifier(c.column_name)).join(',')})${override} VALUES (${values.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING ${selectOwnedColumns(table, targetMeta)}`, values);
        const saved = result.rows[0];
        for (const column of tableColumns) if (serialize(saved[column.column_name]) !== serialize(row[column.column_name])) throw Error(`Inserted content changed: ${table}.${column.column_name}`);
        inserted.push(saved);
      }
      if (inserted.length) preserved.set(table, inserted);
    }
    let foreignKeysVerified = 0;
    for (const fk of targetMeta.foreignKeys) {
      for (const row of preserved.get(fk.table_name) ?? []) {
        const values = fk.columns.map(column => row[column]);
        if (values.every(value => value == null)) continue;
        if (values.some(value => value == null)) { if (fk.confmatchtype === 'f') throw Error(`Partial MATCH FULL key ${fk.conname}`); continue; }
        const result = await target.query(`SELECT 1 FROM ${identifier(fk.target_table)} WHERE ${fk.target_columns.map((column, i) => `${identifier(column)}=$${i + 1}`).join(' AND ')} LIMIT 1`, values);
        if (!result.rowCount) throw Error(`Broken preserved foreign key ${fk.conname}`);
        foreignKeysVerified++;
      }
    }
    const targetManifest = manifest(preserved, targetMeta);
    await verifyManifest(target, targetManifest);
    await verifyManifest(source, sourceManifest);
    const targetSelection = await fixtureFingerprint(target);
    const catalogueAfter = await catalogueFingerprint(target);
    if (serialize(catalogueBefore) !== serialize(catalogueAfter)) throw Error('Fresh catalogue changed during preservation');
    await assertQuiescent(source); await assertQuiescent(target);
    const originalCustody = (data.get('candidate_documents') ?? []).map(row => ({
      id: row.id, sourceOwner: String(row.user_node_id), targetOwner: mapped('graph_nodes', row.user_node_id),
      contentHash: row.content_hash, sourceTextSha256: digest(row.source_text), filename: row.filename,
      storageKind: row.storage_kind, objectOwner: row.object_owner, objectContentType: row.object_content_type,
      objectByteLength: row.object_byte_length, createdAt: row.created_at,
    }));
    const connectionMetadata = [...providerConnectionTables].flatMap(table => (preserved.get(table) ?? []).map(row => ({ table, id: row.id, provider: row.provider ?? 'voice', userNodeId: String(row.user_node_id), generation: row.generation, status: row.status })));
    const receipt = {
      status: 'complete', targetDatabase: targetName, targetOid, sourceDatabase: 'recruiters_rip_local', sourceOid,
      sourceSnapshot, archiveSha256: restore.archiveSha256, completedAt: new Date().toISOString(),
      fixturesSha256: digest(fixtures), ownerMappings: [...owners].map(id => ({ sourceId: id, targetId: mapped('graph_nodes', id) })),
      sourceReadOnly: true, sourceCatalogue, freshCatalogue: catalogueAfter, sourceManifest, targetManifest,
      sourceStateSha256: digest(sourceManifest), candidateStateSha256: digest(targetManifest), targetSelection,
      sourceCounts: Object.fromEntries([...data].map(([table, rows]) => [table, rows.length])),
      preservedCounts: Object.fromEntries([...preserved].map(([table, rows]) => [table, rows.length])),
      connectionMetadata, connectionIds: connectionMetadata.map(row => row.id), originalCustody,
      documentIds: originalCustody.map(row => row.id), reusedNodes,
      archivalJobs: archivalJobs.map(id => ({ sourceId: id, targetId: mapped('graph_nodes', id) })),
      encryptedBindings, foreignKeysVerified, leasesCleared: true,
      providerSecretsImported: false, providerSecretColumnsRetired: true,
      sourceFingerprintPolicy: 'Connection ownership/model metadata only; provider secrets are never selected or fingerprinted.',
      historicalBackupsAndWalErased: false,
    };
    await target.query('SET LOCAL session_replication_role=origin');
    await target.query('COMMIT'); await source.query('COMMIT');
    await writeFile(new URL(`${targetName}-preserved.json`, local), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await writeFile(new URL('recruiters-state-preserved.json', local), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ targetDatabase: targetName, targetOid, preservedCounts: receipt.preservedCounts, connectionMetadataPreserved: connectionMetadata.length, providerSecretsImported: false, originalDocumentsVerified: originalCustody.length, catalogueUnchanged: true, sourceUntouched: true }));
    return receipt;
  } catch (error) {
    await target.query('ROLLBACK').catch(() => {}); await source.query('ROLLBACK').catch(() => {}); throw error;
  } finally { await source.end(); await target.end().catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await preserveRecruitersState(process.argv[2]);
