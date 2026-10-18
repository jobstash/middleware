import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { IntroductionListInput, IntroductionSaveInput } from "./candidate-introductions.dto";
import { CandidateNetworkRecommendation, CandidateNetworkRecommendations, NetworkService } from "./network.service";

type IntroductionRecord = {
  id: string;
  organizationId: string;
  applicationId: string | null;
  suggestionId: string;
  evidenceSnapshot: CandidateNetworkRecommendation;
  text: string;
  revision: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export interface CandidateIntroduction extends Omit<IntroductionRecord, "evidenceSnapshot"> {
  evidenceSnapshot: CandidateNetworkRecommendation | null;
  evidenceStatus: "current" | "unavailable";
  evidenceQualifier: string;
}

const columns = `id,organization_id AS "organizationId",application_id AS "applicationId",
  suggestion_id AS "suggestionId",evidence_snapshot AS "evidenceSnapshot",text,revision,
  created_at AS "createdAt",updated_at AS "updatedAt"`;
const qualifier = "Contribution and co-worker evidence is inferred. Friendship, employment and willingness to help require confirmation. You decide whether to send this message.";

@Injectable()
export class CandidateIntroductionService {
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly network: NetworkService,
  ) {}

  async save(wallet: string, input: IntroductionSaveInput): Promise<CandidateIntroduction> {
    const actor = this.career.currentCandidateInvocation();
    if (actor?.kind === "oauth" || (!input.id && actor?.kind !== "worker"))
      throw new ForbiddenException("Generate introductions through the career agent; edit saved drafts in your account");
    if (!input.text?.trim() || input.text.length > 8000)
      throw new BadRequestException("Introduction text must contain between 1 and 8000 characters");

    // Network leases reference the owner in a separate transaction; acquire them
    // before mutate takes the canonical owner lock.
    const recommendations = await this.network.recommendations(wallet, input.organizationId);
    const saved = await this.career.mutate<IntroductionRecord>(wallet, "introduction", input, async (db, owner) => {
      if (input.id) {
        const [current] = await db.query(
          "SELECT revision FROM candidate_introduction_drafts WHERE id=$1 AND user_node_id=$2 FOR UPDATE",
          [input.id, owner],
        );
        if (!current) throw new NotFoundException("Introduction draft not found");
        if (current.revision !== input.revision)
          throw new ConflictException("Introduction draft changed; reload before editing");
      } else if (input.revision !== 0) {
        throw new ConflictException("A new introduction draft must start at revision 0");
      }
      if (input.applicationId) {
        const [application] = await db.query(
          `SELECT j.organization_id AS "organizationId" FROM candidate_applications a
           LEFT JOIN job_search_documents j ON j.job_node_id=a.job_node_id
           WHERE a.id=$1 AND a.user_node_id=$2`,
          [input.applicationId, owner],
        );
        if (!application) throw new NotFoundException("Application not found");
        if (!application.organizationId || application.organizationId !== input.organizationId)
          throw new BadRequestException("Application does not belong to this organization");
      }
      const suggestion = this.suggestion(recommendations, input.organizationId, input.suggestionId);
      if (!suggestion) throw new ConflictException("Introduction suggestion is no longer available; refresh recommendations");
      await this.network.assertRecommendationVisible(db, owner, input.organizationId, input.suggestionId);
      const values = [input.id ?? input.requestId, owner, input.organizationId, input.applicationId ?? null,
        input.suggestionId, JSON.stringify(suggestion), input.text.trim(), input.id ? input.revision + 1 : 1];
      const [record] = await db.query(input.id
        ? `WITH changed AS (UPDATE candidate_introduction_drafts SET organization_id=$3,application_id=$4,suggestion_id=$5,
           evidence_snapshot=$6,text=$7,revision=$8,updated_at=now() WHERE id=$1 AND user_node_id=$2 RETURNING ${columns})
           SELECT * FROM changed`
        : `INSERT INTO candidate_introduction_drafts(id,user_node_id,organization_id,application_id,suggestion_id,evidence_snapshot,text,revision)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`, values);
      return record;
    }, { requireAdvanced: true });
    // Receipts retain the original result, but must never bypass current suppression.
    return this.project(saved, await this.currentRecommendations(wallet, saved.organizationId));
  }

  async read(wallet: string, id: string): Promise<CandidateIntroduction> {
    const [record] = await this.db.query<IntroductionRecord>(
      `SELECT ${columns} FROM candidate_introduction_drafts WHERE id=$1 AND user_node_id=$2`,
      [id, await this.career.owner(wallet)],
    );
    if (!record) throw new NotFoundException("Introduction draft not found");
    return this.project(record, await this.currentRecommendations(wallet, record.organizationId));
  }

  async list(wallet: string, paging: IntroductionListInput = {}) {
    const offset = paging.offset ?? 0, limit = paging.limit ?? 20;
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException("Invalid introduction page");
    const records = await this.db.query<IntroductionRecord>(
      `SELECT ${columns} FROM candidate_introduction_drafts WHERE user_node_id=$1 ORDER BY updated_at DESC,id DESC LIMIT $2 OFFSET $3`,
      [await this.career.owner(wallet), limit + 1, offset],
    );
    const drafts: CandidateIntroduction[] = [];
    const targets = new Map<string, CandidateNetworkRecommendations | null>();
    for (const record of records.slice(0, limit)) {
      if (!targets.has(record.organizationId))
        targets.set(record.organizationId, await this.currentRecommendations(wallet, record.organizationId));
      drafts.push(this.project(record, targets.get(record.organizationId)!));
    }
    return { drafts, offset, limit, truncated: records.length > limit };
  }

  private async currentRecommendations(wallet: string, organizationId: string): Promise<CandidateNetworkRecommendations | null> {
    try {
      return await this.network.recommendations(wallet, organizationId);
    } catch {
      // Recovery does not require membership or a working warehouse. Saved text remains owned;
      // absence of a live authorization/suppression check must never disclose its old contact.
      return null;
    }
  }

  private suggestion(result: CandidateNetworkRecommendations | null, organizationId: string, id: string): CandidateNetworkRecommendation | null {
    if (!result?.verified || result.unavailable || result.available !== true) return null;
    const suggestion = result.recommendations.find(item => item.id === id && item.organizationId === organizationId);
    if (!suggestion) return null;
    return {
      id: suggestion.id,
      organizationId: suggestion.organizationId,
      hopCount: suggestion.hopCount,
      firstContact: { displayName: suggestion.firstContact.displayName, publicProfileUrl: suggestion.firstContact.publicProfileUrl },
      evidenceSummary: suggestion.evidenceSummary,
      pathSummary: suggestion.pathSummary,
    };
  }

  private project(record: IntroductionRecord, recommendations: CandidateNetworkRecommendations | null): CandidateIntroduction {
    const evidence = this.suggestion(recommendations, record.organizationId, record.suggestionId);
    return {
      id: record.id,
      organizationId: record.organizationId,
      applicationId: record.applicationId,
      suggestionId: record.suggestionId,
      text: record.text,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      evidenceSnapshot: evidence,
      evidenceStatus: evidence ? "current" : "unavailable",
      evidenceQualifier: evidence ? qualifier : `This suggestion cannot currently be verified. Its contact and route are hidden; your saved draft is unchanged. ${qualifier}`,
    };
  }
}
