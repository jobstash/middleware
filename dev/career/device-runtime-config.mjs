import { randomBytes } from 'node:crypto';

// Explicit local setup only. Runtime entrypoints must never recover retired keys.
export function migrateDeviceRuntimeConfig(config) {
  const result = { ...config };
  result.CAREER_DATA_PROTECTION_KEY = result.CAREER_DATA_PROTECTION_KEY || result.CAREER_CREDENTIAL_KEY || randomBytes(32).toString('hex');
  if (!/^[a-f0-9]{64}$/i.test(result.CAREER_DATA_PROTECTION_KEY)) throw Error('A 32-byte hex career data-protection key is required');
  for (const key of Object.keys(result)) {
    if (/^CAREER_(?:CREDENTIAL|WORKER|BASIC_CV_CREDENTIAL)/.test(key) || /^(?:OPENAI|ANTHROPIC|CODEX|CHATGPT|AZURE_OPENAI|GOOGLE_GENERATIVE_AI|GEMINI|GROK|XAI|OPENROUTER|MISTRAL|COHERE|DEEPSEEK)_(?:.*(?:KEY|TOKEN|SECRET|CREDENTIAL).*)$/.test(key)) delete result[key];
  }
  delete result.LOCAL_INFERENCE_MODE;
  return result;
}

export const providerConnectionTables = new Set(['candidate_ai_connections', 'candidate_voice_connections']);
export const retiredProviderColumns = new Set(['credential_ciphertext', 'credential_lease', 'credential_lease_until']);
export function isRetiredColumn(table, column) {
  return (providerConnectionTables.has(table) && retiredProviderColumns.has(column)) ||
    (table === 'candidate_voice_sessions' && ['provider_session_id', 'answer_sdp'].includes(column));
}
// Only display/model metadata crosses an old-schema preservation boundary.
export function connectionMetadataExpression(column) {
  return `jsonb_strip_nulls(jsonb_build_object('model',${column}->'model','reasoningEffort',${column}->'reasoningEffort','execution','device'))`;
}

export async function assertProviderSecretsRetired(db) {
  const { rows } = await db.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=ANY($1::text[]) AND column_name=ANY($2::text[])`, [[...providerConnectionTables], [...retiredProviderColumns]]);
  if (rows.length) throw Error('Device migration has not retired provider secret columns');
}
