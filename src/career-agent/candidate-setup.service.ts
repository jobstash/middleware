import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isUUID } from "class-validator";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { MutationInput } from "./career.dto";
import { CandidateInvocationContext } from "./candidate-context";
import { candidateOrigin } from "./candidate-origin";

export type CandidateSetupKind = "provider" | "voice" | "upload";
export interface CandidateSetupInput extends MutationInput {
  provider?: "codex" | "openai" | "anthropic";
  filename?: string;
  byteLength?: number;
  contentType?: string;
}
export interface CandidateSetupResult {
  kind: "connection" | "voice" | "document";
  id: string;
  revision?: number;
}
interface SetupRow {
  id: string;
  user_node_id: string;
  grant_id: string | null;
  client_id: string | null;
  kind: CandidateSetupKind;
  metadata: Record<string, unknown>;
  result_ref: CandidateSetupResult | null;
  expires_at: Date | string;
}
export interface CandidateSetupState {
  id: string;
  kind: CandidateSetupKind;
  status: "pending" | "completed";
  expiresAt: string;
  url: string;
  metadata: Record<string, unknown>;
  result?: CandidateSetupResult;
}

@Injectable()
export class CandidateSetupService {
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly config: ConfigService,
  ) {}

  private publicState(row: SetupRow): CandidateSetupState {
    return {
      id: row.id,
      kind: row.kind,
      status: row.result_ref ? "completed" : "pending",
      expiresAt: new Date(row.expires_at).toISOString(),
      url: `${candidateOrigin(this.config)}/setup/${row.id}`,
      metadata: Object.fromEntries(Object.entries(row.metadata).filter(([key]) => ["provider", "filename", "byteLength", "contentType"].includes(key))),
      ...(row.result_ref ? { result: row.result_ref } : {}),
    };
  }


  private async owned(db: EntityManager, context: CandidateInvocationContext, id: string): Promise<SetupRow> {
    if (context.kind !== "session" && context.kind !== "oauth") throw new ForbiddenException("Setup requires candidate action");
    if (!isUUID(id)) throw new BadRequestException("Invalid setup ID");
    await this.career.authorizeCandidate(context, false, db);
    const [row]: SetupRow[] = await db.query(
      "SELECT * FROM candidate_setup_intents WHERE id=$1 AND user_node_id=$2 AND expires_at>clock_timestamp() FOR UPDATE",
      [id, context.owner],
    );
    if (!row) throw new NotFoundException("Setup link is unavailable or expired");
    if (context.kind === "oauth" && (context.grantId !== row.grant_id || context.clientId !== row.client_id))
      throw new NotFoundException("Setup link not found");
    if (row.grant_id) {
      await this.career.authorizeCandidateGrant(row.grant_id, context.owner, db,
        [row.kind === "upload" ? "career:write" : "account:write"], row.client_id!);
    }
    return row;
  }

  async create(context: CandidateInvocationContext, kind: CandidateSetupKind, input: CandidateSetupInput): Promise<CandidateSetupState> {
    if (context.kind !== "session" && context.kind !== "oauth") throw new ForbiddenException("Setup requires candidate action");
    if (!["provider", "voice", "upload"].includes(kind) || !isUUID(input.requestId) || input.revision !== 0)
      throw new BadRequestException("Invalid setup input");
    const required = kind === "provider" || kind === "voice" ? "account:write" : "career:write";
    if (context.kind === "oauth" && !context.scopes.includes(required))
      throw new ForbiddenException({ error: "insufficient_scope", scope: required });
    candidateOrigin(this.config);
    const metadata: Record<string, unknown> = {};
    if (kind === "provider" && input.provider !== undefined) {
      if (!["codex", "openai", "anthropic"].includes(input.provider)) throw new BadRequestException("Unsupported provider");
      metadata.provider = input.provider;
    }
    if (kind === "upload") {
      if (typeof input.filename !== "string" || !input.filename.trim() || input.filename.length > 240 || /[\u0000-\u001f\u007f]/.test(input.filename) ||
          !Number.isSafeInteger(input.byteLength) || input.byteLength! <= 0 || input.byteLength! > 5 * 1024 * 1024 ||
          !["", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(input.contentType ?? ""))
        throw new BadRequestException("Upload a PDF or DOCX up to 5 MiB");
      metadata.filename = input.filename.replace(/[\\/]/g, "_");
      metadata.byteLength = input.byteLength;
      metadata.contentType = input.contentType ?? "";
    }
    const mutation = { requestId: input.requestId, revision: input.revision, kind, metadata };
    await this.career.withCandidateInvocation(context, `setup:${kind}`, false, () =>
      this.career.mutate(context.wallet, `setup:${kind}`, mutation, async (db, owner) => {
        const rows = await db.query(
          `INSERT INTO candidate_setup_intents(id,user_node_id,grant_id,client_id,kind,metadata,expires_at)
           VALUES($1,$2,$3,$4,$5,$6,now()+interval '15 minutes') ON CONFLICT(id) DO NOTHING RETURNING id`,
          [input.requestId, owner, context.kind === "oauth" ? context.grantId : null, context.kind === "oauth" ? context.clientId : null,
            kind, JSON.stringify(metadata)],
        );
        if (!rows.length) throw new ConflictException("Setup request ID is already in use");
        return { id: input.requestId };
      }),
    );
    return this.status(context, input.requestId);
  }

  async status(context: CandidateInvocationContext, id: string): Promise<CandidateSetupState> {
    return this.db.transaction(async db => {
      const row = await this.owned(db, context, id);
      return this.publicState(row);
    });
  }

  async complete(context: CandidateInvocationContext, id: string, result: CandidateSetupResult): Promise<CandidateSetupState> {
    if (!isUUID(result.id)) throw new BadRequestException("Invalid setup result");
    return this.db.transaction(async db => {
      const row = await this.owned(db, context, id);
      const expectedKind = row.kind === "provider" ? "connection" : row.kind === "voice" ? "voice" : "document";
      if (result.kind !== expectedKind) throw new BadRequestException("Invalid setup result");
      if (row.kind !== "upload" && context.kind !== "session")
        throw new ForbiddenException("Complete connection setup in your account");
      const [resource] = await db.query(row.kind === "upload"
        ? "SELECT id FROM candidate_documents WHERE id=$1 AND user_node_id=$2"
        : `SELECT c.id,${row.kind === "voice" ? "'openai'" : "c.provider"} AS provider FROM ${row.kind === "voice" ? "candidate_voice_connections" : "candidate_ai_connections"} c
           JOIN candidate_devices d ON d.id=c.device_id AND d.user_node_id=c.user_node_id AND d.status='active'
           WHERE c.id=$1 AND c.user_node_id=$2 AND c.status='connected' AND c.public_state->>'execution'='device'
           FOR SHARE OF c,d`, [result.id, context.owner]);
      if (!resource) throw new NotFoundException("Completed resource not found");
      if (row.kind === "provider" && row.metadata.provider && resource.provider !== row.metadata.provider)
        throw new ConflictException("Choose the provider requested by this setup link");
      const reference: CandidateSetupResult = { kind: result.kind, id: result.id, ...(result.revision !== undefined ? { revision: result.revision } : {}) };
      if (row.result_ref && (row.result_ref.kind !== reference.kind ||
          row.result_ref.id !== reference.id || row.result_ref.revision !== reference.revision))
        throw new ConflictException("Setup already completed with another result");
      await db.query("UPDATE candidate_setup_intents SET result_ref=$3,updated_at=now() WHERE id=$1 AND user_node_id=$2", [id, context.owner, JSON.stringify(reference)]);
      return this.publicState({ ...row, result_ref: reference });
    });
  }
}
