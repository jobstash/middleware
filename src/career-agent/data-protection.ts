import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(keyHex: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(keyHex ?? ""))
    throw new Error("Configure a 32-byte CAREER_DATA_PROTECTION_KEY");
  return Buffer.from(keyHex, "hex");
}

/** Retains the existing v1 envelope and binding for saved assessment data. */
export function protectCareerData(value: unknown, keyHex: string, binding: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyHex), iv);
  cipher.setAAD(Buffer.from(binding));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openCareerData(value: string, keyHex: string, binding: string): unknown {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1") throw new Error("Unsupported protected data version");
  const cipher = createDecipheriv("aes-256-gcm", keyBytes(keyHex), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(binding));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]).toString("utf8"));
}
