import { createHmac } from "node:crypto";
import { verifyDocumentRegistration } from "./document-registration";

describe("document upload ownership proof", () => {
  const secret = "local-test-document-secret-of-32-characters";
  const auth = "Bearer alice-session";
  const input = {
    id: "d7efcc5c-ae70-4a89-ab7d-041053aa6bc0",
    contentHash: "a".repeat(64),
    filename: "cv.pdf",
    sourceText: "Original facts",
  };
  const sign = (stamp: string) =>
    createHmac("sha256", secret)
      .update(
        `career-upload-v1\n${auth}\n${stamp}\n${JSON.stringify([input.id, input.contentHash, input.filename, input.sourceText])}`,
      )
      .digest("hex");
  it("accepts the uploading session and rejects tampering, other users and expired proofs", () => {
    const stamp = String(Date.now()),
      signature = sign(stamp);
    expect(() =>
      verifyDocumentRegistration(secret, auth, stamp, signature, input),
    ).not.toThrow();
    expect(() =>
      verifyDocumentRegistration(
        secret,
        "Bearer bob-session",
        stamp,
        signature,
        input,
      ),
    ).toThrow();
    expect(() =>
      verifyDocumentRegistration(secret, auth, stamp, signature, {
        ...input,
        sourceText: "Invented facts",
      }),
    ).toThrow();
    const expired = String(Date.now() - 60_000);
    expect(() =>
      verifyDocumentRegistration(secret, auth, expired, sign(expired), input),
    ).toThrow();
    expect(() =>
      verifyDocumentRegistration(secret, auth, stamp, undefined, input),
    ).toThrow();
  });
});
