import { ForbiddenException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DocumentInput } from "./career.dto";

/** Only the upload server can attest an object; the proof is bound to its session. */
export function verifyDocumentRegistration(
  secret: string | undefined,
  authorization: string,
  stamp: string,
  signature: string,
  input: DocumentInput,
): void {
  if (
    !secret ||
    secret.length < 32 ||
    !authorization?.startsWith("Bearer ") ||
    !/^\d{13}$/.test(stamp ?? "") ||
    Math.abs(Date.now() - Number(stamp)) > 30_000 ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  )
    throw new ForbiddenException("Invalid document upload proof");
  const payload = JSON.stringify([
    input.id,
    input.contentHash,
    input.filename,
    input.sourceText ?? null,
  ]);
  const expected = createHmac("sha256", secret)
    .update(`career-upload-v1\n${authorization}\n${stamp}\n${payload}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new ForbiddenException("Invalid document upload proof");
}
