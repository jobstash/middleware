import { RecommendationCache } from "src/postgres/recommendation-cache";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { CareerRepository } from "./career.repository";
import { applicationRequirements } from "./application-requirements";
import { RECOMMENDATION_EMBEDDING_VERSION } from "src/postgres/recommendation-embedding.repository";

export const CV_MATCH_COLUMNS = [
  "Technical skills",
  "Delivery",
  "Leadership",
  "Domain",
  "Experience",
  "Education",
  "Role scope",
];
export function requirementCategory(text: string): string {
  if (/degree|bachelor|master|phd|education|certification/i.test(text))
    return "Education";
  if (
    /leadership|mentor|manage[rs]?|managing|lead a|lead the|lead engineering|stakeholder/i.test(
      text,
    )
  )
    return "Leadership";
  if (/years?|track record|previous|prior |proven/i.test(text))
    return "Experience";
  if (/blockchain|web3|crypto|defi|finance|trading|protocol|token/i.test(text))
    return "Domain";
  if (
    /deliver|collaborat|communicat|customer|product|design|planning/i.test(text)
  )
    return "Delivery";
  if (
    /technical|engineering|typescript|javascript|python|rust|solidity|sql|node\.js|react|aws|kubernetes|terraform|api|backend|frontend|electrical|equipment|blueprint|code|programming|system|database|software|testing|tooling/i.test(
      text,
    )
  )
    return "Technical skills";
  return "Role scope";
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
interface EvidenceRow extends Record<string, unknown> {
  shortUUID: string;
  original: string;
  pairs: {
    requirement: string;
    excerpt: string | null;
    similarity: number | null;
  }[];
}
@Injectable()
export class CvMatchService {
  private readonly resultCache = new RecommendationCache<
    Awaited<ReturnType<ProfileService["getRecommendedJobs"]>>
  >(16 * 1024 * 1024, 15000);
  private readonly catalogueCache = new RecommendationCache<unknown>(
    1024 * 1024,
    2000,
  );
  private readonly evidenceCache = new RecommendationCache<EvidenceRow[]>(
    16 * 1024 * 1024,
    15000,
  );
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly profile: ProfileService,
  ) {}
  async documents(wallet: string) {
    const owner = await this.career.owner(wallet);
    return this.db.query(
      `WITH catalogue AS MATERIALIZED (SELECT j.job_node_id,e.content_hash FROM job_search_documents j LEFT JOIN recommendation_embedding_documents e ON e.kind='job' AND e.node_id=j.job_node_id AND e.status='ready' AND e.version=$2 WHERE j.online AND NOT j.blocked AND (j.published_timestamp IS NULL OR j.published_timestamp<=extract(epoch FROM now())*1000))
      SELECT d.id,d.filename,e.content_hash AS "sourceVersion",d.storage_kind AS "storageKind",d.created_at AS "createdAt",(SELECT count(*)::int FROM catalogue) AS "catalogueJobs",
      (SELECT count(*)::int FROM candidate_cv_job_scores score JOIN catalogue c ON c.job_node_id=score.job_node_id AND c.content_hash=score.job_hash WHERE score.document_id=d.id AND score.cv_hash=e.content_hash) AS "scoredJobs",
      CASE WHEN nullif(trim(d.source_text),'') IS NULL THEN 'unavailable'
      WHEN e.status='ready' AND e.version=$2 AND e.content_hash=md5(recommendation_embedding_content('cv',d.embedding_node_id)) AND NOT EXISTS(SELECT 1 FROM catalogue c WHERE c.content_hash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM candidate_cv_job_scores score WHERE score.document_id=d.id AND score.job_node_id=c.job_node_id AND score.cv_hash=e.content_hash AND score.job_hash=c.content_hash)) THEN 'ready'
      WHEN e.status='failed' THEN 'failed' ELSE 'processing' END AS status
      FROM candidate_documents d LEFT JOIN recommendation_embedding_documents e ON e.kind='cv' AND e.node_id=d.embedding_node_id
      WHERE d.user_node_id=$1 ORDER BY d.created_at DESC,d.id`,
      [owner, RECOMMENDATION_EMBEDDING_VERSION],
    );
  }
  async matches(
    wallet: string,
    documentId: string,
    page: number,
    limit: number,
    focusJob?: string,
  ) {
    const documents = await this.documents(wallet);
    const document = documents.find(d => d.id === documentId);
    if (!document) throw new NotFoundException("CV not found");
    const base = {
      document,
      columns: CV_MATCH_COLUMNS,
      rankingVersion: "cv-original-ad-sentences-v1",
    };
    if (document.status !== "ready")
      return { ...base, jobs: [], total: 0, hasMore: false, page };
    // Shared eligibility, exclusions, allocation and pagination; the selected CV is
    // the sole relevance evidence. Neither this read nor a swipe invokes inference.
    const [state] = await this.db.query<{
      fingerprint: unknown;
      advanced: boolean;
    }>(
      `SELECT
      EXISTS(SELECT 1 FROM candidate_subscriptions sub WHERE sub.user_node_id=u.id AND sub.status='active' AND sub.paid_until>now()) AS advanced,
      jsonb_build_array(
        (SELECT jsonb_agg(jsonb_build_array(a.id,a.revision) ORDER BY a.id) FROM candidate_applications a WHERE a.user_node_id=u.id AND (a.state->>'passed'='true' OR a.state->>'status' IN ('applied','interview','offer','rejected','withdrawn'))),
        (SELECT jsonb_agg(jsonb_build_array(e.id,e.metadata->>'undone') ORDER BY e.id) FROM user_activity_events e WHERE e.user_node_id=u.id AND e.event_type IN ('job_apply','job_dismiss')),
        (SELECT jsonb_agg(r.target_id ORDER BY r.target_id) FROM graph_relationships r WHERE r.source_id=u.id AND r.type='BLOCKED_ORG_JOBS')
      ) AS fingerprint FROM graph_nodes u WHERE u.label='User' AND lower(u.properties->>'wallet')=lower($1)`,
      [wallet],
    );
    const catalogue = await this.catalogueCache.get("catalogue", async () =>
      this.db.query(
        `SELECT max(updated_at) AS updated,count(*) AS count FROM job_search_documents UNION ALL SELECT max(updated_at),count(*) FROM graph_nodes WHERE label IN ('Jobpost','Organization','Project','ProfileInfo')`,
      ),
    );
    const cacheKey = JSON.stringify([
      wallet.toLowerCase(),
      documentId,
      document.sourceVersion,
      document.scoredJobs,
      document.catalogueJobs,
      page,
      limit,
      focusJob,
      state,
      catalogue,
    ]);
    const loadResults = async () => {
      const result = await this.profile.getRecommendedJobs(
        wallet,
        limit,
        "web",
        page,
        undefined,
        { documentId },
        !!focusJob,
      );
      if (focusJob)
        return {
          ...result,
          jobs: result.jobs.filter(r => r.job.shortUUID === focusJob),
        };
      return result;
    };
    // Free allocations are checked on every read, including across the UTC day boundary.
    const cached = state?.advanced
      ? await this.resultCache.get(cacheKey, loadResults)
      : await loadResults();
    // Live publication/company eligibility is checked even for a cached page.
    const eligible = cached.jobs.length
      ? await this.db.query<{ id: string }>(
          `SELECT j.short_uuid AS id FROM job_search_documents j
      LEFT JOIN organization_search_documents o ON o.organization_id=j.organization_id LEFT JOIN project_search_documents p ON p.project_id=j.project_id
      WHERE j.short_uuid=ANY($1::text[]) AND j.online AND NOT j.blocked AND j.published_timestamp BETWEEN extract(epoch FROM now()-interval '21 days')*1000 AND extract(epoch FROM now())*1000
        AND lower(COALESCE(o.payload#>>'{profileStatus,name}',o.payload->>'profileStatus',p.payload#>>'{status,name}',p.payload->>'status','')) NOT IN ('dead','inactive','closed','shutdown','shut down','discontinued','defunct','support ended')
        AND num_nonnulls(j.organization_id,j.project_id)=1 AND (o.payload IS NOT NULL OR p.payload IS NOT NULL)
        AND NOT EXISTS(SELECT 1 FROM graph_relationships e JOIN graph_nodes status ON status.id=e.target_id
          WHERE e.source_id=COALESCE(o.organization_node_id,p.project_node_id) AND e.type IN ('HAS_STATUS','HAS_PROFILE_STATUS')
          AND lower(status.properties->>'name') IN ('dead','inactive','closed','shutdown','shut down','discontinued','defunct','support ended'))
        AND NOT EXISTS(SELECT 1 FROM graph_relationships membership
          JOIN graph_relationships info_edge ON info_edge.source_id=membership.source_id AND info_edge.type='HAS_PROFILE_INFO'
          JOIN graph_nodes info ON info.id=info_edge.target_id AND info.label='ProfileInfo'
          WHERE membership.target_id=COALESCE(o.organization_node_id,p.project_node_id) AND membership.type IN ('PROFILE_HAS_ORGANIZATION','PROFILE_HAS_PROJECT')
          AND lower(info.properties->>'profileStatus') IN ('inactive','closed'))`,
          [cached.jobs.map(r => r.job.shortUUID)],
        )
      : [];
    const allowed = new Set(eligible.map(r => r.id));
    const result = {
      ...cached,
      jobs: cached.jobs.filter(r => allowed.has(r.job.shortUUID)),
    };
    const rows = result.jobs.length
      ? await this.evidenceCache.get(
          JSON.stringify([
            documentId,
            document.sourceVersion,
            catalogue,
            result.jobs.map(r => r.job.shortUUID),
          ]),
          () =>
            this.db.query<EvidenceRow>(
              `SELECT job.short_uuid AS "shortUUID",original.properties->>'content' AS original,
      COALESCE(pairs.items,'[]') AS pairs
      FROM job_search_documents job
      JOIN LATERAL (SELECT n.properties FROM graph_relationships r JOIN graph_nodes n ON n.id=r.source_id AND n.label='Jobpost'
        WHERE r.target_id=job.job_node_id AND r.type='HAS_STRUCTURED_JOBPOST' ORDER BY n.id LIMIT 1) original ON true
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('requirement',s.sentence,'excerpt',matched.sentence,'similarity',matched.similarity)) AS items
        FROM recommendation_sentence_embeddings s
        JOIN recommendation_embedding_documents jobdoc ON jobdoc.kind=s.kind AND jobdoc.node_id=s.node_id
          AND jobdoc.status='ready' AND jobdoc.version=$3 AND jobdoc.content_hash=md5(recommendation_embedding_content('job',jobdoc.node_id))
        LEFT JOIN LATERAL (SELECT cv.sentence,1-(cv.embedding <=> s.embedding) AS similarity
          FROM candidate_documents d JOIN recommendation_sentence_embeddings cv ON cv.kind='cv' AND cv.node_id=d.embedding_node_id
          WHERE d.id=$1 AND cv.weight>=0.35 ORDER BY cv.embedding <=> s.embedding LIMIT 1) matched ON true
        WHERE s.kind='job' AND s.node_id=job.job_node_id AND s.weight>=0.35) pairs ON true
      WHERE job.short_uuid=ANY($2::text[])`,
              [
                documentId,
                result.jobs.map(r => r.job.shortUUID),
                RECOMMENDATION_EMBEDDING_VERSION,
              ],
            ),
        )
      : [];
    return {
      ...result,
      ...base,
      jobs: result.jobs.map(({ job }) => {
        const row = rows.find(r => r.shortUUID === job.shortUUID);
        const requirements = applicationRequirements({
          description: row?.original ?? "",
        }).map(text => {
          const key = normalize(text);
          const pair = row?.pairs
            .filter(p => {
              const candidate = normalize(p.requirement);
              return (
                candidate === key ||
                (key.length > 25 && candidate.includes(key)) ||
                (candidate.length > 25 && key.includes(candidate))
              );
            })
            .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))[0];
          const state =
            pair?.similarity == null
              ? "unknown"
              : pair.similarity >= 0.8
                ? "related"
                : pair.similarity >= 0.65
                  ? "partial"
                  : "gap";
          return {
            text,
            category: requirementCategory(text),
            state,
            excerpt:
              state === "related" || state === "partial" ? pair?.excerpt : null,
          };
        });
        return { job, requirements };
      }),
    };
  }
}
