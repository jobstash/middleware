import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { DeviceExecutionService } from "./device-execution.service";
import { ApplicationService } from "./application.service";
import { CareerRepository } from "./career.repository";
import { assertCvBaselineCurrent, CvDraftBaseline } from "./cv-source-baseline";
import { candidateSourceParseReady } from "./candidate-source-location";
import { selectedProviderModel } from "./provider-config";
import { BrowserAnswerInput, BrowserApproveInput, BrowserControlInput, BrowserStartInput, BrowserStepInput } from "./browser-application.dto";
import { BrowserAction, BrowserArtifact, BrowserDeviceReceipt, BrowserObservation, BrowserRunView, browserDestination, browserHash, emptyBrowserAction, securityChallenge, validateBrowserAction, validateBrowserMetadata, validateBrowserObservation } from "./browser-application.protocol";

type Database = { query(sql: string, parameters?: unknown[]): Promise<Record<string, unknown>[]> };
interface Packet extends Record<string, unknown> {
  id: string; revision: number; applicationId: string; shortUUID: string; content: {
    title: string; applyUrl?: string; cvBaseline?: CvDraftBaseline;
    sections?: { id?: string; kind: string; excluded?: boolean; text: string; question?: string }[];
    questions?: { id: string; question: string; answer: string | null }[];
    answers?: { question: string; text: string }[];
  }; job: Record<string, unknown>; sourceId: string; content_hash: string; source_text: string;
  parsed_result: Record<string, unknown> | null; extraction_provenance: unknown;
  preferences: Record<string, unknown>; evidence: unknown; profile: Record<string, unknown>; cv: Record<string, unknown>;
}
interface Connection extends Record<string, unknown> { id: string; provider: string; generation: number; public_state: Record<string, unknown> }
interface StoredRun {
  view: BrowserRunView; packetHash: string; connectionId: string; connectionGeneration: number;
  model: string; reasoningEffort: string | null; clientId: string | null; attempts: number;
  submitApproved: boolean; submitAcknowledged: boolean;
  observationHash: string; lastObservation: BrowserObservation | null;
  pendingOrigin?: { origin: string; scope: "navigation" | "network" } | null;
}
const terminal = (status: BrowserRunView["status"]) => ["submitted", "failed", "cancelled"].includes(status);

@Injectable()
export class BrowserApplicationService {
  constructor(private readonly db: PostgresService, private readonly career: CareerRepository,
    private readonly applications: ApplicationService, private readonly devices: DeviceExecutionService, private readonly config: ConfigService) {}

  private sessionOnly(): void {
    const invocation = this.career.currentCandidateInvocation();
    if (invocation && invocation.kind !== "session") throw new ForbiddenException("Browser control requires the candidate's website session");
  }
  private destination(url: string): URL {
    const localOrigin = this.config.get("LOCAL_ONLY") === "true" && this.config.get("NODE_ENV") === "development"
      ? this.config.get<string>("BROWSER_APPLICATION_LOCAL_ORIGIN") : undefined;
    return browserDestination(url, localOrigin);
  }
  private async packet(owner: string, id: string, db: Database = this.db): Promise<Packet> {
    const [p] = await db.query(`SELECT d.id,d.revision,d.application_id AS "applicationId",a.short_uuid AS "shortUUID",d.content,
      COALESCE(j.payload,a.job_snapshot,'{}') AS job,s.id AS "sourceId",s.content_hash,s.source_text,s.parsed_result,s.extraction_provenance,
      COALESCE(to_jsonb(pref),'{}') AS preferences,COALESCE(c.evidence,'[]') AS evidence,u.properties AS profile,
      to_jsonb(cv)-'created_at'-'updated_at' AS cv
      FROM candidate_application_documents d JOIN candidate_applications a ON a.id=d.application_id AND a.user_node_id=d.user_node_id
      JOIN candidate_documents s ON s.id::text=d.content#>>'{cvBaseline,sourceDocumentId}' AND s.user_node_id=d.user_node_id
      JOIN candidate_cv_versions cv ON cv.id=d.cv_version_id AND cv.user_node_id=d.user_node_id
      JOIN graph_nodes u ON u.id=d.user_node_id LEFT JOIN candidate_career_profiles c ON c.user_node_id=d.user_node_id
      LEFT JOIN user_job_preferences pref ON pref.user_node_id=d.user_node_id LEFT JOIN job_search_documents j ON j.job_node_id=a.job_node_id
      WHERE d.id=$1 AND d.user_node_id=$2 AND (j.job_node_id IS NULL OR (j.online AND NOT j.blocked))`, [id, owner]) as Packet[];
    if (!p) throw new NotFoundException("Owned application and current source CV not found");
    if (!p.content.cvBaseline) throw new ConflictException("Prepare a complete CV first");
    assertCvBaselineCurrent(p.content.cvBaseline, { id: p.sourceId, contentHash: p.content_hash, sourceText: p.source_text });
    return p;
  }
  private packetHash(p: Packet): string {
    return browserHash([p.id, p.revision, p.content, p.sourceId, p.content_hash, p.source_text, p.parsed_result,
      p.extraction_provenance, this.metadata(p), p.evidence, this.details(p), p.cv]);
  }
  private details(p: Packet) {
    const company = p.job.organization as Record<string, unknown> | undefined;
    return { documentId: p.id, revision: p.revision, applicationId: p.applicationId, shortUUID: p.shortUUID,
      title: String(p.job.title ?? p.content.title), company: typeof p.job.hiringCompanyName === "string" ? p.job.hiringCompanyName
        : typeof company?.name === "string" ? company.name : typeof p.job.company === "string" ? p.job.company : null,
      applyUrl: String(p.content.applyUrl ?? p.job.applyUrl ?? p.job.url ?? ""), sourceDocumentId: p.sourceId };
  }
  private savedAnswers(p: Packet): Array<{ key: string; question: string; text: string }> {
    const answers = [
      ...(p.content.sections ?? []).flatMap((section, index) => section.kind === "answer" && !section.excluded && section.question
        ? [{ key: `saved_answer_section_${section.id ?? index}`, question: section.question, text: section.text }] : []),
      ...(p.content.questions ?? []).flatMap(question => question.answer
        ? [{ key: `saved_answer_question_${question.id}`, question: question.question, text: question.answer }] : []),
      ...(p.content.answers ?? []).map((answer, index) => ({ key: `saved_answer_${index}`, ...answer })),
    ];
    const seen = new Set<string>();
    return answers.filter(answer => {
      const question = answer.question.trim().toLowerCase();
      if (!answer.text || securityChallenge.test(question) || seen.has(question)) return false;
      seen.add(question); return true;
    });
  }
  private metadata(p: Packet): Record<string, string> {
    const data: Record<string, string> = {};
    const parsed = candidateSourceParseReady(p) ? p.parsed_result ?? {} : {};
    for (const key of ["name", "email", "phone"]) if (typeof parsed[key] === "string") data[key] = String(parsed[key]).slice(0, 2000);
    if (Array.isArray(parsed.socials)) for (const social of parsed.socials) {
      if (social && ["linkedin", "github"].includes(social.kind) && typeof social.handle === "string")
        data[social.kind] = social.handle.slice(0, 2000);
    }
    const location = parsed.location as Record<string, unknown> | undefined;
    if (typeof location?.city === "string") data.location = location.city;
    const mapping = { residenceCountry: "residence_country", workAuthorization: "work_authorization", requiresSponsorship: "requires_sponsorship", minimumSalary: "minimum_salary", salaryCurrency: "salary_currency" };
    const sourcePreferences = parsed.preferences as Record<string, unknown> | undefined;
    const explicit = p.profile.explicitProfileFields as Record<string, unknown> | undefined;
    for (const [key, column] of Object.entries(mapping)) {
      const value = explicit?.[key] ? p.preferences[column] : sourcePreferences?.[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") data[key] = String(value);
    }
    data.coverLetter = (p.content.sections ?? []).filter(section => section.kind === "letter" && !section.excluded).map(section => section.text).join("\n\n");
    for (const answer of this.savedAnswers(p)) data[answer.key] = answer.text;
    return data;
  }
  private async connections(owner: string, db: Database = this.db): Promise<Connection[]> {
    return db.query(`SELECT id,provider,generation,public_state FROM candidate_ai_connections
      WHERE user_node_id=$1 AND status='connected'
      AND public_state->>'execution'='device' AND provider IN ('codex','openai','anthropic')`, [owner]) as Promise<Connection[]>;
  }
  async prepare(wallet: string, documentId: string) {
    this.sessionOnly();
    const owner = await this.career.owner(wallet);
    await this.career.requireAdvanced(owner);
    const p = await this.packet(owner, documentId), details = this.details(p), metadata = this.metadata(p);
    const connections = (await this.connections(owner)).map(c => ({ id: c.id, provider: c.provider, ...selectedProviderModel(this.config, c.provider, c.public_state) }));
    const issues: string[] = [];
    try { this.destination(details.applyUrl); } catch { issues.push("This application needs a safe public application URL."); }
    if (!candidateSourceParseReady(p)) issues.push("Parse the current original CV before browser delivery.");
    if (!p.content.sections?.some(s => s.kind === "letter" && !s.excluded && s.text.trim())) issues.push("Prepare a current cover letter before browser delivery.");
    if (metadata.coverLetter.length > 60000) issues.push("Shorten the prepared cover letter to 60,000 characters before browser delivery.");
    if (!connections.length) issues.push("Connect an OpenAI or Anthropic account with your own funding.");
    return { ...details, metadata, connections, issues };
  }
  private async locked<T>(wallet: string, work: (db: EntityManager, owner: string) => Promise<T>): Promise<T> {
    this.sessionOnly();
    return this.db.transaction(async db => work(db, await this.career.owner(wallet, db, true)));
  }
  private async load(db: Database, owner: string, id: string): Promise<StoredRun> {
    const [row] = await db.query("SELECT state FROM candidate_browser_applications WHERE id=$1 AND user_node_id=$2", [id, owner]);
    if (!row) throw new NotFoundException("Browser application not found");
    return row.state as StoredRun;
  }
  private async save(db: Database, owner: string, run: StoredRun): Promise<void> {
    await db.query("UPDATE candidate_browser_applications SET state=$3,status=$4,updated_at=now() WHERE id=$1 AND user_node_id=$2", [run.view.id, owner, JSON.stringify(run), run.view.status]);
  }
  private async assertPins(owner: string, run: StoredRun, db: Database = this.db): Promise<void> {
    await this.career.requireAdvanced(owner, db);
    const p = await this.packet(owner, run.view.documentId, db);
    if (this.packetHash(p) !== run.packetHash) throw new ConflictException("Application packet or source changed; cancel and prepare again");
    const connection = (await this.connections(owner, db)).find(c => c.id === run.connectionId);
    if (!connection || connection.generation !== run.connectionGeneration || connection.public_state.deviceId !== run.view.deviceId)
      throw new ConflictException("Connected account changed or was revoked");
  }
  async start(wallet: string, input: BrowserStartInput): Promise<BrowserRunView> {
    this.sessionOnly();
    if (input.consent?.browserControl !== true || input.consent?.dataTransfer !== true) throw new BadRequestException("Explicit browser and data-transfer consent are required");
    const owner = await this.career.owner(wallet), inputHash = browserHash(input);
    const replay = await this.locked(wallet, async (db, owned) => {
      const [prior] = await db.query("SELECT state,start_hash FROM candidate_browser_applications WHERE user_node_id=$1 AND start_request_id=$2", [owned, input.requestId]);
      if (!prior) return null;
      if (prior.start_hash !== inputHash) throw new ConflictException("Start request identity changed");
      const run = prior.state as StoredRun;
      return this.reconcileReplay(db, owned, run, run.view);
    });
    if (replay) return replay;
    const preflight = await this.prepare(wallet, input.documentId);
    if (preflight.issues.length) throw new ConflictException(preflight.issues.join(" "));
    if (preflight.revision !== input.revision) throw new ConflictException("Application revision changed");
    if (!preflight.connections.some(c => c.id === input.connectionId && c.model === input.model && c.reasoningEffort === input.reasoningEffort))
      throw new ForbiddenException("Choose the saved model on your own funded connected account");
    validateBrowserMetadata(input.metadata, Object.keys(preflight.metadata));
    if (!input.metadata.name?.trim() || !input.metadata.email?.trim()) throw new BadRequestException("Review your genuine name and email before continuing");
    const initial = await this.packet(owner, input.documentId), packetHash = this.packetHash(initial);
    const frozenLetter = this.metadata(initial).coverLetter;
    if (input.metadata.coverLetter !== undefined && input.metadata.coverLetter !== frozenLetter)
      throw new ConflictException("Edit the prepared application packet to change its cover letter");
    const metadata = { ...input.metadata, coverLetter: frozenLetter };
    const runId = randomUUID(), artifacts: BrowserArtifact[] = [];
    // Export has its own owner transaction. Never nest it under our owner lock.
    for (const kind of ["cv", "letter"] as const) {
      const file = await this.applications.export(wallet, input.documentId, { requestId: randomUUID(), revision: input.revision, kind });
      const downloaded = await this.applications.download(wallet, file.id);
      const provenance = await this.applications.provenance(wallet, file.id);
      if (provenance.documentId !== input.documentId || provenance.revision !== input.revision || provenance.kind !== kind)
        throw new ConflictException("Export provenance changed");
      if (downloaded.bytes.length <= 4 || downloaded.bytes.length > 10 * 1024 * 1024)
        throw new BadRequestException("Browser delivery supports reviewed PDFs up to 10 MiB each; use manual download for this file");
      artifacts.push({ id: file.id, kind, filename: file.filename, sha256: browserHash(downloaded.bytes), byteLength: downloaded.bytes.length,
        contentType: "application/pdf", downloadPath: `/profile/browser-applications/${runId}/artifacts/${file.id}` });
    }
    return this.locked(wallet, async (db, owned) => {
      const [prior] = await db.query("SELECT state,start_hash FROM candidate_browser_applications WHERE user_node_id=$1 AND start_request_id=$2", [owned, input.requestId]);
      if (prior) {
        if (prior.start_hash !== inputHash) throw new ConflictException("Start request identity changed");
        const run = prior.state as StoredRun;
        return this.reconcileReplay(db, owned, run, run.view);
      }
      const [active] = await db.query("SELECT id FROM candidate_browser_applications WHERE user_node_id=$1 AND application_id=$2 AND status NOT IN ('submitted','failed','cancelled')", [owned, initial.applicationId]);
      if (active) throw new ConflictException("This application already has an active browser run");
      const [attempted] = await db.query("SELECT id FROM candidate_browser_applications WHERE user_node_id=$1 AND application_id=$2 AND (state->>'submitApproved')::boolean", [owned, initial.applicationId]);
      if (attempted) throw new ConflictException("A browser submission was already approved for this application. Check the employer site manually; do not submit twice.");
      const connection = (await this.connections(owned, db)).find(c => c.id === input.connectionId);
      if (!connection) throw new ForbiddenException("Choose your own funded connected account");
      const { sourceDocumentId: _sourceDocumentId, ...details } = this.details(initial);
      const view: BrowserRunView = { id: runId, status: "ready", ...details, allowedOrigins: [this.destination(preflight.applyUrl).origin],
        clientToken: randomBytes(32).toString("hex"), sequence: 0, metadata, artifacts, command: null, question: null, message: null, receipt: null,
        packetHash, connectionId: connection.id, connectionGeneration: connection.generation,
        deviceId: String(connection.public_state.deviceId), model: input.model, reasoningEffort: input.reasoningEffort,
        answerLabels: Object.fromEntries(this.savedAnswers(initial).filter(answer => Object.hasOwn(metadata, answer.key)).map(answer => [answer.key, answer.question])) };
      const run: StoredRun = { view, packetHash, connectionId: connection.id, connectionGeneration: connection.generation,
        model: input.model, reasoningEffort: input.reasoningEffort, clientId: null, attempts: 0,
        submitApproved: false, submitAcknowledged: false, observationHash: "", lastObservation: null };
      await this.assertPins(owned, run, db);
      await db.query(`INSERT INTO candidate_browser_applications(id,user_node_id,application_id,document_id,start_request_id,start_hash,status,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [runId, owned, initial.applicationId, input.documentId, input.requestId, inputHash, view.status, JSON.stringify(run)]);
      return view;
    });
  }
  async status(wallet: string, id: string): Promise<BrowserRunView> {
    this.sessionOnly();
    const owner = await this.career.owner(wallet), run = await this.load(this.db, owner, id);
    if (run.view.command?.approved) await this.assertPins(owner, run);
    return run.view;
  }
  async artifact(wallet: string, id: string, exportId: string) {
    this.sessionOnly();
    const run = await this.load(this.db, await this.career.owner(wallet), id);
    const artifact = run.view.artifacts.find(file => file.id === exportId);
    if (!artifact) throw new NotFoundException("Artifact is not approved for this run");
    const file = await this.applications.download(wallet, exportId), provenance = await this.applications.provenance(wallet, exportId);
    if (browserHash(file.bytes) !== artifact.sha256 || file.bytes.length !== artifact.byteLength || provenance.documentId !== run.view.documentId || provenance.revision !== run.view.revision)
      throw new ConflictException("Frozen artifact integrity check failed");
    return file;
  }
  private command(run: StoredRun, action: BrowserAction, approved = true): void {
    run.view.command = { id: randomUUID(), sequence: ++run.view.sequence, action, approved, observationHash: run.observationHash };
  }
  private handoff(run: StoredRun, message: string): void {
    run.view.status = run.submitApproved ? "uncertain" : "needs_user";
    run.view.command = null; run.view.message = message;
    run.view.question = { id: randomUUID(), kind: "handoff", text: message };
  }
  private async reconcileReplay(db: Database, owner: string, run: StoredRun, response: BrowserRunView): Promise<BrowserRunView> {
    // Event identity is durable, but command authority belongs only to the current run.
    if (!run.view.command) return run.view;
    if (run.view.status !== response.status || run.view.sequence !== response.sequence ||
        browserHash(run.view.command) !== browserHash(response.command))
      throw new ConflictException("This event's command was superseded; use the current browser run state");
    if (run.view.command.approved) {
      try { await this.assertPins(owner, run, db); } catch (error) {
        run.pendingOrigin = null; run.view.pendingOrigin = null;
        this.handoff(run, error instanceof Error ? error.message : "Application authorization changed");
        await this.save(db, owner, run);
      }
    }
    return run.view;
  }
  private async event(db: Database, owner: string, run: StoredRun, id: string, operation: string, input: unknown): Promise<BrowserRunView | null> {
    const hash = browserHash(input);
    const [prior] = await db.query("SELECT input_hash,operation,response FROM candidate_browser_application_events WHERE run_id=$1 AND event_id=$2", [run.view.id, id]);
    if (prior) {
      if (prior.input_hash !== hash || prior.operation !== operation) throw new ConflictException("Event identity changed");
      if (!prior.response) throw new ConflictException("This browser event has no committed response. Resume with a fresh observation.");
      return this.reconcileReplay(db, owner, run, prior.response as BrowserRunView);
    }
    await db.query("INSERT INTO candidate_browser_application_events(run_id,event_id,input_hash,operation) VALUES($1,$2,$3,$4)", [run.view.id, id, hash, operation]);
    return null;
  }
  private async complete(db: Database, owner: string, run: StoredRun, eventId: string): Promise<BrowserRunView> {
    await this.save(db, owner, run);
    await db.query("UPDATE candidate_browser_application_events SET response=$3 WHERE run_id=$1 AND event_id=$2", [run.view.id, eventId, JSON.stringify(run.view)]);
    return run.view;
  }
  private originRequest(run: StoredRun, url: string, scope: "navigation" | "network" = "navigation"): void {
    const origin = this.destination(url).origin;
    if (scope === "network" && url !== origin) throw new BadRequestException("Network consent must disclose only the destination origin");
    run.pendingOrigin = { origin, scope };
    run.view.pendingOrigin = origin;
    this.command(run, scope === "network" ? emptyBrowserAction("observe") : { ...emptyBrowserAction("navigate"), url }, false);
    run.view.status = "awaiting_approval";
    run.view.question = { id: run.view.command!.id, kind: "origin", text: scope === "network"
      ? `Allow this application to transfer your reviewed data or PDF to ${origin}?`
      : `Allow this application to continue at ${origin}?` };
    run.view.message = "No page content from this new origin has been sent to the planner.";
  }
  private async receipt(owner: string, run: StoredRun, receipt: BrowserDeviceReceipt | undefined, kind: "plan" | "approval"): Promise<Record<string, unknown>> {
    if (!receipt || Object.keys(receipt).some(key => !["deviceId", "payload", "signature"].includes(key)) ||
        receipt.deviceId !== run.view.deviceId || typeof receipt.signature !== "string" || !receipt.payload || typeof receipt.payload !== "object" || Array.isArray(receipt.payload))
      throw new ForbiddenException("A paired device browser receipt is required");
    const p = receipt.payload;
    const keys = ["runId", "packetHash", "sequence", "observationHash", "action", "issuedAt", "expiresAt", ...(kind === "plan"
      ? ["connectionId", "connectionGeneration", "model", "reasoningEffort"]
      : ["commandId", "allowedOrigins", "metadataHash", "formIdentityHash"])];
    if (Object.keys(p).length !== keys.length || keys.some(key => !Object.hasOwn(p, key)) || Buffer.byteLength(JSON.stringify(p)) > 32768)
      throw new ForbiddenException("The device browser receipt has unsupported fields");
    if (p.runId !== run.view.id || p.packetHash !== run.packetHash ||
        !Number.isSafeInteger(p.issuedAt) || !Number.isSafeInteger(p.expiresAt) ||
        Number(p.issuedAt) > Date.now() + 30000 || Number(p.expiresAt) <= Date.now() ||
        Number(p.expiresAt) - Number(p.issuedAt) > 600000)
      throw new ForbiddenException("The device browser receipt expired or belongs to another packet");
    await this.devices.verifyOwnedReceipt(owner, receipt.deviceId, `recruiters.browser.${kind}.v1`, p, receipt.signature);
    return p;
  }
  async step(wallet: string, id: string, input: BrowserStepInput): Promise<BrowserRunView> {
    if (!!input.observation === !!input.interruption) throw new BadRequestException("Send one real observation or one typed interruption");
    if (input.observation) validateBrowserObservation(input.observation);
    const claimed = await this.locked(wallet, async (db, owner) => {
      const run = await this.load(db, owner, id);
      const token = Buffer.from(input.token), expected = Buffer.from(run.view.clientToken);
      if (token.length !== expected.length || !timingSafeEqual(token, expected)) throw new ForbiddenException("Browser token does not belong to this run");
      if (run.clientId && run.clientId !== input.clientId) throw new ConflictException("Another browser client owns this run; resume explicitly to reconnect");
      const replay = await this.event(db, owner, run, input.eventId, "step", input);
      if (replay) return { view: replay };
      const preApprovalInterruption = run.view.status === "awaiting_approval" && run.view.command?.action.kind === "submit" &&
        input.interruption?.reason === "origin_changed" && input.interruption.scope === "network" && input.interruption.submitAttempted === false && !input.interruption.submitted;
      if (terminal(run.view.status) || ["paused", "needs_user"].includes(run.view.status) || (run.view.status === "awaiting_approval" && !preApprovalInterruption)) throw new ConflictException("Browser run is not accepting actions");
      if (input.sequence !== run.view.sequence) throw new ConflictException("Stale browser sequence");
      run.clientId = input.clientId;
      const command = run.view.command, acknowledgement = input.result ?? input.interruption;
      if (command && (!acknowledgement || acknowledgement.commandId !== command.id || (!command.approved && !preApprovalInterruption))) throw new ConflictException("Acknowledge the exact approved command");
      if (!command && input.result) throw new ConflictException("No command is awaiting acknowledgement");
      if (input.result && input.interruption) throw new BadRequestException("An interruption replaces the action result");
      if (!command && input.interruption?.commandId) throw new ConflictException("No command matches this interruption");
      if (acknowledgement?.submitted) {
        if (!command || command.action.kind !== "submit" || !command.approved || !run.submitApproved || (input.result && input.result.status !== "ok"))
          throw new ConflictException("No approved submit was executed");
        run.submitAcknowledged = true;
      }
      if (command?.action.kind === "submit" && !acknowledgement?.submitted) {
        if (input.interruption?.reason === "origin_changed" && input.interruption.scope === "network" &&
            input.interruption.url && input.interruption.submitAttempted === false &&
            !run.view.allowedOrigins.includes(this.destination(input.interruption.url).origin)) {
          // The executor attests that its form preflight blocked before any submit attempt.
          // Retire this approval; consent and a fresh observation must precede a new one.
          run.submitApproved = false;
        } else {
          this.handoff(run, "Submission outcome is uncertain. Inspect the employer site; this run will not submit again.");
          return { view: await this.complete(db, owner, run, input.eventId) };
        }
      }
      run.view.command = null;
      if (input.interruption) {
        run.observationHash = browserHash(input.interruption);
        if (input.interruption.reason === "origin_changed" && input.interruption.url) this.originRequest(run, input.interruption.url, input.interruption.scope);
        else this.handoff(run, input.interruption.reason === "approval_required" ? "The browser blocked an unapproved final submission. Resume to review the actual submit action." : "Continue manually in the browser, then resume with a fresh observation.");
        return { view: await this.complete(db, owner, run, input.eventId) };
      }
      const observation = input.observation!;
      const destination = this.destination(observation.url);
      // Reject unsolicited page contents at a new origin. Extension must use the metadata-only interruption path.
      if (!run.view.allowedOrigins.includes(destination.origin)) throw new ForbiddenException("Approve a metadata-only origin interruption before sending this page");
      if (input.result && input.result.status !== "ok") {
        this.handoff(run, "The browser action did not complete. Inspect the browser and resume explicitly.");
        return { view: await this.complete(db, owner, run, input.eventId) };
      }
      try { await this.assertPins(owner, run, db); } catch (error) {
        this.handoff(run, error instanceof Error ? error.message : "Application authorization changed");
        return { view: await this.complete(db, owner, run, input.eventId) };
      }
      if (++run.attempts > 60) {
        this.handoff(run, "The automatic action limit was reached. Finish manually in the browser.");
        return { view: await this.complete(db, owner, run, input.eventId) };
      }
      run.observationHash = browserHash(observation);
      run.lastObservation = observation; run.view.question = null; run.view.message = null;
      run.view.status = run.submitApproved ? "uncertain" : "running";
      const p = await this.receipt(owner, run, input.proposal, "plan");
      if (p.sequence !== input.sequence || p.observationHash !== run.observationHash || p.connectionId !== run.connectionId ||
          p.connectionGeneration !== run.connectionGeneration || p.model !== run.model || p.reasoningEffort !== run.reasoningEffort)
        throw new ForbiddenException("The device proposal does not match the current observation and selected model");
      const action = validateBrowserAction(p.action);
      try { await this.applyAction(db, owner, run, action); }
      catch (error) { this.handoff(run, error instanceof Error ? error.message : "Unsafe browser action was refused"); }
      return { view: await this.complete(db, owner, run, input.eventId) };
    });
    return claimed.view;
  }
  private async applyAction(db: EntityManager, owner: string, run: StoredRun, action: BrowserAction): Promise<void> {
    const observation = run.lastObservation!;
    const element = action.ref ? observation.elements.find(e => e.ref === action.ref) : undefined;
    if (["click", "fill", "select", "upload", "submit"].includes(action.kind) && !element) throw new BadRequestException("Planner chose a stale or invisible control");
    if (element && securityChallenge.test(element.label)) { this.handoff(run, "This security or sensitive-information field requires you to take over."); return; }
    if (["fill", "select"].includes(action.kind) && (!action.valueKey || !Object.prototype.hasOwnProperty.call(run.view.metadata, action.valueKey))) throw new BadRequestException("Planner requested unreviewed candidate data");
    if (action.kind === "upload" && (!action.artifactId || !run.view.artifacts.some(a => a.id === action.artifactId) || element?.kind !== "file")) throw new BadRequestException("Planner requested an unapproved file");
    if (action.kind === "navigate") {
      if (!action.url) throw new BadRequestException("Navigation needs an explicit destination");
      const destination = this.destination(action.url);
      if (!run.view.allowedOrigins.includes(destination.origin)) { this.originRequest(run, action.url); return; }
    }
    if (action.kind === "click" && element && /\b(?:submit|send application|apply now|complete application|finish application)\b/i.test(element.label))
      throw new BadRequestException("The device must propose an explicit submit action for final approval");
    if (run.submitApproved && !["observe", "scroll", "finish", "ask"].includes(action.kind)) {
      this.handoff(run, "A submission was already approved. Only confirmation may be observed; finish any uncertain outcome manually."); return;
    }
    if (action.kind === "ask") {
      const question = action.question?.trim();
      if (!question) throw new BadRequestException("Missing question");
      if (securityChallenge.test(question)) { this.handoff(run, "Complete this security challenge yourself in the browser, then resume."); return; }
      run.view.status = "needs_user"; run.view.command = null;
      run.view.question = { id: `answer_${randomUUID()}`, text: question, kind: "answer" }; return;
    }
    if (action.kind === "finish") {
      const confirmation = action.confirmation?.trim();
      const text = observation.text.replace(/\s+/g, " ").toLowerCase();
      const receiptText = confirmation?.replace(/\s+/g, " ").toLowerCase();
      const receiptSignal = /(?:application|submission).{0,100}(?:received|submitted|complete|successful)|(?:thank you|thanks).{0,100}(?:applying|application)|(?:successfully).{0,60}(?:applied|submitted)/i;
      if (!run.submitAcknowledged || !confirmation || confirmation.length < 12 || !receiptText || !text.includes(receiptText) || !receiptSignal.test(confirmation) ||
          (action.reference && !observation.text.includes(action.reference))) {
        this.handoff(run, "No acknowledged submission with a visible application receipt was established. Verify manually."); return;
      }
      run.view.receipt = { url: observation.url, confirmation, reference: action.reference, at: new Date().toISOString(), artifactHashes: run.view.artifacts.map(a => a.sha256) };
      run.view.status = "submitted"; run.view.command = null; run.view.question = null;
      run.view.message = "Browser-observed application confirmation. This is not independent employer verification.";
      // Preserve any explicit manual status (including interview/offer/withdrawn). Browser evidence is separately attributed.
      await db.query(`UPDATE candidate_applications SET state=state||jsonb_build_object('browserReceipt',$3::jsonb)||
        CASE WHEN state->>'status' IS NULL OR state->>'status'='preparing' THEN '{"status":"applied","applicationSource":"browser_observed"}'::jsonb ELSE '{}'::jsonb END,
        revision=revision+1,updated_at=now() WHERE id=$1 AND user_node_id=$2`, [run.view.applicationId, owner, JSON.stringify({ source: "browser_observed", runId: run.view.id, ...run.view.receipt })]);
      return;
    }
    if (action.kind === "submit") {
      this.command(run, action, false); run.view.status = "awaiting_approval";
      run.view.message = "Review the visible destination, candidate details and frozen PDFs before approving this one submission.";
      return;
    }
    this.command(run, action);
  }
  private async human(wallet: string, id: string, requestId: string, operation: string, input: unknown,
    work: (db: EntityManager, owner: string, run: StoredRun) => Promise<void>): Promise<BrowserRunView> {
    return this.locked(wallet, async (db, owner) => {
      const run = await this.load(db, owner, id), replay = await this.event(db, owner, run, requestId, operation, input);
      if (replay) return replay;
      await work(db, owner, run);
      return this.complete(db, owner, run, requestId);
    });
  }
  approve(wallet: string, id: string, input: BrowserApproveInput): Promise<BrowserRunView> {
    return this.human(wallet, id, input.requestId, "approve", input, async (db, owner, run) => {
      const command = run.view.command;
      if (run.view.status !== "awaiting_approval" || !command || command.approved || command.id !== input.commandId || command.observationHash !== input.observationHash)
        throw new ConflictException("Approval does not match the current browser observation");
      await this.assertPins(owner, run, db);
      const receipt = await this.receipt(owner, run, input.receipt, "approval");
      const origins = run.pendingOrigin && !run.view.allowedOrigins.includes(run.pendingOrigin.origin)
        ? [...run.view.allowedOrigins, run.pendingOrigin.origin] : run.view.allowedOrigins;
      if (receipt.commandId !== command.id || receipt.sequence !== command.sequence ||
          receipt.observationHash !== command.observationHash || browserHash(receipt.action) !== browserHash(command.action) ||
          receipt.metadataHash !== browserHash(run.view.metadata) || browserHash(receipt.allowedOrigins) !== browserHash(origins) ||
          (command.action.kind === "submit" && (typeof receipt.formIdentityHash !== "string" || !/^[a-f0-9]{64}$/.test(receipt.formIdentityHash))))
        throw new ForbiddenException("Local approval does not match this command, form and reviewed data");
      if (command.action.kind === "submit") {
        if (run.submitApproved) throw new ConflictException("A submission was already approved; it cannot be repeated");
        run.submitApproved = true;
      } else if (run.pendingOrigin && ((run.pendingOrigin.scope === "navigation" && command.action.kind === "navigate") ||
          (run.pendingOrigin.scope === "network" && command.action.kind === "observe"))) {
        const origin = this.destination(run.pendingOrigin.origin).origin;
        if (!run.view.allowedOrigins.includes(origin)) run.view.allowedOrigins.push(origin);
        run.pendingOrigin = null;
        run.view.pendingOrigin = null;
      } else throw new ConflictException("This command cannot receive human approval");
      command.approved = true; run.view.status = run.submitApproved && command.action.kind !== "submit" ? "uncertain" : "running";
      run.view.question = null; run.view.message = null;
    });
  }
  answer(wallet: string, id: string, input: BrowserAnswerInput): Promise<BrowserRunView> {
    return this.human(wallet, id, input.requestId, "answer", input, async (db, owner, run) => {
      if (run.view.status !== "needs_user" || run.view.question?.kind !== "answer" || run.view.question.id !== input.questionId || !input.value.trim())
        throw new ConflictException("Answer only the current missing-data question");
      if (securityChallenge.test(run.view.question.text) || securityChallenge.test(input.value)) throw new BadRequestException("Security credentials must be entered manually, never stored here");
      if (Object.keys(run.view.metadata).length >= 80) throw new BadRequestException("This run has reached its answer limit");
      await this.assertPins(owner, run, db);
      (run.view.answerLabels ??= {})[input.questionId] = run.view.question.text;
      run.view.metadata[input.questionId] = input.value.trim(); run.view.question = null; run.view.status = "running";
      this.command(run, emptyBrowserAction("observe"));
    });
  }
  control(wallet: string, id: string, input: BrowserControlInput): Promise<BrowserRunView> {
    return this.human(wallet, id, input.requestId, "control", input, async (_db, _owner, run) => {
      if (terminal(run.view.status)) throw new ConflictException("This browser run is finished");
      run.pendingOrigin = null; run.view.pendingOrigin = null; run.view.command = null; run.view.question = null;
      if (input.action === "cancel") { run.view.status = "cancelled"; run.view.message = run.submitApproved ? "Stopped. A submission may have occurred; check the employer site before taking further action." : "Browser assistance cancelled."; }
      else if (input.action === "pause") { run.view.status = "paused"; run.view.message = "Paused. No further browser commands are authorized."; }
      else { run.clientId = null; run.view.status = run.submitApproved ? "uncertain" : "ready"; run.view.message = "Waiting for a fresh browser observation. No old command will be repeated."; }
    });
  }
}
