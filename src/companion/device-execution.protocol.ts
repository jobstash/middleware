import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash, createPublicKey, KeyObject, verify } from "node:crypto";
import { json, RequestHandler } from "express";
import * as Joi from "joi";

export interface DeviceIdentity {
  id: string;
  owner: string;
}
export const publicationRanges = [
  "today",
  "yesterday",
  "past_3_days",
  "past_week",
  "past_2_weeks",
  "past_month",
  "all",
] as const;
export interface MatchingCatalogueArgs {
  publicationRange: (typeof publicationRanges)[number];
  since: string | null;
  until: string;
  offset?: number;
  countOnly?: boolean;
}
export interface EmployerSearchQuery {
  name: string;
  website?: string;
}
/** Signed CV share: 5 MiB decoded document plus JSON/base64 framing and employment within 7.5 MiB. */
export const DEVICE_CV_BODY_LIMIT = 7.5 * 1024 * 1024;
export const DEVICE_CV_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DEVICE_CV_TEXT_CHARACTERS = 100000;
export const CV_SHARE_CONSENT_VERSION = 1;
export const cvEmploymentKinds: Record<string, string> = {
  profile: "EntityProfile",
  organization: "Organization",
  project: "Project",
};
export const CV_PDF = "application/pdf";
export const CV_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export interface CvEmploymentItem {
  ref: string;
  title: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
}
export type CvShareDocument =
  | {
      filename: string;
      mediaType: typeof CV_PDF | typeof CV_DOCX;
      contentBase64: string;
    }
  | { filename: string; mediaType: "text/plain"; text: string };
export interface CvShareInput {
  document: CvShareDocument;
  employment: CvEmploymentItem[];
  consent: { version: typeof CV_SHARE_CONSENT_VERSION; grantedAt: string };
}
interface DeviceInputs {
  pair: {
    requestId: string;
    deviceId: string;
    publicKey: string;
    label: string;
  };
  revoke: { requestId: string };
  checkout: { requestId: string; interval: "month" | "year" };
  cancel: { requestId: string };
  activate: { challenge: string; account: { id: string; label: string } };
  empty: Record<string, never>;
  platform:
    | { operation: "status"; args: Record<string, never> }
    | { operation: "matching_catalogue"; args: MatchingCatalogueArgs }
    | { operation: "job_read"; args: { id: string } }
    | { operation: "matching_jobs"; args: { ids: string[] } }
    | { operation: "employer_profile"; args: { ref: string } }
    | {
        operation: "employer_search";
        args: { queries: EmployerSearchQuery[] };
      }
    | { operation: "intro_paths"; args: { jobIds: string[] } };
  cv: CvShareInput;
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
const publicationTimestamp = Joi.string()
  .max(24)
  .pattern(
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$(?![\s\S])/,
  )
  .required();
export const devicePlatformOperations = [
  "status",
  "job_read",
  "matching_catalogue",
  "matching_jobs",
  "employer_search",
  "employer_profile",
  "intro_paths",
] as const;
const cvDate = Joi.string()
  .max(7)
  .pattern(/^[0-9]{4}(?:-(?:0[1-9]|1[0-2]))?$(?![\s\S])/);
const cvEmployment = object({
  ref: Joi.string()
    .max(32)
    .pattern(/^(?:profile|organization|project):[1-9][0-9]{0,18}$(?![\s\S])/)
    .required(),
  title: text(200),
  startDate: cvDate.required(),
  endDate: cvDate.allow(null).required(),
  current: Joi.boolean().required(),
});
const cvDocument = Joi.alternatives()
  .try(
    object({
      filename: text(255),
      mediaType: Joi.string().valid(CV_PDF, CV_DOCX).required(),
      contentBase64: Joi.string()
        .min(4)
        .max(Math.ceil(DEVICE_CV_DOCUMENT_BYTES / 3) * 4)
        .required(),
    }),
    object({
      filename: text(255),
      mediaType: Joi.string().valid("text/plain").required(),
      // Tab, CR and LF are the only control characters a CV text keeps.
      text: Joi.string()
        .max(DEVICE_CV_TEXT_CHARACTERS)
        .pattern(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+$(?![\s\S])/)
        .required(),
    }),
  )
  .required();
const platformArgs = {
  status: object({}),
  matching_catalogue: object({
    publicationRange: Joi.string()
      .valid(...publicationRanges)
      .required(),
    since: publicationTimestamp.allow(null),
    until: publicationTimestamp,
    offset: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER),
    countOnly: Joi.boolean(),
  }),
  job_read: object({ id: matchingId }),
  matching_jobs: object({
    ids: Joi.array().items(matchingId).min(1).max(10).unique().required(),
  }),
  employer_search: object({
    queries: Joi.array()
      .items(object({ name: text(200), website: text(300).optional() }))
      .min(1)
      .max(20)
      .required(),
  }),
  employer_profile: object({
    ref: Joi.string()
      .pattern(/^(?:profile|organization|project):[1-9][0-9]{0,18}$(?![\s\S])/)
      .required(),
  }),
  intro_paths: object({
    jobIds: Joi.array().items(matchingId).min(1).max(10).unique().required(),
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
  checkout: object({
    requestId: uuid,
    interval: Joi.string().valid("month", "year").required(),
  }),
  cancel: object({ requestId: uuid }),
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
  cv: object({
    document: cvDocument,
    employment: Joi.array().items(cvEmployment).max(50).required(),
    consent: object({
      version: Joi.valid(CV_SHARE_CONSENT_VERSION).required(),
      grantedAt: publicationTimestamp,
    }),
  }),
};
const validTimestamp = (timestamp: string): boolean => {
  const time = Date.parse(timestamp);
  const normalized = timestamp.replace(
    /(?:\.([0-9]{1,3}))?Z$/,
    (_, fraction = "") => `.${fraction.padEnd(3, "0")}Z`,
  );
  return Number.isFinite(time) && new Date(time).toISOString() === normalized;
};
/** Partial dates compare on their common precision: "2021" overlaps "2021-03". */
export function cvDatesOrdered(
  startDate: string,
  endDate: string | null,
): boolean {
  if (endDate === null) return true;
  const length = Math.min(startDate.length, endDate.length);
  return startDate.slice(0, length) <= endDate.slice(0, length);
}
/** Several roles at one entity stay distinct; an identical role is one edge. */
export function cvEmploymentKey(item: CvEmploymentItem): string {
  return sha256(
    `${item.title}\n${item.startDate}\n${item.endDate}\n${item.current}`,
  );
}
export function deviceInput<K extends keyof DeviceInputs>(
  kind: K,
  value: unknown,
): DeviceInputs[K] {
  const parsed = schemas[kind].validate(value, { convert: false });
  if (parsed.error) throw new BadRequestException("Invalid companion input");
  if (kind === "platform") {
    const input = parsed.value as DeviceInputs["platform"];
    if (input.operation === "matching_catalogue") {
      const { publicationRange, since, until } = input.args;
      if (
        !validTimestamp(until) ||
        (publicationRange === "all"
          ? since !== null
          : since === null ||
            !validTimestamp(since) ||
            Date.parse(since) >= Date.parse(until))
      )
        throw new BadRequestException("Invalid publication window");
    }
    if (
      input.operation === "employer_search" &&
      input.args.queries.some(
        query =>
          !query.name.trim() ||
          (query.website !== undefined && !query.website.trim()),
      )
    )
      throw new BadRequestException("Invalid employer search");
  }
  if (kind === "cv") {
    const { document, employment, consent } = parsed.value as CvShareInput;
    if (!document.filename.trim() || /[\\/]/.test(document.filename))
      throw new BadRequestException("Choose a file with a valid filename");
    if ("text" in document && !document.text.trim())
      throw new BadRequestException("The CV text is empty");
    if (!validTimestamp(consent.grantedAt))
      throw new BadRequestException("Invalid consent time");
    const keys = new Set<string>();
    for (const item of employment) {
      if (
        !item.title.trim() ||
        (item.current && item.endDate !== null) ||
        !cvDatesOrdered(item.startDate, item.endDate) ||
        BigInt(item.ref.split(":")[1]) > 9223372036854775807n
      )
        throw new BadRequestException("Invalid employment entry");
      const key = `${item.ref}:${cvEmploymentKey(item)}`;
      if (keys.has(key))
        throw new BadRequestException("Duplicate employment entry");
      keys.add(key);
    }
  }
  return parsed.value;
}
/** Route-scoped JSON parser for the signed CV share; keeps the exact bytes for signature verification. */
export function deviceCvBodyParser(): RequestHandler {
  const parser = json({
    limit: DEVICE_CV_BODY_LIMIT,
    verify: (request, _response, body) => {
      Object.assign(request, { rawBody: body });
    },
  });
  // A distinct name keeps Nest's global "jsonParser" registration for every other route.
  return function deviceCvJson(request, response, next) {
    return parser(request, response, next);
  };
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
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        key =>
          `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
