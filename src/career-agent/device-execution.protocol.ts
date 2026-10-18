import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash, createPublicKey, verify } from "node:crypto";
import * as Ajv from "ajv";

export interface DeviceIdentity { id: string; owner: string }
export const uuid = { type: "string", format: "uuid", minLength: 36, maxLength: 36 };
const model = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$(?![\\s\\S])", maxLength: 200 };
const effort = { anyOf: [{ type: "null" }, { type: "string", pattern: "^[a-z][a-z0-9_-]{0,31}$(?![\\s\\S])", maxLength: 32 }] };
const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "^[^\\u0000-\\u001f\\u007f]*$(?![\\s\\S])" });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const count = { type: "integer", minimum: 0, maximum: 1000000000 };
const usage = object({ model, inputTokens: count, outputTokens: count, cachedTokens: count }, ["model"]);
export const devicePlatformOperations = ["status", "search_jobs", "job_read", "matching_catalogue", "matching_jobs", "legacy_sources", "legacy_source_read", "legacy_career", "legacy_applications", "legacy_application_read"] as const;
const page = { limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0, maximum: 10000 } };
const matchingId = { type: "string", pattern: "^node:[1-9][0-9]{0,18}$(?![\\s\\S])", maxLength: 24 };
const platformArgs = {
  status: object({}),
  search_jobs: object({ query: text(200), ...page }, []),
  job_read: object({ id: text(100) }),
  matching_catalogue: object({}),
  matching_jobs: object({ ids: { type: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: matchingId } }),
  legacy_sources: object(page, []),
  legacy_source_read: object({ id: uuid }),
  legacy_career: object({}),
  legacy_applications: object(page, []),
  legacy_application_read: object({ id: uuid, ...page }, ["id"]),
};
export const deviceSchemas = {
  pair: object({ requestId: uuid, deviceId: uuid, publicKey: { type: "string", pattern: "^[A-Za-z0-9_-]{59}$(?![\\s\\S])" }, label: text(100) }),
  revoke: object({ requestId: uuid }),
  activate: object({ challenge: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$(?![\\s\\S])" }, account: object({ id: { type: "string", pattern: "^[1-9][0-9]{0,19}$(?![\\s\\S])" }, label: text(200) }) }),
  empty: object({}),
  platform: { oneOf: devicePlatformOperations.map(operation => object({ operation: { const: operation }, args: platformArgs[operation] })) },
  connection: object({ connectionId: uuid, provider: { enum: ["openai", "anthropic", "codex"] }, purpose: { enum: ["reasoning", "voice"] }, model, reasoningEffort: effort,
    models: { type: "array", minItems: 1, maxItems: 200, items: object({ id: model, label: text(200), reasoningEfforts: { type: "array", maxItems: 16, uniqueItems: true, items: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,31}$(?![\\s\\S])", maxLength: 32 } }, defaultReasoningEffort: effort }) } }),
  claim: object({ connectionId: uuid, requestId: uuid }, ["connectionId"]),
  lease: object({ leaseId: uuid }),
  result: object({ leaseId: uuid, eventId: uuid, result: {}, usage: { type: "array", maxItems: 100, items: usage }, model, reasoningEffort: effort }, ["leaseId", "eventId", "result", "model", "reasoningEffort"]),
};
const ajv = new Ajv({ allErrors: false });
const validators = Object.fromEntries(Object.entries(deviceSchemas).map(([name, schema]) => [name, ajv.compile(schema)]));
export function deviceInput<T extends Record<string, any> = Record<string, any>>(kind: keyof typeof deviceSchemas, value: unknown): T {
  if (!validators[kind](value)) throw new BadRequestException("Invalid device input");
  return value as T;
}
export function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
export function deviceCanonicalRequest(time: string, nonce: string, method: string, path: string, body: Buffer): string {
  return `${time}\n${nonce}\n${method}\n${path}\n${sha256(body)}`;
}
export function devicePublicKey(publicKey: string) {
  try {
    const bytes = Buffer.from(publicKey, "base64url");
    if (bytes.length !== 44 || bytes.toString("base64url") !== publicKey) throw new Error();
    const key = createPublicKey({ key: bytes, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") throw new Error();
    return key;
  } catch { throw new BadRequestException("Invalid device public key"); }
}
export function verifyDeviceSignature(publicKey: string, bytes: string, signature: string): void {
  if (signature.length !== 86 || !/^[A-Za-z0-9_-]{86}$/.test(signature) ||
      !verify(null, Buffer.from(bytes), devicePublicKey(publicKey), Buffer.from(signature, "base64url")))
    throw new ForbiddenException("Invalid device signature");
}
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function deviceSourceScopeSql(requestAlias: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(requestAlias)) throw new Error("Invalid device source query alias");
  return `(${requestAlias}.source_pins IS NULL OR EXISTS(
    SELECT 1 FROM candidate_documents device_source
    WHERE device_source.id::text=${requestAlias}.source_pins->>'documentId' AND device_source.user_node_id=${requestAlias}.user_node_id
      AND device_source.content_hash=${requestAlias}.source_pins->>'contentHash'
      AND encode(sha256(convert_to(COALESCE(device_source.source_text,''),'UTF8')),'hex')=${requestAlias}.source_pins->>'sourceTextHash'
      AND COALESCE(device_source.extraction_provenance,'null'::jsonb) IS NOT DISTINCT FROM ${requestAlias}.source_pins->'provenance'))`;
}
