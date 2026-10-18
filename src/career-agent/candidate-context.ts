export type CandidateScope = "data:read" | "account:read" | "account:write" | "career:read" | "career:write";

interface CandidateOwner {
  owner: string;
  wallet: string;
}

export type CandidateInvocationContext =
  | (CandidateOwner & { kind: "session" })
  | (CandidateOwner & { kind: "device"; deviceId: string })
  | (CandidateOwner & {
      kind: "oauth";
      grantId: string;
      clientId: string;
      scopes: CandidateScope[];
    })
  | (CandidateOwner & {
      kind: "worker";
      workerId: string;
      agentRequestId: string;
    });

export interface CandidateCapabilityResult {
  data: unknown;
  links?: Array<{ rel: string; href: string }>;
}
