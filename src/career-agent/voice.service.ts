import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
  OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isUUID } from "class-validator";
import { createHash, randomUUID } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { AgentService } from "./agent.service";
import { projectCandidateEvents } from "./candidate-capabilities.service";
import { CandidateInvocationContext } from "./candidate-context";
import { CareerRepository } from "./career.repository";
import { CreateDeviceVoiceInput } from "./voice-connection.dto";
import { byteBound, parseDeviceVoiceEvent, parseVoiceClose, VoiceTranscript } from "./voice-protocol";

type Device = { id: string; owner: string };
type VoiceRow = Record<string, unknown> & {
  id: string; user_node_id: string; session_id: string; voice_connection_id: string; generation: number; device_id: string;
  status: "creating" | "active" | "closing" | "closed" | "failed";
  idempotency_hash: string; heartbeat_at: Date; transcript: VoiceTranscript[];
  consumed_event_ids: string[]; latest_delegation_id: string | null;
};
const active = ["creating", "active", "closing"];
const terminal: Record<string, true> = { completed: true, cancelled: true, failed: true, paused: true, interrupted: true };
export function voiceRequestId(voiceId: string, delegationId: string): string {
  const hash = createHash("sha256").update(`voice:${voiceId}:${delegationId}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Durable authorization and delegated task state only. All provider I/O belongs to the device. */
@Injectable()
export class VoiceService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private sweeping?: Promise<void>;
  private stopped = false;
  private heldConnections = 0;

  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly agent: AgentService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep();
    this.timer = setInterval(() => {
      if (!this.sweeping) this.sweeping = this.sweep().catch(() => undefined).finally(() => { this.sweeping = undefined; });
    }, 5000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.sweeping;
  }
  private checkRuntimeAllowed(): void {
    if (this.stopped) throw new ServiceUnavailableException("Voice is shutting down. Continue with text.");
    if (String(this.config.get("LOCAL_ONLY") ?? process.env.LOCAL_ONLY).toLowerCase() === "true")
      throw new ServiceUnavailableException({ code: "local_only", message: "Live voice is disabled in local-only mode. Continue with text." });
  }
  async availability(wallet: string): Promise<{ available: true }> {
    this.checkRuntimeAllowed();
    await this.access(await this.career.owner(wallet));
    return { available: true };
  }
  private async access(owner: string, sessionId?: string, expected?: VoiceRow, deviceId?: string) {
    await this.career.requireAdvanced(owner);
    const [voice] = await this.db.query<{ id: string; generation: number; device_id: string }>(
      `SELECT c.id,c.generation,c.device_id FROM candidate_voice_connections c
       JOIN candidate_devices d ON d.id=c.device_id AND d.user_node_id=c.user_node_id AND d.status='active'
       WHERE c.user_node_id=$1 AND c.status='connected' AND c.public_state->>'execution'='device'
       AND ($2::uuid IS NULL OR c.device_id=$2)`, [owner, deviceId ?? null],
    );
    if (!voice || (expected && (voice.id !== expected.voice_connection_id || voice.generation !== expected.generation || voice.device_id !== expected.device_id)))
      throw new ConflictException("Your device speech connection changed. Open companion settings or continue with text.");
    const [reasoning] = await this.db.query(
      `SELECT c.id FROM candidate_ai_connections c WHERE c.user_node_id=$1 AND c.status='connected'
       AND c.public_state->>'execution'='device' AND c.device_id=$3
       AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM candidate_agent_sessions s
         WHERE s.id=$2 AND s.user_node_id=$1 AND s.connection_id=c.id
         AND s.object_kind IS DISTINCT FROM 'screening_job' AND s.object_kind IS DISTINCT FROM 'mcp_research'))`,
      [owner, sessionId ?? null, voice.device_id],
    );
    if (!reasoning) throw new ConflictException("Open an owned conversation with a reasoning connection on this device before starting voice.");
    return voice;
  }

  async create(device: Device, input: CreateDeviceVoiceInput) {
    this.checkRuntimeAllowed();
    if (![input.requestId, input.sessionId, input.connectionId].every(value => isUUID(value))) throw new BadRequestException("Invalid voice session input");
    const connection = await this.access(device.owner, input.sessionId, undefined, device.id);
    if (connection.id !== input.connectionId) throw new ConflictException("The selected speech connection changed.");
    const hash = createHash("sha256").update(JSON.stringify([device.id, input.sessionId, input.connectionId, connection.generation])).digest("hex");
    const row = await this.db.transaction(async manager => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`voice-owner:${device.owner}`]);
      const [prior] = await manager.query("SELECT * FROM candidate_voice_sessions WHERE user_node_id=$1 AND request_id=$2", [device.owner, input.requestId]);
      if (prior) {
        if (prior.idempotency_hash !== hash) throw new ConflictException("Voice request ID already has different input.");
        // A device must never recreate an uncertain or ended billed provider call on replay.
        throw new ConflictException("This voice request already exists. End the existing session before starting a new one.");
      }
      const [existing] = await manager.query("SELECT id FROM candidate_voice_sessions WHERE user_node_id=$1 AND status IN ('creating','active','closing')", [device.owner]);
      if (existing) throw new ConflictException("A voice session is already open. End it before starting another.");
      const [saved] = await manager.query(
        `INSERT INTO candidate_voice_sessions(id,user_node_id,session_id,voice_connection_id,generation,device_id,request_id,idempotency_hash,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'creating') RETURNING *`,
        [randomUUID(), device.owner, input.sessionId, connection.id, connection.generation, device.id, input.requestId, hash],
      );
      return saved as VoiceRow;
    });
    return { voiceSessionId: row.id, history: await this.history(row) };
  }

  private async ownedDevice(device: Device, id: string): Promise<VoiceRow> {
    if (!isUUID(id)) throw new NotFoundException("Voice session not found");
    const [row] = await this.db.query<VoiceRow>("SELECT * FROM candidate_voice_sessions WHERE id=$1 AND user_node_id=$2 AND device_id=$3", [id, device.owner, device.id]);
    if (!row) throw new NotFoundException("Voice session not found");
    return row;
  }

  async event(device: Device, id: string, input: unknown) {
    const { eventId, event } = parseDeviceVoiceEvent(input);
    await this.ownedDevice(device, id);
    await this.locked(id, async () => {
      const row = await this.ownedDevice(device, id);
      this.checkRuntimeAllowed();
      await this.access(device.owner, row.session_id, row, device.id);
      if (!['creating', 'active'].includes(row.status)) throw new ConflictException("Voice has ended");
      const hash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
      await this.db.transaction(async manager => {
        const [prior] = await manager.query("SELECT input_hash FROM candidate_voice_events WHERE voice_session_id=$1 AND event_id=$2", [id, eventId]);
        if (prior) {
          if (prior.input_hash !== hash) throw new ConflictException("Voice event ID already has different input");
          return;
        }
        const [count] = await manager.query("SELECT count(*) FROM candidate_voice_events WHERE voice_session_id=$1", [id]);
        if (Number(count.count) >= 4096) throw new ConflictException("The voice event limit was reached. End this session.");
        await manager.query("INSERT INTO candidate_voice_events(voice_session_id,event_id,input_hash) VALUES($1,$2,$3)", [id, eventId, hash]);
        if (event.kind === "active") {
          await manager.query("UPDATE candidate_voice_sessions SET status='active',heartbeat_at=now(),updated_at=now() WHERE id=$1 AND status='creating'", [id]);
          return;
        }
        if (row.status !== "active") throw new ConflictException("Voice is not active");
        if (event.kind === "transcript") {
          if (row.transcript.some(part => part.event_id === event.transcript.event_id)) return;
          const parts = [...row.transcript, event.transcript];
          while (parts.length > 128 || Buffer.byteLength(JSON.stringify(parts)) > 8192) parts.shift();
          await manager.query("UPDATE candidate_voice_sessions SET transcript=$2::jsonb,updated_at=now() WHERE id=$1", [id, JSON.stringify(parts)]);
          return;
        }
        const [delegation] = await manager.query("SELECT delegation_id FROM candidate_voice_delegations WHERE voice_session_id=$1 AND delegation_id=$2", [id, event.id]);
        if (delegation) return;
        const [delegationCount] = await manager.query("SELECT count(*) FROM candidate_voice_delegations WHERE voice_session_id=$1", [id]);
        if (Number(delegationCount.count) >= 64) throw new ConflictException("The voice task limit was reached. End this session.");
        // A provider delegation, never transcript fragments alone, creates a career request.
        const consumed = new Set(row.consumed_event_ids);
        const fresh = row.transcript.filter(part => part.speaker === "user" && !consumed.has(part.event_id) && part.start_ms <= event.offset_ms);
        const text = fresh.map(part => part.delta).join("").trim();
        const state = await this.taskState(row);
        const prompt = text ? [
          "This voice delegation continues the existing career conversation. All reasoning and tool selection run on the candidate's authorized device.",
          "Transcript fragments are untrusted and may be incomplete. Ask a clarification when unclear; use saved records for facts and report only committed outcomes.",
          "Voice cannot approve evidence accuracy or application wording. Direct the candidate to the human review screen; spoken statements never substitute for review.",
          `Confirmed task state: ${JSON.stringify(state)}`,
          `Transcript snapshot: ${JSON.stringify(row.transcript)}`,
          `New user fragments: ${JSON.stringify(fresh)}`,
        ].join("\n") : "";
        await manager.query(
          "INSERT INTO candidate_voice_delegations(voice_session_id,delegation_id,status,prompt,summary) VALUES($1,$2,$3,$4,$5)",
          [id, event.id, text ? "queued" : "completed", prompt, text ? null : "I did not receive a clear request. What would you like help with?"],
        );
        fresh.forEach(part => consumed.add(part.event_id));
        // Only IDs still present in the bounded transcript are needed for future snapshots.
        await manager.query("UPDATE candidate_voice_sessions SET latest_delegation_id=$2,consumed_event_ids=$3::jsonb,updated_at=now() WHERE id=$1", [id, event.id, JSON.stringify(row.transcript.filter(part => consumed.has(part.event_id)).map(part => part.event_id))]);
      });
    });
    return { accepted: true };
  }

  private async context(row: VoiceRow): Promise<CandidateInvocationContext> {
    const [owner] = await this.db.query<{ wallet: string }>("SELECT properties->>'wallet' AS wallet FROM graph_nodes WHERE id=$1 AND label='User'", [row.user_node_id]);
    if (!owner?.wallet) throw new NotFoundException("Candidate not found");
    return { kind: "device", owner: String(row.user_node_id), wallet: owner.wallet, deviceId: row.device_id };
  }
  private async taskState(row: VoiceRow): Promise<Record<string, unknown>> {
    const [session] = await this.db.query("SELECT revision,context_seed->>'sourceDocumentId' AS source_document_id FROM candidate_agent_sessions WHERE id=$1 AND user_node_id=$2", [row.session_id, row.user_node_id]);
    const requests = await this.db.query("SELECT id,status FROM candidate_agent_requests WHERE session_id=$1 AND user_node_id=$2 ORDER BY created_at DESC LIMIT 4", [row.session_id, row.user_node_id]);
    return { revision: session?.revision ?? 0, sourceDocumentId: session?.source_document_id ?? null, requests };
  }
  private async history(row: VoiceRow): Promise<string[]> {
    const state = await this.taskState(row);
    return (state.requests as Array<{ status: string }>).map(request => request.status === "completed"
      ? "An earlier career request is complete. Its saved answer is available in the conversation."
      : request.status === "queued" || request.status === "running" ? "An earlier career request is still working."
        : "An earlier career request ended. Check the conversation for its saved status.");
  }
  private async pump(row: VoiceRow): Promise<void> {
    const context = await this.context(row);
    const rows = await this.db.query<{ delegation_id: string; agent_request_id: string | null; prompt: string }>("SELECT * FROM candidate_voice_delegations WHERE voice_session_id=$1 AND status IN ('queued','running') ORDER BY created_at,delegation_id", [row.id]);
    for (const delegation of rows) {
      const requestId = delegation.agent_request_id ?? voiceRequestId(row.id, delegation.delegation_id);
      const [existing] = await this.db.query<{ status: string }>("SELECT status FROM candidate_agent_requests WHERE id=$1 AND user_node_id=$2", [requestId, context.owner]);
      if (existing) {
        const summary = terminal[existing.status] && existing.status !== "cancelled"
          ? this.committedSummary(projectCandidateEvents(await this.agent.candidateResult(context, requestId))) : null;
        await this.db.query("UPDATE candidate_voice_delegations SET agent_request_id=$3,status=$4,summary=$5,updated_at=now() WHERE voice_session_id=$1 AND delegation_id=$2", [row.id, delegation.delegation_id, requestId, ["paused", "interrupted"].includes(existing.status) ? "failed" : existing.status, summary]);
        if (!terminal[existing.status]) return;
        continue;
      }
      const [busy] = await this.db.query("SELECT id FROM candidate_agent_requests WHERE user_node_id=$1 AND request_kind='conversation' AND status IN ('queued','running') LIMIT 1", [context.owner]);
      if (busy) return;
      await this.access(context.owner, row.session_id, row, row.device_id);
      const [session] = await this.db.query<{ revision: number }>("SELECT revision FROM candidate_agent_sessions WHERE id=$1 AND user_node_id=$2", [row.session_id, context.owner]);
      if (!session) throw new NotFoundException("Conversation not found");
      try {
        await this.agent.runCandidate(context, { requestId, revision: session.revision, sessionId: row.session_id, prompt: delegation.prompt });
        await this.db.query("UPDATE candidate_voice_delegations SET agent_request_id=$3,status='queued',updated_at=now() WHERE voice_session_id=$1 AND delegation_id=$2", [row.id, delegation.delegation_id, requestId]);
      } catch (error) { if (!(error instanceof ConflictException)) throw error; }
      return;
    }
  }
  private committedSummary(result: Record<string, unknown>): string {
    if (result.status !== "completed") return "That request did not complete. Check the conversation for its status and next step.";
    const kinds = new Set<string>();
    for (const entry of Array.isArray(result.events) ? result.events : []) {
      const event = entry?.event;
      if (event?.type === "object" && typeof event.kind === "string") kinds.add(event.kind);
    }
    if (kinds.has("application") || kinds.has("application_document")) return "Your application work is saved in the conversation. Review the wording before exporting. Nothing has been submitted.";
    if (kinds.has("cv") || kinds.has("career")) return "Your career document work is saved in the conversation. Review the facts and wording there before using it.";
    if (kinds.has("introduction")) return "Your introduction draft is saved in the conversation. Review it before sending. No message has been sent.";
    if (kinds.has("stack") || kinds.has("comparison")) return "Your job results are saved in the conversation. Review the evidence, gaps, and unknowns there.";
    return "Your career request is complete. The saved answer and any review actions are available in the conversation.";
  }

  async heartbeat(device: Device, id: string) {
    await this.ownedDevice(device, id);
    await this.locked(id, async () => {
      const row = await this.ownedDevice(device, id);
      if (!active.includes(row.status)) return;
      if (row.status === "closing" || Date.now() - new Date(row.heartbeat_at).getTime() > 45_000) { await this.finalize(row); return; }
      try { this.checkRuntimeAllowed(); await this.access(device.owner, row.session_id, row, device.id); }
      catch { await this.finalize(row); return; }
      await this.db.query("UPDATE candidate_voice_sessions SET heartbeat_at=now(),updated_at=now() WHERE id=$1", [id]);
      if (row.status === "active") await this.pump(row);
    });
    return this.snapshot(id, true);
  }
  async closeDevice(device: Device, id: string, input: unknown) {
    const closure = parseVoiceClose(input);
    await this.ownedDevice(device, id);
    await this.locked(id, async () => this.finalize(await this.ownedDevice(device, id), closure));
    return this.snapshot(id, false);
  }
  async close(wallet: string, id: string) {
    const owner = await this.career.owner(wallet);
    if (!isUUID(id)) throw new NotFoundException("Voice session not found");
    await this.locked(id, async () => {
      const [row] = await this.db.query<VoiceRow>("SELECT * FROM candidate_voice_sessions WHERE id=$1 AND user_node_id=$2", [id, owner]);
      if (!row) throw new NotFoundException("Voice session not found");
      await this.finalize(row);
    });
    return this.snapshot(id, false);
  }
  private async snapshot(id: string, includeCommentary: boolean) {
    const [row] = await this.db.query<{ id: string; status: string; revision: number; latest_delegation_id: string }>("SELECT v.id,v.status,v.latest_delegation_id,s.revision FROM candidate_voice_sessions v JOIN candidate_agent_sessions s ON s.id=v.session_id WHERE v.id=$1", [id]);
    const delegations = await this.db.query<{ requestId: string; status: string }>(`SELECT d.agent_request_id AS "requestId",CASE WHEN r.status='queued' OR (r.status='running' AND r.lease_expires_at<now()) THEN 'waiting_for_device' ELSE r.status END AS status FROM candidate_voice_delegations d JOIN candidate_agent_requests r ON r.id=d.agent_request_id WHERE d.voice_session_id=$1 ORDER BY d.created_at,d.delegation_id LIMIT 64`, [id]);
    const commentary = includeCommentary && row.status === "active" ? await this.db.query<{ delegationId: string; content: string }>(`SELECT delegation_id AS "delegationId",summary AS content FROM candidate_voice_delegations WHERE voice_session_id=$1 AND delegation_id=$2 AND summary IS NOT NULL`, [id, row.latest_delegation_id]) : [];
    return { voiceSessionId: row.id, status: row.status, revision: row.revision, delegatedRequestIds: delegations.map(d => d.requestId), delegations, ...(includeCommentary ? { commentary: commentary.map(part => ({ ...part, content: byteBound(part.content, 450) })) } : {}) };
  }
  private async finalize(row: VoiceRow, closure?: { failed: boolean; usage: { seconds: number } | null }) {
    // Recover a request committed just before its delegation ledger write failed.
    const pending = await this.db.query<{ delegation_id: string }>("SELECT delegation_id FROM candidate_voice_delegations WHERE voice_session_id=$1 AND agent_request_id IS NULL AND status='queued'", [row.id]);
    for (const part of pending) await this.db.query(
      `UPDATE candidate_voice_delegations d SET agent_request_id=r.id,status=CASE WHEN r.status IN ('paused','interrupted') THEN 'failed' ELSE r.status END,updated_at=now()
       FROM candidate_agent_requests r WHERE d.voice_session_id=$1 AND d.delegation_id=$2 AND r.id=$3 AND r.user_node_id=$4`,
      [row.id, part.delegation_id, voiceRequestId(row.id, part.delegation_id), row.user_node_id],
    );
    await this.db.query("UPDATE candidate_voice_delegations SET status='cancelled',updated_at=now() WHERE voice_session_id=$1 AND agent_request_id IS NULL AND status='queued'", [row.id]);
    await this.db.query(
      `UPDATE candidate_voice_sessions SET status=CASE WHEN status='failed' OR $2 THEN 'failed' ELSE 'closed' END,
       usage=COALESCE(usage,$3::jsonb),usage_complete=usage_complete OR $4,closed_at=COALESCE(closed_at,now()),updated_at=now() WHERE id=$1`,
      [row.id, closure?.failed ?? false, closure?.usage ? JSON.stringify(closure.usage) : null, !!closure?.usage],
    );
  }
  private async locked<T>(id: string, work: () => Promise<T>): Promise<T> {
    const source = this.db.getDataSource();
    const configured = Number(source.options.extra?.max ?? 10);
    const poolSize = Number.isFinite(configured) ? configured : 10;
    // A lock holder also needs pool capacity for authorization and task commits.
    const capacity = Math.max(0, Math.min(8, Math.floor(poolSize / 2), poolSize - 4));
    if (this.heldConnections >= capacity) throw new ServiceUnavailableException("Voice session coordination is busy. Continue with text.");
    this.heldConnections++;
    const runner = source.createQueryRunner();
    let held = false;
    try {
      await runner.connect();
      const [lock] = await runner.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [`voice-session:${id}`]);
      held = lock.locked;
      if (!held) throw new ConflictException("Voice session state is changing");
      return await work();
    } finally {
      try { if (held) await runner.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [`voice-session:${id}`]); }
      finally { try { await runner.release(); } finally { this.heldConnections--; } }
    }
  }
  private async sweep(): Promise<void> {
    const rows = await this.db.query<VoiceRow>("SELECT * FROM candidate_voice_sessions WHERE status IN ('creating','active','closing') AND heartbeat_at < now()-interval '45 seconds' ORDER BY created_at");
    for (const row of rows) {
      try {
        await this.locked(row.id, async () => {
          const [current] = await this.db.query<VoiceRow>("SELECT * FROM candidate_voice_sessions WHERE id=$1 AND status IN ('creating','active','closing') AND heartbeat_at < now()-interval '45 seconds'", [row.id]);
          if (current) await this.finalize(current);
        });
      } catch (error) { if (!(error instanceof ConflictException)) throw error; }
    }
  }
}
