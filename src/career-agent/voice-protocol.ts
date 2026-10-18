import { BadRequestException } from "@nestjs/common";
import { isUUID } from "class-validator";

export const MAX_VOICE_EVENT_BYTES = 16 * 1024;
export type VoiceTranscript = {
  event_id: string;
  speaker: "user" | "assistant";
  delta: string;
  start_ms: number;
  end_ms: number;
};
export type VoiceEvent =
  | { kind: "active" }
  | { kind: "transcript"; transcript: VoiceTranscript }
  | { kind: "delegation"; id: string; offset_ms: number };

export function byteBound(value: string, limit: number): string {
  if (Buffer.byteLength(value, "utf8") <= limit) return value;
  let result = "", bytes = 0;
  for (const char of value) {
    const length = Buffer.byteLength(char, "utf8");
    if (bytes + length > limit) break;
    bytes += length;
    result += char;
  }
  return result;
}

export function exactObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key)))
    throw new BadRequestException("Invalid device voice input");
  return value as Record<string, unknown>;
}
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86_400_000;

/** Only normalized text and delegation state cross the signed device boundary. */
export function parseDeviceVoiceEvent(input: unknown): { eventId: string; event: VoiceEvent } {
  const body = exactObject(input, ["eventId", "event"]);
  if (!isUUID(body.eventId) || Buffer.byteLength(JSON.stringify(body)) > MAX_VOICE_EVENT_BYTES)
    throw new BadRequestException("Invalid device voice event");
  const event = exactObject(body.event, ["kind", "transcript", "id", "offset_ms"]);
  if (event.kind === "active") {
    exactObject(event, ["kind"]);
    return { eventId: body.eventId as string, event: { kind: "active" } };
  }
  if (event.kind === "transcript") {
    exactObject(event, ["kind", "transcript"]);
    const part = exactObject(event.transcript, ["event_id", "speaker", "delta", "start_ms", "end_ms"]);
    if (identifier(part.event_id) && ["user", "assistant"].includes(String(part.speaker)) &&
        typeof part.delta === "string" && Buffer.byteLength(part.delta) <= 8192 &&
        time(part.start_ms) && time(part.end_ms) && part.end_ms >= part.start_ms)
      return { eventId: body.eventId as string, event: { kind: "transcript", transcript: part as VoiceTranscript } };
  }
  if (event.kind === "delegation") {
    exactObject(event, ["kind", "id", "offset_ms"]);
    if (identifier(event.id) && time(event.offset_ms))
      return { eventId: body.eventId as string, event: { kind: "delegation", id: event.id, offset_ms: event.offset_ms } };
  }
  throw new BadRequestException("Invalid device voice event");
}

export function parseVoiceClose(input: unknown): { failed: boolean; usage: { seconds: number } | null } {
  const value = exactObject(input, ["failed", "usage"]);
  if (value.failed !== undefined && typeof value.failed !== "boolean") throw new BadRequestException("Invalid voice closure");
  if (value.usage == null) return { failed: value.failed === true, usage: null };
  const usage = exactObject(value.usage, ["seconds"]);
  if (!time(usage.seconds) || usage.seconds > 86_400) throw new BadRequestException("Invalid voice usage");
  return { failed: value.failed === true, usage: { seconds: usage.seconds } };
}
