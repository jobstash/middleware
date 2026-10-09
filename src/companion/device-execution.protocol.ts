import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash, createPublicKey, KeyObject, verify } from "node:crypto";
import * as Joi from "joi";

export interface DeviceIdentity {
  id: string;
  owner: string;
}
interface DeviceInputs {
  pair: {
    requestId: string;
    deviceId: string;
    publicKey: string;
    label: string;
  };
  revoke: { requestId: string };
  checkout: { requestId: string };
  activate: { challenge: string; account: { id: string; label: string } };
  empty: Record<string, never>;
  platform:
    | {
        operation: "status" | "matching_catalogue";
        args: Record<string, never>;
      }
    | { operation: "job_read"; args: { id: string } }
    | { operation: "matching_jobs"; args: { ids: string[] } };
}
const uuid = Joi.string().guid().length(36).required();
const text = (limit: number): Joi.StringSchema =>
  Joi.string()
    .max(limit)
    .pattern(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/)
    .required();
const object = (fields: Record<string, Joi.Schema>): Joi.ObjectSchema =>
  Joi.object(fields).unknown(false).required();
const matchingId = Joi.string()
  .pattern(/^node:[1-9][0-9]{0,18}$(?![\s\S])/)
  .required();
export const devicePlatformOperations = [
  "status",
  "job_read",
  "matching_catalogue",
  "matching_jobs",
] as const;
const platformArgs = {
  status: object({}),
  matching_catalogue: object({}),
  job_read: object({ id: matchingId }),
  matching_jobs: object({
    ids: Joi.array().items(matchingId).min(1).max(10).unique().required(),
  }),
};
const schemas = {
  pair: object({
    requestId: uuid,
    deviceId: uuid,
    publicKey: Joi.string()
      .length(59)
      .pattern(/^[A-Za-z0-9_-]{59}$(?![\s\S])/)
      .required(),
    label: text(100),
  }),
  revoke: object({ requestId: uuid }),
  checkout: object({ requestId: uuid }),
  activate: object({
    challenge: Joi.string()
      .length(43)
      .pattern(/^[A-Za-z0-9_-]{43}$(?![\s\S])/)
      .required(),
    account: object({
      id: Joi.string()
        .pattern(/^[1-9][0-9]{0,19}$(?![\s\S])/)
        .required(),
      label: text(200),
    }),
  }),
  empty: object({}),
  platform: Joi.alternatives()
    .try(
      ...devicePlatformOperations.map(operation =>
        object({
          operation: Joi.valid(operation).required(),
          args: platformArgs[operation],
        }),
      ),
    )
    .required(),
};
export function deviceInput<K extends keyof DeviceInputs>(
  kind: K,
  value: unknown,
): DeviceInputs[K] {
  const parsed = schemas[kind].validate(value, { convert: false });
  if (parsed.error) throw new BadRequestException("Invalid companion input");
  return parsed.value;
}
export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
export function deviceCanonicalRequest(
  time: string,
  nonce: string,
  method: string,
  path: string,
  body: Buffer,
): string {
  return `${time}\n${nonce}\n${method}\n${path}\n${sha256(body)}`;
}
export function devicePublicKey(publicKey: string): KeyObject {
  try {
    const bytes = Buffer.from(publicKey, "base64url");
    if (bytes.length !== 44 || bytes.toString("base64url") !== publicKey)
      throw new Error();
    const key = createPublicKey({ key: bytes, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") throw new Error();
    return key;
  } catch {
    throw new BadRequestException("Invalid device public key");
  }
}
export function verifyDeviceSignature(
  publicKey: string,
  bytes: string,
  signature: string,
): void {
  if (
    signature.length !== 86 ||
    !/^[A-Za-z0-9_-]{86}$/.test(signature) ||
    !verify(
      null,
      Buffer.from(bytes),
      devicePublicKey(publicKey),
      Buffer.from(signature, "base64url"),
    )
  )
    throw new ForbiddenException("Invalid device signature");
}
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
