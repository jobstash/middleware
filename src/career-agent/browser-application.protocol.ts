import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const browserActionKinds = ["observe", "click", "fill", "select", "scroll", "upload", "navigate", "submit", "ask", "finish"] as const;
export const interruptionReasons = ["approval_required", "human_handoff", "origin_changed", "stale_reference", "unsupported_control"] as const;
export interface BrowserAction {
  kind: typeof browserActionKinds[number]; ref: string | null; valueKey: string | null;
  artifactId: string | null; url: string | null; direction: "up" | "down" | null;
  question: string | null; confirmation: string | null; reference: string | null;
}
export interface BrowserElement {
  ref: string; kind: "input" | "textarea" | "select" | "button" | "link" | "file" | "checkbox" | "radio";
  label: string; value: string | null; options: { value: string; label: string }[]; href: string | null; required: boolean;
}
export interface BrowserObservation {
  url: string; title: string; text: string; elements: BrowserElement[];
  viewport: { width: number; height: number; deviceScaleFactor: number }; timezone: string; visible: boolean;
}
export interface BrowserInterruption {
  reason: typeof interruptionReasons[number]; url: string | null; commandId: string | null; submitted: boolean;
  scope?: "navigation" | "network";
  submitAttempted?: boolean;
}
export interface BrowserActionResult {
  commandId: string; status: "ok" | "blocked" | "error"; message: string | null; submitted: boolean;
  reason?: typeof interruptionReasons[number];
}
export interface BrowserArtifact {
  id: string; kind: "cv" | "letter"; filename: string; sha256: string; byteLength: number;
  contentType: "application/pdf"; downloadPath: string;
}
export interface BrowserCommand { id: string; sequence: number; action: BrowserAction; approved: boolean; observationHash: string }
export interface BrowserRunView {
  id: string; status: "ready" | "running" | "awaiting_approval" | "needs_user" | "paused" | "submitted" | "uncertain" | "failed" | "cancelled";
  documentId: string; revision: number; applicationId: string; shortUUID: string; title: string; company: string | null;
  applyUrl: string; allowedOrigins: string[]; clientToken: string; sequence: number; metadata: Record<string, string>;
  packetHash: string; deviceId: string; connectionId: string; connectionGeneration: number; model: string; reasoningEffort: string | null;
  pendingOrigin?: string | null;
  answerLabels?: Record<string, string>;
  artifacts: BrowserArtifact[]; command: BrowserCommand | null;
  question: { id: string; text: string; kind: "answer" | "handoff" | "origin" } | null; message: string | null;
  receipt: { url: string; confirmation: string; reference: string | null; at: string; artifactHashes: string[] } | null;
}
export interface BrowserDeviceReceipt {
  deviceId: string; payload: Record<string, unknown>; signature: string;
}
const nullableString = { type: ["string", "null"] };
export const browserActionSchema: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["kind", "ref", "valueKey", "artifactId", "url", "direction", "question", "confirmation", "reference"],
  properties: { kind: { type: "string", enum: browserActionKinds }, ref: nullableString, valueKey: nullableString,
    artifactId: nullableString, url: nullableString, direction: { type: ["string", "null"], enum: ["up", "down", null] },
    question: nullableString, confirmation: nullableString, reference: nullableString },
};
export function browserCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(browserCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${browserCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function browserHash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : browserCanonicalJson(value)).digest("hex");
}
export function emptyBrowserAction(kind: BrowserAction["kind"]): BrowserAction {
  return { kind, ref: null, valueKey: null, artifactId: null, url: null, direction: null, question: null, confirmation: null, reference: null };
}
export function browserDestination(value: string, localOrigin?: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException("Invalid browser destination"); }
  const host = url.hostname.toLowerCase();
  const local = localOrigin && url.origin === localOrigin && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(host);
  // IP literals, single-label hosts and private-use DNS names are never production destinations.
  if (url.username || url.password || value.length > 2048 || (!local &&
      (url.protocol !== "https:" || (url.port && url.port !== "443") || isIP(host) || host.includes(":") || !host.includes(".") ||
       /(?:^|\.)(?:localhost|local|internal|test|invalid|example|home|lan|onion)$/.test(host) || host.endsWith(".") || /^\d+(?:\.\d+)*$/.test(host))))
    throw new BadRequestException("Only public HTTPS application destinations are allowed");
  return url;
}
function string(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
export function validateBrowserObservation(value: unknown): asserts value is BrowserObservation {
  const o = value as BrowserObservation;
  if (!o || typeof o !== "object" || !string(o.url, 2048) || !string(o.title, 500) || !string(o.text, 16000) ||
      Object.keys(o).some(key => !["url", "title", "text", "elements", "viewport", "timezone", "visible"].includes(key)) ||
      !string(o.timezone, 100) || o.visible !== true || !Array.isArray(o.elements) || o.elements.length > 150 ||
      !o.viewport ||
      ![o.viewport.width, o.viewport.height].every(n => Number.isInteger(n) && n >= 100 && n <= 8192) ||
      !Number.isFinite(o.viewport.deviceScaleFactor) || o.viewport.deviceScaleFactor < 0.5 || o.viewport.deviceScaleFactor > 5)
    throw new BadRequestException("A visible, bounded browser observation is required");
  const refs = new Set<string>();
  for (const e of o.elements) {
    if (!e || !string(e.ref, 150) || !e.ref || refs.has(e.ref) || !["input", "textarea", "select", "button", "link", "file", "checkbox", "radio"].includes(e.kind) ||
        Object.keys(e).some(key => !["ref", "kind", "label", "value", "options", "href", "required"].includes(key)) ||
        !string(e.label, 500) || (e.value !== null && !string(e.value, 2000)) || (e.href !== null && !string(e.href, 2048)) || typeof e.required !== "boolean" ||
        !Array.isArray(e.options) || e.options.length > 300 || e.options.some(option => !string(option.value, 500) || !string(option.label, 500)))
      throw new BadRequestException("Invalid visible browser element");
    refs.add(e.ref);
  }
}
export function validateBrowserAction(value: unknown): BrowserAction {
  const a = value as BrowserAction;
  const keys = Object.keys((browserActionSchema.properties as object));
  if (!a || typeof a !== "object" || Object.keys(a).length !== keys.length || keys.some(key => !(key in a)) ||
      !browserActionKinds.includes(a.kind) || ![null, "up", "down"].includes(a.direction) ||
      keys.filter(key => !["kind", "direction"].includes(key)).some(key => a[key] !== null && !string(a[key], 2048)))
    throw new BadRequestException("Planner returned an invalid browser action");
  const fields: Record<BrowserAction["kind"], string[]> = {
    observe: [], click: ["ref"], fill: ["ref", "valueKey"], select: ["ref", "valueKey"], scroll: ["direction"],
    upload: ["ref", "artifactId"], navigate: ["url"], submit: ["ref"], ask: ["question"], finish: ["confirmation", "reference"],
  };
  if (keys.some(key => key !== "kind" && !fields[a.kind].includes(key) && a[key] !== null))
    throw new BadRequestException("Unused browser action fields must be null");
  if (a.kind === "scroll" && !a.direction) throw new BadRequestException("Choose a scroll direction");
  return a;
}
export const browserMetadataKeys = ["name", "email", "phone", "linkedin", "github", "location", "residenceCountry", "workAuthorization", "requiresSponsorship", "minimumSalary", "salaryCurrency", "coverLetter"];
export const securityChallenge = /\b(?:password|passcode|one.time|otp|captcha|security code|verification code|credit card|bank account|social security|passport)\b/i;
export function validateBrowserMetadata(value: Record<string, string>, savedKeys: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 80 ||
      Object.entries(value).some(([key, text]) => ![...browserMetadataKeys, ...savedKeys].includes(key) ||
        !string(text, key === "coverLetter" ? 60000 : key.startsWith("saved_answer_") ? 6000 : 4000) || securityChallenge.test(key)))
    throw new BadRequestException("Use only reviewed contact, preferences and saved application answers");
}
