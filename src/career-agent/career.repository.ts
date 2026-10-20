import { CvReviewInput } from "./cv-review.dto";
import * as Ajv from "ajv";
import { stackFacetColumns, stackFiltersSchema } from "./stack-filters";
const validateStackFilters = new Ajv().compile(stackFiltersSchema);
import { AsyncLocalStorage } from "node:async_hooks";
import { recommendationCategoryAffinityCtes } from "src/postgres/sql/recommended-jobs.sql";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import {
  ActionInput,
  DocumentInput,
  LinkResumeInput,
  EvidenceInput,
  MutationInput,
  StackInput,
} from "./career.dto";
import {
  ApplicationState,
  ApplicationMutationResult,
  CareerEvidence,
  CareerState,
  EMPTY_APPLICATION,
  StackDefinition,
} from "./career.types";
import { DirectionsInput } from "./application.dto";
import { findEvidenceConflicts } from "./merge-career";
import { CandidateInvocationContext, CandidateScope } from "./candidate-context";
import { evidenceUsableSql } from "./evidence-usability";
import { deviceSourceScopeSql } from "./device-execution.protocol";

type Executor = {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
};

export interface MutationPolicy {
  requireAdvanced?: boolean;
}

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalized = (value?: string): string =>
  (value ?? "").trim().toLowerCase();

@Injectable()
export class CareerRepository {
  constructor(private readonly postgres: PostgresService) {}
  private readonly candidateInvocation = new AsyncLocalStorage<{
    context: CandidateInvocationContext;
    operation: string;
    requireAdvanced: boolean;
  }>();

  currentCandidateInvocation(): CandidateInvocationContext | undefined {
    return this.candidateInvocation.getStore()?.context;
  }

  async withCandidateInvocation<T>(
    context: CandidateInvocationContext,
    operation: string,
    requireAdvanced: boolean,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.authorizeCandidate(context, requireAdvanced);
    return this.candidateInvocation.run({ context, operation, requireAdvanced }, async () => {
      const result = await work();
      await this.authorizeCandidate(context, requireAdvanced);
      return result;
    });
  }

  async authorizeCandidateGrant(
    grantId: string,
    owner: string,
    db: Executor = this.postgres,
    scopes: readonly CandidateScope[] = ["career:write"],
    clientId?: string,
  ): Promise<void> {
    const [grant] = await db.query(
      `SELECT id FROM mcp_grants WHERE id=$1 AND user_node_id=$2
       AND ($3::uuid IS NULL OR client_id=$3) AND revoked_at IS NULL AND expires_at>clock_timestamp()
       AND regexp_split_to_array(trim(scope),'\\s+') @> $4::text[]
       ${db !== this.postgres ? "FOR SHARE" : ""}`,
      [grantId, owner, clientId ?? null, scopes],
    ) as { id: string }[];
    if (!grant) throw new ForbiddenException("The AI app is no longer connected or its permissions changed");
  }

  async authorizeCandidate(
    context: CandidateInvocationContext,
    requireAdvanced = false,
    db: Executor = this.postgres,
  ): Promise<void> {
    const owner = await this.owner(context.wallet, db, db !== this.postgres);
    if (owner !== String(context.owner))
      throw new ForbiddenException("Candidate identity changed");
    if (context.kind === "oauth")
      await this.authorizeCandidateGrant(context.grantId, owner, db, context.scopes, context.clientId);
    if (context.kind === "device") {
      const [device] = await db.query(
        `SELECT id FROM candidate_devices WHERE id=$1 AND user_node_id=$2 AND status='active'
         ${db !== this.postgres ? "FOR SHARE" : ""}`, [context.deviceId, owner],
      ) as { id: string }[];
      if (!device) throw new ForbiddenException("Device is no longer paired");
      requireAdvanced = true;
    }
    if (context.kind === "worker") {
      const [request] = await db.query(
        `SELECT r.oauth_grant_id FROM candidate_agent_requests r
         JOIN candidate_agent_sessions s ON s.id=r.session_id AND s.user_node_id=r.user_node_id
         JOIN candidate_ai_connections c ON c.id=s.connection_id AND c.user_node_id=r.user_node_id
         JOIN candidate_devices d ON d.id=r.device_id AND d.user_node_id=r.user_node_id AND d.status='active'
         WHERE r.id=$1 AND r.user_node_id=$2 AND r.worker_id=$3 AND r.status='running'
           AND r.heartbeat_at>clock_timestamp()-interval '45 seconds' AND c.status='connected'
           AND c.device_id=r.device_id AND c.generation=r.connection_generation
           AND c.public_state->>'execution'='device'
           AND c.execution_lease=r.id AND c.execution_lease_until>clock_timestamp()
           AND s.object_kind IS DISTINCT FROM 'mcp_research'
           AND ${deviceSourceScopeSql("r")}
         ${db !== this.postgres ? "FOR SHARE OF r,c" : ""}`,
        [context.agentRequestId, owner, context.workerId],
      ) as { oauth_grant_id: string | null }[];
      if (!request) throw new ConflictException("Agent request is no longer active");
      if (request.oauth_grant_id)
        await this.authorizeCandidateGrant(request.oauth_grant_id, owner, db);
      requireAdvanced = true;
    }
    if (requireAdvanced) await this.requireAdvanced(owner, db);
  }

  private readonly agentEvent = new AsyncLocalStorage<{
    requestId: string;
    kind: string;
    workerId: string;
  }>();
  withAgentEvent<T>(
    requestId: string,
    kind: string,
    workerId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.agentEvent.run({ requestId, kind, workerId }, work);
  }
  private async commitAgentEvent(
    db: EntityManager,
    owner: string,
    mutationId: string,
    value: unknown,
  ): Promise<void> {
    const context = this.agentEvent.getStore();
    if (!context) return;
    const object = value as {
      id?: string;
      cvId?: string;
      applicationId?: string;
      documentId?: string;
      shortUUID?: string;
      revision: number;
    };
    const objectKind =
      context.kind === "application_document" ? "application" : context.kind;
    const objectId =
      context.kind === "cv"
        ? object.cvId
        : context.kind === "application_document"
          ? object.applicationId
          : object.id;
    if (
      objectId &&
      ["cv", "application", "stack", "comparison"].includes(objectKind)
    ) {
      await db.query(
        `UPDATE candidate_agent_sessions s SET object_kind=$3,object_id=$4
        FROM candidate_agent_requests r WHERE r.id=$1 AND r.session_id=s.id AND s.user_node_id=$2 AND s.object_id IS NULL
          AND NOT EXISTS(SELECT 1 FROM candidate_agent_sessions other WHERE other.user_node_id=s.user_node_id AND other.connection_id=s.connection_id AND other.object_kind=$3 AND other.object_id=$4)`,
        [context.requestId, owner, objectKind, objectId],
      );
    }
    await db.query(
      `INSERT INTO candidate_agent_events(request_id,mutation_id,event) VALUES($1,$2,$3)
      ON CONFLICT(request_id,mutation_id) WHERE mutation_id IS NOT NULL DO NOTHING`,
      [
        context.requestId,
        mutationId,
        JSON.stringify({
          type: "object",
          source: "device_reported",
          kind: context.kind,
          ...(context.kind === "comparison"
            ? { documentId: object.documentId, shortUUID: object.shortUUID }
            : {}),
          ...(object.id ? { id: object.id } : {}),
          revision: object.revision,
        }),
      ],
    );
  }

  async owner(
    wallet: string,
    db: Executor = this.postgres,
    lock = false,
  ): Promise<string> {
    if (!wallet) throw new ForbiddenException();
    const users = await db.query(
      `SELECT id::text FROM graph_nodes WHERE label='User'
      AND lower(properties->>'wallet')=lower($1) ${lock ? "FOR UPDATE" : ""}`,
      [wallet],
    );
    const [user] = users as { id: string }[];
    if (!user) throw new NotFoundException("Candidate not found");
    return user.id;
  }

  /** All candidate mutations serialize on the canonical user, across processes. */
  async mutate<T>(
    wallet: string,
    operation: string,
    input: MutationInput,
    work: (db: EntityManager, owner: string) => Promise<T>,
    policy: MutationPolicy = {},
  ): Promise<T> {
    return this.postgres.transaction(async db => {
      const owner = await this.owner(wallet, db, true);
      const invocation = this.candidateInvocation.getStore();
      const event = this.agentEvent.getStore();
      const context: CandidateInvocationContext = invocation?.context ?? (event
        ? { kind: "worker", owner, wallet, workerId: event.workerId, agentRequestId: event.requestId }
        : { kind: "session", owner, wallet });
      if (String(context.owner) !== owner || normalized(context.wallet) !== normalized(wallet))
        throw new ForbiddenException("Candidate identity changed");
      const requireAdvanced = !!(policy.requireAdvanced || invocation?.requireAdvanced);
      await this.authorizeCandidate(context, requireAdvanced, db);
      const [origin] = context.kind === "worker" ? await db.query(
        "SELECT oauth_grant_id FROM candidate_agent_requests WHERE id=$1 AND user_node_id=$2",
        [context.agentRequestId, owner],
      ) : [];
      const authority = {
        channel: context.kind,
        operation: invocation?.operation ?? operation,
        ...(context.kind === "oauth" ? { grantId: context.grantId, clientId: context.clientId } : {}),
        ...(context.kind === "worker" ? { agentRequestId: context.agentRequestId, grantId: origin.oauth_grant_id } : {}),
        ...(context.kind === "device" ? { deviceId: context.deviceId } : {}),
      };
      const inputHash = hash({ operation, input, authority });
      const [previous] = await db.query(
        `SELECT input_hash,response FROM candidate_mutations WHERE user_node_id=$1 AND request_id=$2`,
        [owner, input.requestId],
      );
      if (previous) {
        if (previous.input_hash !== inputHash)
          throw new ConflictException(
            "Request ID was already used for different input",
          );
        await this.authorizeCandidate(context, requireAdvanced, db);
        return previous.response as T;
      }
      const result = await work(db, owner);
      await this.authorizeCandidate(context, requireAdvanced, db);
      await this.commitAgentEvent(db, owner, input.requestId, result);
      await db.query(
        `INSERT INTO candidate_mutations(user_node_id,request_id,input_hash,response) VALUES($1,$2,$3,$4::jsonb)`,
        [owner, input.requestId, inputHash, JSON.stringify(result)],
      );
      return result;
    });
  }

  async entitled(
    owner: string,
    db: Executor = this.postgres,
  ): Promise<boolean> {
    const rows = await db.query(
      `SELECT EXISTS(SELECT 1 FROM candidate_subscriptions
      WHERE user_node_id=$1 AND status='active' AND paid_until>now()) AS active`,
      [owner],
    );
    return (rows as { active: boolean }[])[0].active;
  }

  async requireAdvanced(
    owner: string,
    db: Executor = this.postgres,
  ): Promise<void> {
    const [subscription] = await db.query(
      `SELECT charge_id FROM candidate_subscriptions WHERE user_node_id=$1
       AND status='active' AND paid_until>clock_timestamp() LIMIT 1
       ${db !== this.postgres ? "FOR SHARE" : ""}`,
      [owner],
    ) as { charge_id: string }[];
    if (!subscription) throw new ForbiddenException("Advanced subscription required");
  }

  private async projectedEvidence(owner: string, db: Executor): Promise<CareerEvidence[]> {
    const rows = await db.query(
      `SELECT claim.value || jsonb_build_object('usable',${evidenceUsableSql("claim.value", "$1")}) AS evidence
       FROM candidate_career_profiles p
       CROSS JOIN LATERAL jsonb_array_elements(p.evidence) WITH ORDINALITY claim(value,ordinal)
       WHERE p.user_node_id=$1 ORDER BY claim.ordinal`,
      [owner],
    ) as { evidence: CareerEvidence }[];
    return rows.map(row => row.evidence);
  }

  async usableEvidence(wallet: string, db: Executor = this.postgres): Promise<CareerEvidence[]> {
    return (await this.projectedEvidence(await this.owner(wallet, db), db)).filter(item => item.usable);
  }

  async career(
    wallet: string,
  ): Promise<CareerState & { documents: unknown[] }> {
    const owner = await this.owner(wallet);
    const [profile] = await this.postgres.query<{
      revision: number;
      evidence: CareerEvidence[];
    }>(
      `SELECT revision,evidence FROM candidate_career_profiles WHERE user_node_id=$1`,
      [owner],
    );
    const documents = await this.postgres.query(
      `SELECT id,filename,storage_kind AS "storageKind",created_at AS "createdAt",
        jsonb_build_object('name',left(parsed_result->>'name',160),'email',left(parsed_result->>'email',200),'location',parsed_result->'location') AS "extractedProfile"
        FROM candidate_documents WHERE user_node_id=$1 ORDER BY created_at DESC`,
      [owner],
    );
    if (profile) profile.evidence = await this.projectedEvidence(owner, this.postgres);
    // Derive workflow context from owned requests, including facts saved before
    // workflow metadata was exposed. Switching providers must not hide drafts.
    const messageIds = (profile?.evidence ?? []).flatMap(e =>
      e.source.messageId ? [e.source.messageId] : [],
    );
    if (messageIds.length) {
      const messages = await this.postgres.query<{
        id: string;
        objectKind: string;
        objectId: string;
        classification: string;
      }>(
        `SELECT r.id,s.object_kind AS "objectKind",s.object_id AS "objectId",s.object_classification AS classification
         FROM candidate_agent_requests r JOIN candidate_agent_sessions s ON s.id=r.session_id
         WHERE r.user_node_id=$1 AND s.user_node_id=$1 AND r.id=ANY($2::uuid[]) AND s.object_id IS NOT NULL`,
        [owner, messageIds],
      );
      const workflows = new Map(
        messages.map(({ id, ...workflow }) => [id, workflow]),
      );
      for (const fact of profile.evidence) {
        const workflow = workflows.get(fact.source.messageId);
        if (workflow) fact.source.workflow = workflow;
      }
    }
    return { ...(profile ?? { revision: 0, evidence: [] }), documents };
  }

  async cvReviews(wallet: string, documentId: string) {
    const owner = await this.owner(wallet);
    const [document] = await this.postgres.query(
      "SELECT id FROM candidate_documents WHERE id=$1 AND user_node_id=$2",
      [documentId, owner],
    );
    if (!document) throw new NotFoundException("CV not found");
    return this.postgres.query(
      `SELECT j.title AS "jobTitle",review.id,review.revision,review.short_uuid AS "shortUUID",review.document_id AS "documentId",review.content,review.updated_at AS "updatedAt",connection.provider,
      (review.cv_hash<>md5(d.source_text) OR review.ad_hash IS DISTINCT FROM md5(original.content)) AS stale
      FROM candidate_cv_job_reviews review JOIN candidate_documents d ON d.id=review.document_id
      JOIN candidate_agent_requests request ON request.id=review.agent_request_id JOIN candidate_agent_sessions session ON session.id=request.session_id
      JOIN candidate_ai_connections connection ON connection.id=session.connection_id
      LEFT JOIN job_search_documents j ON j.short_uuid=review.short_uuid
      LEFT JOIN LATERAL (SELECT n.properties->>'content' AS content FROM graph_relationships r JOIN graph_nodes n ON n.id=r.source_id AND n.label='Jobpost' WHERE r.target_id=j.job_node_id AND r.type='HAS_STRUCTURED_JOBPOST' ORDER BY n.id LIMIT 1) original ON true
      WHERE review.user_node_id=$1 AND review.document_id=$2
        AND NOT EXISTS(SELECT 1 FROM graph_relationships blocked JOIN graph_nodes company ON company.id=blocked.target_id
          WHERE blocked.source_id=$1 AND blocked.type='BLOCKED_ORG_JOBS'
            AND COALESCE(company.properties->>'orgId',company.properties->>'id')=COALESCE(j.organization_id,j.project_id))
      ORDER BY review.updated_at DESC`,
      [owner, documentId],
    );
  }
  async saveCvReview(
    wallet: string,
    input: CvReviewInput,
    agentRequestId: string,
  ) {
    return this.mutate(wallet, "cv_job_review", input, async (db, owner) => {
      await this.requireAdvanced(owner, db);
      const [doc] = await db.query(
        "SELECT source_text,md5(source_text) AS hash FROM candidate_documents WHERE id=$1 AND user_node_id=$2",
        [input.documentId, owner],
      );
      if (!doc) throw new NotFoundException("CV not found");
      const [ad] = await db.query(
        `SELECT n.properties->>'content' AS text,md5(n.properties->>'content') AS hash FROM job_search_documents j JOIN graph_relationships r ON r.target_id=j.job_node_id AND r.type='HAS_STRUCTURED_JOBPOST' JOIN graph_nodes n ON n.id=r.source_id AND n.label='Jobpost' WHERE j.short_uuid=$1 AND j.online AND NOT j.blocked AND j.published_timestamp BETWEEN extract(epoch FROM now()-interval '21 days')*1000 AND extract(epoch FROM now())*1000
          AND NOT EXISTS(SELECT 1 FROM graph_relationships blocked JOIN graph_nodes company ON company.id=blocked.target_id
            WHERE blocked.source_id=$2 AND blocked.type='BLOCKED_ORG_JOBS'
              AND COALESCE(company.properties->>'orgId',company.properties->>'id')=COALESCE(j.organization_id,j.project_id))
          ORDER BY n.id LIMIT 1`,
        [input.shortUUID, owner],
      );
      if (!ad) throw new NotFoundException("Recent original ad not found");
      if (doc.hash !== input.cvHash || ad.hash !== input.adHash)
        throw new ConflictException(
          "Source changed; read the CV and original ad again",
        );
      for (const r of input.requirements) {
        if (!ad.text.includes(r.requirement))
          throw new BadRequestException(
            "Requirement must be an exact original-ad excerpt",
          );
        if (r.cvExcerpt && !doc.source_text.includes(r.cvExcerpt))
          throw new BadRequestException(
            "Evidence must be an exact selected-CV excerpt",
          );
        if (["supported", "partial"].includes(r.state) && !r.cvExcerpt)
          throw new BadRequestException(
            "A positive assessment needs CV evidence",
          );
      }
      const [previous] = await db.query(
        "SELECT id,revision FROM candidate_cv_job_reviews WHERE user_node_id=$1 AND document_id=$2 AND short_uuid=$3",
        [owner, input.documentId, input.shortUUID],
      );
      if ((previous?.revision ?? 0) !== input.revision)
        throw new ConflictException(
          "Comparison changed; read the latest revision",
        );
      const id = previous?.id ?? randomUUID(),
        revision = input.revision + 1;
      const content = {
        summary: input.summary,
        requirements: input.requirements,
        nextSteps: input.nextSteps,
        metrics: Object.fromEntries(
          ["supported", "partial", "gap", "unclear"].map(state => [
            state,
            input.requirements.filter(r => r.state === state).length,
          ]),
        ),
      };
      await db.query(
        `INSERT INTO candidate_cv_job_reviews(id,user_node_id,document_id,short_uuid,revision,cv_hash,ad_hash,original_ad_text,content,agent_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(user_node_id,document_id,short_uuid) DO UPDATE SET revision=EXCLUDED.revision,cv_hash=EXCLUDED.cv_hash,ad_hash=EXCLUDED.ad_hash,original_ad_text=EXCLUDED.original_ad_text,content=EXCLUDED.content,agent_request_id=EXCLUDED.agent_request_id,updated_at=now()`,
        [
          id,
          owner,
          input.documentId,
          input.shortUUID,
          revision,
          input.cvHash,
          input.adHash,
          ad.text,
          JSON.stringify(content),
          agentRequestId,
        ],
      );
      return {
        id,
        revision,
        documentId: input.documentId,
        shortUUID: input.shortUUID,
        href: `/onboarding?document=${input.documentId}`,
        content,
      };
    });
  }

  /** One owned source document is the current recruiter-facing resume.
   * A caller that already holds the owner lock passes its transaction. */
  async linkResume(
    wallet: string,
    input: LinkResumeInput,
    transaction?: EntityManager,
  ) {
    const allowed = ["https://jobstash.xyz", "https://www.jobstash.xyz"];
    if (process.env.NODE_ENV === "development")
      allowed.push("http://localhost:3000", "http://127.0.0.1:3000");
    if (!allowed.includes(input.origin))
      throw new BadRequestException("Invalid resume origin");
    const link = async (db: EntityManager) => {
      const owner = await this.owner(wallet, db, true);
      const [document] = await db.query(
        "SELECT id,storage_kind FROM candidate_documents WHERE id=$1 AND user_node_id=$2",
        [input.documentId, owner],
      );
      if (!document) throw new NotFoundException("Document not found");
      const existing = await db.query(
        `SELECT n.id,n.properties FROM graph_relationships r JOIN graph_nodes n ON n.id=r.target_id
         WHERE r.source_id=$1 AND r.type='HAS_SHOWCASE' AND n.label='UserShowCase'
           AND n.properties->>'label'='CV' ORDER BY n.id`,
        [owner],
      );
      if (input.onlyIfMissing && existing.length)
        return { linked: false, url: existing[0].properties.url };
      const url =
        input.origin +
        (document.storage_kind === "text"
          ? `/api/profile/resume/text/${document.id}`
          : `/api/resume/${document.id}`);
      if (existing.length) {
        await db.query(
          "UPDATE graph_nodes SET properties=properties || $2::jsonb,updated_at=now() WHERE id=$1",
          [existing[0].id, JSON.stringify({ url, documentId: document.id })],
        );
      } else {
        const id = randomUUID();
        const [node] = await db.query(
          `INSERT INTO graph_nodes(label,labels,node_key,properties)
           VALUES('UserShowCase',ARRAY['UserShowCase'],$1,$2::jsonb) RETURNING id`,
          [
            `runtime:UserShowCase:${id}`,
            JSON.stringify({ id, label: "CV", url, documentId: document.id }),
          ],
        );
        await db.query(
          `INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties)
           VALUES($1,$2,'HAS_SHOWCASE','','{}')`,
          [owner, node.id],
        );
      }
      return { linked: true, url };
    };
    return transaction ? link(transaction) : this.postgres.transaction(link);
  }

  async pasteCv(
    wallet: string,
    text: string,
    filename?: string,
    mutation?: MutationInput,
  ): Promise<{ id: string; filename: string }> {
    if (
      !text.trim() ||
      text.length > 20000 ||
      Buffer.byteLength(text, "utf8") > 80000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)
    )
      throw new BadRequestException(
        "Enter CV text up to 20,000 characters without control characters",
      );
    // Parameterized opaque source data: never parse templates, execute, fetch URLs or infer facts here.
    return this.registerDocument(
      wallet,
      {
        id: mutation?.requestId ?? randomUUID(),
        filename: filename?.trim()
          ? `${filename
              .trim()
              .replace(/[\/\\]/g, "-")
              .replace(/\.txt$/i, "")}.txt`
          : "Pasted CV.txt",
        contentHash: createHash("sha256")
          .update("pasted-cv-v1\n")
          .update(text)
          .digest("hex"),
        sourceText: text,
      },
      "text",
      mutation,
    );
  }
  async textDocument(
    wallet: string,
    id: string,
  ): Promise<{ id: string; filename: string; text: string }> {
    const owner = await this.owner(wallet);
    const [document] = await this.postgres.query<{
      id: string;
      filename: string;
      text: string;
    }>(
      `SELECT id,filename,source_text AS text FROM candidate_documents WHERE id=$1 AND user_node_id=$2 AND storage_kind='text'`,
      [id, owner],
    );
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  async registerDocument(
    wallet: string,
    input: DocumentInput,
    storageKind: "object" | "text" = "object",
    mutation?: MutationInput,
    transaction?: EntityManager,
  ): Promise<{ id: string; filename: string }> {
    const work = async (db: EntityManager, owner: string) => {
      const [existing] = await db.query(
        `SELECT id,filename FROM candidate_documents WHERE user_node_id=$1 AND content_hash=$2`,
        [owner, input.contentHash],
      );
      if (existing) return existing;
      if (storageKind === "text") {
        const [usage] = await db.query(
          "SELECT count(*)::int AS count FROM candidate_documents WHERE user_node_id=$1 AND storage_kind='text'",
          [owner],
        );
        if (usage.count >= 100)
          throw new BadRequestException("Text document limit reached");
      }
      const [collision] = await db.query(
        `SELECT id FROM candidate_documents WHERE id=$1`,
        [input.id],
      );
      if (collision) throw new ConflictException("Document ID is unavailable");
      const [document] = await db.query(
        `INSERT INTO candidate_documents(id,user_node_id,content_hash,filename,source_text,storage_kind)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id,filename`,
        [
          input.id,
          owner,
          input.contentHash,
          input.filename,
          input.sourceText ?? null,
          storageKind,
        ],
      );
      return document;
    };
    if (transaction)
      return work(transaction, await this.owner(wallet, transaction, true));
    return mutation
      ? this.mutate(wallet, "source-register", { ...mutation, document: input, storageKind } as MutationInput, work)
      : this.postgres.transaction(async db => {
          const owner = await this.owner(wallet, db, true);
          const context = this.currentCandidateInvocation();
          if (context) await this.authorizeCandidate(context, this.candidateInvocation.getStore()?.requireAdvanced, db);
          const result = await work(db, owner);
          if (context) await this.authorizeCandidate(context, this.candidateInvocation.getStore()?.requireAdvanced, db);
          return result;
        });
  }

  async evidence(
    wallet: string,
    input: EvidenceInput,
    messageId?: string,
  ): Promise<CareerState> {
    return this.mutate(wallet, "evidence", input, async (db, owner) => {
      await db.query(
        `INSERT INTO candidate_career_profiles(user_node_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [owner],
      );
      const [profile]: CareerState[] = await db.query(
        `SELECT revision,evidence FROM candidate_career_profiles WHERE user_node_id=$1`,
        [owner],
      );
      if (profile.revision !== input.revision)
        throw new ConflictException(
          "Career profile changed; reload before editing",
        );
      const statement = input.statement.trim();
      if (!statement)
        throw new BadRequestException("Evidence statement is empty");
      const source: CareerEvidence["source"] = {
        kind: messageId ? "inference" : "candidate",
        excerpt: null,
        ...(messageId ? { messageId } : { candidateAuthored: true }),
      };
      if (
        input.sourceMessageId &&
        (!messageId || input.documentId || input.applicationDocumentId)
      )
        throw new BadRequestException(
          "Choose a conversation source through the active agent request",
        );
      if (messageId) {
        const [message] = await db.query(
          `SELECT source.id,source.prompt FROM candidate_agent_requests source
           JOIN candidate_agent_sessions source_session ON source_session.id=source.session_id
           JOIN candidate_agent_requests current ON current.id=$3 AND current.user_node_id=$2
           JOIN candidate_agent_sessions current_session ON current_session.id=current.session_id AND current_session.user_node_id=$2
           WHERE source.id=$1 AND source.user_node_id=$2 AND source_session.user_node_id=$2
             AND source.created_at<=current.created_at
             AND (source.session_id=current.session_id OR
               (source_session.object_id IS NOT NULL AND source_session.object_id=current_session.object_id
                AND source_session.object_kind=current_session.object_kind
                AND source_session.object_classification=current_session.object_classification))`,
          [input.sourceMessageId ?? messageId, owner, messageId],
        );
        if (!message)
          throw new NotFoundException("Source conversation request not found");
        source.excerpt = message.prompt;
        source.messageId = message.id;
      }
      if (input.documentId) {
        const [document] = await db.query(
          `SELECT source_text,content_hash FROM candidate_documents WHERE id=$1 AND user_node_id=$2`,
          [input.documentId, owner],
        );
        if (!document) throw new NotFoundException("Document not found");
        if (!input.excerpt || !document.source_text?.includes(input.excerpt))
          throw new BadRequestException(
            "Source excerpt is not in the document",
          );
        Object.assign(source, {
          kind: "document",
          documentId: input.documentId,
          excerpt: input.excerpt,
          contentHash: document.content_hash,
          authority: messageId ? "extraction" : "citation",
          ...(messageId ? { extractionMode: "text", extractionRequestId: messageId } : {}),
        });
      }
      const attributes = {
        kind: input.kind,
        employer: input.employer,
        role: input.role,
        startDate: input.startDate,
        endDate: input.endDate,
      };
      if (input.answerId || input.answerRevision || input.applicationDocumentId) {
        if (!input.applicationDocumentId || !input.answerId || !input.answerRevision ||
            input.documentId || !messageId)
          throw new BadRequestException("Choose a saved candidate answer through the active agent request");
        const [application] = await db.query(
          "SELECT content FROM candidate_application_documents WHERE id=$1 AND user_node_id=$2",
          [input.applicationDocumentId, owner],
        );
        if (!application) throw new NotFoundException("Application document not found");
        const answer = application.content.questions?.find(
          (question: { id: string }) => question.id === input.answerId,
        );
        if (!answer || answer.revision !== input.answerRevision)
          throw new ConflictException("Candidate answer changed; read the current application");
        if (typeof answer.answer !== "string" || !answer.answer.trim())
          throw new BadRequestException("This question has no candidate answer");
        Object.assign(source, {
          kind: "answer",
          applicationDocumentId: input.applicationDocumentId,
          answerId: input.answerId,
          answerRevision: input.answerRevision,
          excerpt: `${answer.question}\n${answer.answer}`,
        });
      }
      const duplicate = profile.evidence.find(
          e =>
            e.statement === statement &&
            normalized(e.employer) === normalized(input.employer) &&
            normalized(e.role) === normalized(input.role) &&
            e.source.documentId === input.documentId &&
            e.source.applicationDocumentId === input.applicationDocumentId &&
            e.source.answerId === input.answerId &&
            e.source.answerRevision === input.answerRevision &&
            (e.startDate ?? "") === (input.startDate ?? "") &&
            (e.endDate ?? "") === (input.endDate ?? ""),
        );
        if (!duplicate)
          profile.evidence.push({
            id: randomUUID(),
            statement,
            ...attributes,
            source,
            excluded: false,
            conflicts: [],
          });
      if (profile.evidence.length > 1000)
        throw new BadRequestException("Career profile evidence limit reached");
      // Different dates for the same named role are conflicts, not replacements.
      profile.evidence = findEvidenceConflicts(profile.evidence);
      const revision = profile.revision + 1;
      await db.query(
        `UPDATE candidate_career_profiles SET evidence=$2,revision=$3,updated_at=now() WHERE user_node_id=$1`,
        [owner, JSON.stringify(profile.evidence), revision],
      );
      return { revision, evidence: profile.evidence };
    });
  }

  async stacks(
    wallet: string,
    includeDirections = true,
  ): Promise<{ advanced: boolean; stacks: StackDefinition[] }> {
    const owner = await this.owner(wallet);
    const advanced = await this.entitled(owner);
    const directions = includeDirections
      ? ((await this.directions(wallet)).selected as string[])
      : [];
    const defaults = [
      {
        id: "best",
        revision: 0,
        name: "Best matches",
        intent: "best",
        pinned: true,
        classifications: [],
      },
      ...(advanced
        ? [
            {
              id: "fresh",
              revision: 0,
              name: "Fresh opportunities",
              intent: "fresh",
              pinned: true,
              classifications: [],
            },
            {
              id: "direction",
              revision: 0,
              name: "Selected career directions",
              intent: "direction",
              pinned: true,
              classifications: directions,
            },
            {
              id: "network",
              revision: 0,
              name: "You have a connection",
              intent: "network",
              pinned: true,
              classifications: [],
            },
            {
              id: "adjacent",
              revision: 0,
              name: "Adjacent opportunities",
              intent: "adjacent",
              pinned: true,
              classifications: directions,
            },
          ]
        : []),
    ];
    const custom = await this.postgres.query<{
      id: string;
      revision: number;
      definition: Omit<StackDefinition, "id" | "revision">;
    }>(
      `SELECT id,revision,definition FROM candidate_stacks WHERE user_node_id=$1 ORDER BY COALESCE((definition->>'pinned')::boolean,false) DESC,created_at`,
      [owner],
    );
    return {
      advanced,
      stacks: [
        ...defaults,
        ...custom.map(row => ({
          id: row.id,
          revision: row.revision,
          ...row.definition,
        })),
      ],
    };
  }

  async saveStack(
    wallet: string,
    input: StackInput,
    id?: string,
  ): Promise<StackDefinition> {
    return this.mutate(
      wallet,
      `stack:${id ?? "new"}`,
      input,
      async (db, owner) => {
        await this.requireAdvanced(owner, db);
        if (!input.name.trim())
          throw new BadRequestException("Stack name is empty");
        const [row] = id
          ? await db.query(
              `SELECT revision FROM candidate_stacks WHERE id=$1 AND user_node_id=$2`,
              [id, owner],
            )
          : [];
        if (id && !row) throw new NotFoundException("Stack not found");
        if ((row?.revision ?? 0) !== input.revision)
          throw new ConflictException("Stack changed");
        if (input.classifications.length) {
          const rows = await db.query(
            `SELECT DISTINCT c.value AS name FROM job_search_documents j CROSS JOIN LATERAL jsonb_each_text(COALESCE(j.filter_labels->'classifications','{}')) c WHERE c.value=ANY($1::text[])`,
            [input.classifications],
          );
          if (input.classifications.some(c => !rows.some(r => r.name === c)))
            throw new BadRequestException(
              "Choose an existing career direction",
            );
        }
        if (!validateStackFilters(input.filters ?? {}))
          throw new BadRequestException(
            "Unsupported stack filters; use Explorer facet keys and USD salary ranges",
          );
        if (
          input.filters?.minSalaryRange != null &&
          input.filters?.maxSalaryRange != null &&
          input.filters.minSalaryRange >= input.filters.maxSalaryRange
        )
          throw new BadRequestException("Salary range is empty");
        const filterLabels: Record<string, string[]> = {};
        for (const [facet, keys] of Object.entries(input.filters ?? {})) {
          if (!Array.isArray(keys) || !keys.length) continue;
          const options = await this.stackFilterOptions(facet, "", keys);
          filterLabels[facet] = keys.map(
            key => options.find(option => option.id === key)?.name ?? key,
          );
          if (keys.some(key => !options.some(option => option.id === key)))
            throw new BadRequestException(
              `Unknown ${facet} filter; resolve the name with stack_filter_options`,
            );
        }
        const stackId = id ?? randomUUID();
        const definition = {
          name: input.name.trim(),
          intent: input.intent,
          pinned: input.pinned,
          classifications: input.classifications,
          workModes: input.workModes ?? [],
          filters: input.filters ?? {},
          filterLabels,
          keywords: Object.fromEntries(
            ["all", "any", "exclude"].map(key => {
              const terms = (input.keywords?.[key] ?? []).map((term: string) =>
                term.trim(),
              );
              if (terms.some((term: string) => !term))
                throw new BadRequestException("Search terms cannot be blank");
              return [key, [...new Set(terms)]];
            }),
          ),
        };
        await db.query(
          `INSERT INTO candidate_stacks(id,user_node_id,revision,definition) VALUES($1,$2,1,$3)
        ON CONFLICT(id) DO UPDATE SET revision=candidate_stacks.revision+1,definition=EXCLUDED.definition`,
          [stackId, owner, JSON.stringify(definition)],
        );
        return { id: stackId, revision: input.revision + 1, ...definition };
      },
    );
  }

  async stackFilterOptions(
    facet: string,
    search = "",
    ids?: string[],
  ): Promise<{ id: string; name: string }[]> {
    if (!Object.hasOwn(stackFacetColumns, facet))
      throw new BadRequestException("Unsupported facet");
    if (facet === "seniority")
      return this.postgres.query(
        "SELECT DISTINCT seniority AS id,seniority AS name FROM job_search_documents WHERE seniority IS NOT NULL AND ($1='' OR strpos(lower(seniority),lower($1))>0) AND ($2::text[] IS NULL OR seniority=ANY($2)) ORDER BY seniority",
        [search, ids ?? null],
      );
    return this.postgres.query(
      `SELECT DISTINCT item.key AS id,item.value AS name FROM job_search_documents j
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(j.filter_labels->$1,'{}')) item
      WHERE ($2='' OR strpos(lower(item.value),lower($2))>0 OR lower(item.key)=lower($2))
        AND ($3::text[] IS NULL OR item.key=ANY($3))
      ORDER BY name LIMIT 10000`,
      [facet, search, ids ?? null],
    );
  }

  async deleteStack(
    wallet: string,
    id: string,
    input: MutationInput,
  ): Promise<{ id: string; deleted: boolean }> {
    return this.mutate(
      wallet,
      `remove-stack:${id}`,
      input,
      async (db, owner) => {
        await this.requireAdvanced(owner, db);
        const rows = await db.query(
          `DELETE FROM candidate_stacks WHERE user_node_id=$1 AND id=$2 AND revision=$3 RETURNING id`,
          [owner, id, input.revision],
        );
        if (!rows.length)
          throw new ConflictException("Stack missing or changed");
        return { id, deleted: true };
      },
    );
  }

  /** Allocation is shared by every personalized surface, including weekly email. */
  async classifiedJobs(
    wallet: string,
    classifications: string[],
    adjacent = false,
  ): Promise<Set<string>> {
    const owner = await this.owner(wallet);
    await this.requireAdvanced(owner);
    // Stable classifications, connected by observed original-ad requirements.
    // Stored sentence neighbors only; no title clustering or inference on reads.
    const rows = await this.postgres.query<{ short_uuid: string }>(
      `WITH selected AS MATERIALIZED (
        SELECT job_node_id,short_uuid FROM job_search_documents
        WHERE online AND NOT blocked AND published_timestamp>=extract(epoch FROM now()-interval '21 days')*1000
          AND EXISTS(SELECT 1 FROM jsonb_each_text(COALESCE(filter_labels->'classifications','{}')) c WHERE lower(c.value)=ANY($1::text[]))
      ), requirements AS MATERIALIZED (
        SELECT DISTINCT ON (sentence.text_hash) sentence.text_hash,sentence.embedding,sentence.weight
        FROM selected JOIN recommendation_sentence_embeddings sentence ON sentence.kind='job' AND sentence.node_id=selected.job_node_id
        JOIN recommendation_embedding_documents doc USING(kind,node_id)
        WHERE $2 AND sentence.weight>=0.35 AND doc.status='ready'
          AND (NOT EXISTS(SELECT 1 FROM candidate_career_archetypes a WHERE lower(a.classification)=ANY($1::text[]) AND jsonb_array_length(a.requirements)>0)
            OR sentence.text_hash IN(SELECT r->>'textHash' FROM candidate_career_archetypes a CROSS JOIN LATERAL jsonb_array_elements(a.requirements) r WHERE lower(a.classification)=ANY($1::text[])))
          AND doc.content_hash=md5(recommendation_embedding_content('job',doc.node_id))
        ORDER BY sentence.text_hash,sentence.weight DESC LIMIT 30
      ), neighbors AS MATERIALIZED (
        SELECT requirement.text_hash,match.node_id FROM requirements requirement CROSS JOIN LATERAL (
          SELECT target.node_id,target.embedding FROM recommendation_sentence_embeddings target
          WHERE target.kind='job' AND target.weight>=0.35
          ORDER BY target.embedding <=> requirement.embedding LIMIT 100
        ) match WHERE 1-(match.embedding <=> requirement.embedding)>=0.8
      ) SELECT j.short_uuid FROM job_search_documents j
      WHERE CASE WHEN $2 THEN NOT EXISTS(SELECT 1 FROM selected s WHERE s.job_node_id=j.job_node_id)
        AND (SELECT count(DISTINCT n.text_hash) FROM neighbors n WHERE n.node_id=j.job_node_id)>=2
        ELSE EXISTS(SELECT 1 FROM selected s WHERE s.job_node_id=j.job_node_id) END`,
      [classifications.map(normalized), adjacent],
    );
    return new Set(rows.map(row => row.short_uuid));
  }

  async directions(wallet: string): Promise<Record<string, unknown>> {
    const owner = await this.owner(wallet);
    const [profile] = await this.postgres.query<{
      revision: number;
      directions: string[];
      directions_updated_at: string | null;
    }>(
      `SELECT revision,directions,directions_updated_at FROM candidate_career_profiles WHERE user_node_id=$1`,
      [owner],
    );
    const available = await this.postgres.query(
      `SELECT c.value AS name,count(*)::int AS jobs FROM job_search_documents j CROSS JOIN LATERAL jsonb_each_text(COALESCE(j.filter_labels->'classifications','{}')) c GROUP BY c.value ORDER BY jobs DESC LIMIT 100`,
    );
    let selected: string[] = profile?.directions ?? [];
    let source = "selected";
    if (!profile?.directions_updated_at && !selected.length) {
      const inferred = await this.postgres.query<{ name: string }>(
        `WITH target_user AS MATERIALIZED (SELECT $1::bigint AS id,now() AS ranked_at),
        ${recommendationCategoryAffinityCtes},
        preferred AS (SELECT unnest(job_categories) AS name FROM user_job_preferences WHERE user_node_id=$1),
        available AS (SELECT DISTINCT c.value AS name FROM job_search_documents j CROSS JOIN LATERAL jsonb_each_text(COALESCE(j.filter_labels->'classifications','{}')) c),
        explicit_categories AS (SELECT DISTINCT a.name FROM available a JOIN preferred p ON regexp_replace(lower(a.name),'[^a-z0-9]','','g')=regexp_replace(lower(p.name),'[^a-z0-9]','','g'))
        SELECT name FROM explicit_categories
        UNION ALL
        SELECT name FROM (SELECT a.name FROM classification_affinity affinity JOIN available a ON lower(a.name)=affinity.label_key
          WHERE affinity.weight>0 AND NOT EXISTS(SELECT 1 FROM explicit_categories)
          ORDER BY affinity.weight DESC,a.name LIMIT 5) learned`,
        [owner],
      );
      selected = inferred.map(row => row.name);
      source = selected.length ? "account" : "empty";
    }
    return {
      revision: profile?.revision ?? 0,
      selected,
      source,
      available,
      archetypes: await this.postgres.query(
        `SELECT id,name,classification,requirements,sample_size AS "sampleSize",sampled_at AS "asOf",source FROM candidate_career_archetypes ORDER BY id`,
      ),
      requirementSource:
        "Recent original-ad sentences; lexical evidence matches require review",
    };
  }

  async saveDirections(
    wallet: string,
    input: DirectionsInput,
  ): Promise<Record<string, unknown>> {
    return this.mutate(wallet, "directions", input, async (db, owner) => {
      await db.query(
        `INSERT INTO candidate_career_profiles(user_node_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [owner],
      );
      const [profile] = await db.query(
        `SELECT revision FROM candidate_career_profiles WHERE user_node_id=$1`,
        [owner],
      );
      if (profile.revision !== input.revision)
        throw new ConflictException("Career profile changed");
      const known = await db.query(
        `SELECT DISTINCT c.value AS name FROM job_search_documents j CROSS JOIN LATERAL jsonb_each_text(COALESCE(j.filter_labels->'classifications','{}')) c WHERE c.value=ANY($1::text[])`,
        [input.directions],
      );
      if (
        new Set(known.map(r => r.name)).size !== new Set(input.directions).size
      )
        throw new BadRequestException(
          "Choose an existing career classification",
        );
      await db.query(
        `UPDATE candidate_career_profiles SET directions=$2,directions_updated_at=now(),revision=revision+1 WHERE user_node_id=$1`,
        [owner, input.directions],
      );
      return { revision: input.revision + 1, selected: input.directions };
    });
  }

  async allocate<T extends { job: { shortUUID: string } }>(
    wallet: string,
    jobs: T[],
  ): Promise<T[]> {
    // Paid reads do not consume quota and must not serialize behind the owner lock.
    // Keep entitlement live; free allocation rechecks it under the canonical lock.
    const owner = await this.owner(wallet);
    if (await this.entitled(owner)) return jobs;
    return this.postgres.transaction(async db => {
      const owner = await this.owner(wallet, db, true);
      if (await this.entitled(owner, db)) return jobs;
      const [daily] = await db.query(
        `SELECT count(*)::int AS count FROM candidate_match_allocations WHERE user_node_id=$1 AND allocated_day=(now() AT TIME ZONE 'UTC')::date`,
        [owner],
      );
      const ids = jobs.map(({ job }) => job.shortUUID);
      await db.query(
        `INSERT INTO candidate_match_allocations(user_node_id,job_node_id)
        SELECT $1,job.job_node_id FROM unnest($2::text[]) WITH ORDINALITY wanted(id,rank)
        JOIN job_search_documents job ON job.short_uuid=wanted.id
        WHERE NOT EXISTS(SELECT 1 FROM candidate_match_allocations previous WHERE previous.user_node_id=$1 AND previous.job_node_id=job.job_node_id)
        ORDER BY wanted.rank LIMIT $3 ON CONFLICT DO NOTHING`,
        [owner, ids, Math.max(0, 10 - daily.count)],
      );
      const rows = await db.query(
        `SELECT job.short_uuid FROM candidate_match_allocations allocation JOIN job_search_documents job ON job.job_node_id=allocation.job_node_id
        WHERE allocation.user_node_id=$1 AND job.short_uuid=ANY($2::text[])`,
        [owner, ids],
      );
      const allowed = new Set(rows.map(row => row.short_uuid));
      return jobs.filter(({ job }) => allowed.has(job.shortUUID));
    });
  }

  async applications(wallet: string): Promise<Record<string, unknown>[]> {
    const owner = await this.owner(wallet);
    return this.postgres.query(
      `SELECT application.id,application.revision,application.state,application.ranking_version AS "rankingVersion",COALESCE(job.payload,application.job_snapshot) AS job,
      COALESCE(job.short_uuid,application.short_uuid) AS "shortUUID",application.updated_at AS "updatedAt"
      FROM candidate_applications application LEFT JOIN job_search_documents job ON job.job_node_id=application.job_node_id
      WHERE application.user_node_id=$1 ORDER BY application.updated_at DESC`,
      [owner],
    );
  }

  async action(
    wallet: string,
    input: ActionInput,
  ): Promise<ApplicationMutationResult> {
    return this.mutate(
      wallet,
      "application-action",
      input,
      async (db, owner) => {
        if (["block_company", "unblock_company", "undo"].includes(input.action))
          await db.query("SELECT pg_advisory_xact_lock(73129011)");
        const [job] = await db.query(
          `SELECT job_node_id::text AS id,payload FROM job_search_documents WHERE short_uuid=$1
           UNION ALL SELECT job_node_id::text AS id,job_snapshot AS payload FROM candidate_applications WHERE short_uuid=$1 AND user_node_id=$2 AND job_node_id IS NULL LIMIT 1`,
          [input.shortUUID, owner],
        );
        if (!job) throw new NotFoundException("Job not found");
        const [row] = await db.query(
          `SELECT id,revision,state,ranking_version FROM candidate_applications WHERE user_node_id=$1 AND short_uuid=$2`,
          [owner, input.shortUUID],
        );
        if ((row?.revision ?? 0) !== input.revision)
          throw new ConflictException(
            "Application changed; reload before editing",
          );
        const [employer] = await db.query(
          `SELECT n.id,EXISTS(SELECT 1 FROM graph_relationships b WHERE b.source_id=$2 AND b.target_id=n.id AND b.type='BLOCKED_ORG_JOBS') AS blocked
           FROM job_search_documents j JOIN graph_nodes n ON COALESCE(n.properties->>'orgId',n.properties->>'id')=COALESCE(j.organization_id,j.project_id)
           AND n.label IN ('Organization','Project') WHERE j.short_uuid=$1 LIMIT 1`,
          [input.shortUUID, owner],
        );
        const before: ApplicationState = {
          ...(row?.state ?? EMPTY_APPLICATION),
          companyBlocked: employer?.blocked ?? false,
        };
        let changeCompany = false;
        let state = { ...before };
        const events: Record<string, string> = {
          pass: "job_dismiss",
          block_company: "company_exclude",
          unblock_company: "company_unexclude",
          interested: "job_interest",
          save: "job_bookmark",
          applied: "job_application_confirmed",
          preparing: "job_preparing",
          interview: "job_outcome",
          offer: "job_outcome",
          rejected: "job_outcome",
          withdrawn: "job_outcome",
          undo: "job_undo",
        };
        let eventType = events[input.action];
        if (input.action === "undo") {
          if (!input.undoRequestId)
            throw new BadRequestException("Choose an action to undo");
          const [original] = await db.query(
            `SELECT response FROM candidate_mutations WHERE user_node_id=$1 AND request_id=$2`,
            [owner, input.undoRequestId],
          );
          if (
            !original ||
            original.response.action === "undo" ||
            original.response.shortUUID !== input.shortUUID ||
            original.response.revision !== input.revision ||
            !original.response.before
          )
            throw new ConflictException(
              "Only the latest action on this job can be undone",
            );
          state = original.response.before;
          changeCompany = ["block_company", "unblock_company"].includes(
            original.response.action,
          );
          await db.query(
            `UPDATE user_activity_events SET metadata=metadata||'{"undone":true}'::jsonb WHERE user_node_id=$1 AND event_key=$2`,
            [owner, input.undoRequestId],
          );
        } else if (
          ["block_company", "unblock_company"].includes(input.action)
        ) {
          if (!employer)
            throw new BadRequestException(
              "This job has no canonical company to exclude",
            );
          state.companyBlocked = input.action === "block_company";
          changeCompany = true;
        } else if (input.action === "pass") state.passed = true;
        else if (input.action === "interested") {
          state.interested = !state.interested;
          state.passed = false;
          if (!state.interested) eventType = "job_uninterest";
        } else if (input.action === "save") {
          state.saved = !state.saved;
          if (!state.saved) eventType = "job_unbookmark";
        } else {
          state.status = input.action;
          state.passed = false;
        }
        if (changeCompany && employer) {
          if (state.companyBlocked) {
            await db.query(
              `INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties) VALUES($1,$2,'BLOCKED_ORG_JOBS','','{}') ON CONFLICT DO NOTHING`,
              [owner, employer.id],
            );
            // Invalidate work before the worker's next tool call or heartbeat.
            // The scheduler lock prevents a claim/enqueue racing this exclusion.
            await db.query(
              `WITH ignored AS (
                SELECT j.job_node_id,j.short_uuid FROM job_search_documents j
                JOIN graph_nodes company ON company.id=$2
                  AND COALESCE(company.properties->>'orgId',company.properties->>'id')=COALESCE(j.organization_id,j.project_id)
              ) UPDATE candidate_agent_requests a SET status='cancelled',finished_at=now()
                WHERE a.user_node_id=$1 AND a.status IN ('queued','running') AND (
                  EXISTS(SELECT 1 FROM candidate_screening_jobs sj JOIN candidate_screening_runs r ON r.id=sj.run_id
                    JOIN ignored ON ignored.job_node_id=sj.job_node_id WHERE sj.request_id=a.id AND r.user_node_id=$1)
                  OR EXISTS(SELECT 1 FROM candidate_agent_sessions s JOIN ignored ON ignored.short_uuid=s.context_seed->>'shortUUID'
                    WHERE s.id=a.session_id AND s.user_node_id=$1))`,
              [owner, employer.id],
            );
            await db.query(
              `UPDATE candidate_screening_jobs sj SET status='unavailable',next_retry_at=NULL,last_error='Company ignored.'
               FROM candidate_screening_runs r,job_search_documents j,graph_nodes company
               WHERE sj.run_id=r.id AND r.user_node_id=$1 AND sj.job_node_id=j.job_node_id AND company.id=$2
                 AND COALESCE(company.properties->>'orgId',company.properties->>'id')=COALESCE(j.organization_id,j.project_id)
                 AND sj.status IN ('pending','running','failed')`,
              [owner, employer.id],
            );
          } else
            await db.query(
              `DELETE FROM graph_relationships WHERE source_id=$1 AND target_id=$2 AND type='BLOCKED_ORG_JOBS'`,
              [owner, employer.id],
            );
        }
        const id = row?.id ?? randomUUID();
        await db.query(
          `INSERT INTO candidate_applications(id,user_node_id,job_node_id,revision,state,short_uuid,job_snapshot,ranking_version) VALUES($1,$2,$3,1,$4,$5,$6,$7)
        ON CONFLICT(user_node_id,short_uuid) DO UPDATE SET state=EXCLUDED.state,short_uuid=EXCLUDED.short_uuid,job_snapshot=EXCLUDED.job_snapshot,ranking_version=EXCLUDED.ranking_version,revision=candidate_applications.revision+1,updated_at=now()`,
          [
            id,
            owner,
            job.id,
            JSON.stringify(state),
            input.shortUUID,
            JSON.stringify(job.payload),
            input.rankingVersion ?? row?.ranking_version ?? "unknown",
          ],
        );
        if (JSON.stringify(state) !== JSON.stringify(before))
          await db.query(
            `INSERT INTO user_activity_events(user_node_id,job_node_id,event_type,event_key,surface,metadata)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_node_id,event_key) DO NOTHING`,
            [
              owner,
              job.id,
              eventType,
              input.requestId,
              input.surface,
              JSON.stringify({
                reason: input.reason,
                action: input.action,
                undoRequestId: input.undoRequestId,
                rankingVersion:
                  input.rankingVersion ?? row?.ranking_version ?? "unknown",
              }),
            ],
          );
        // The bookmark read model remains compatible with Explorer.
        if (state.saved && job.id)
          await db.query(
            `INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties)
        VALUES($1,$2,'BOOKMARKED','','{}') ON CONFLICT DO NOTHING`,
            [owner, job.id],
          );
        else
          await db.query(
            `DELETE FROM graph_relationships WHERE source_id=$1 AND target_id=$2 AND type='BOOKMARKED'`,
            [owner, job.id],
          );
        return {
          action: input.action,
          rankingVersion:
            input.rankingVersion ?? row?.ranking_version ?? "unknown",
          id,
          shortUUID: input.shortUUID,
          revision: input.revision + 1,
          state,
          before,
          requestId: input.requestId,
        };
      },
    );
  }
}
