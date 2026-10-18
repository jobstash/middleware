import { Injectable } from "@nestjs/common";
import { PostgresService } from "./postgres.service";
import type { RecommendationSentence } from "src/auth/profile/recommendation-sentences";
export const RECOMMENDATION_EMBEDDING_MODEL = "text-embedding-3-large";
export const RECOMMENDATION_EMBEDDING_VERSION =
  "text-embedding-3-large:3072:sentences-v1";
export interface EmbeddingInput {
  kind: string;
  nodeId: string;
  content: string;
  hash: string;
}
type EmbeddedSentence = RecommendationSentence & { embedding: number[] };
@Injectable()
export class RecommendationEmbeddingRepository {
  constructor(private readonly postgres: PostgresService) {}
  /** Background vector arithmetic across every open job; no model calls. */
  async refreshCvScores(): Promise<void> {
    const documents = await this.postgres.query<{
      id: string;
      nodeId: string;
      hash: string;
    }>(
      `SELECT d.id,d.embedding_node_id::text AS "nodeId",e.content_hash AS hash FROM candidate_documents d JOIN recommendation_embedding_documents e ON e.kind='cv' AND e.node_id=d.embedding_node_id AND e.status='ready' AND e.version=$1 AND e.content_hash=md5(recommendation_embedding_content('cv',e.node_id))`,
      [RECOMMENDATION_EMBEDDING_VERSION],
    );
    for (const doc of documents) {
      while (true) {
        const jobs = await this.postgres.query<{ id: string }>(
          `SELECT j.job_node_id::text AS id FROM job_search_documents j JOIN recommendation_embedding_documents e ON e.kind='job' AND e.node_id=j.job_node_id AND e.status='ready' AND e.version=$1
          LEFT JOIN candidate_cv_job_scores score ON score.document_id=$2 AND score.job_node_id=j.job_node_id
          WHERE j.online AND NOT j.blocked AND (j.published_timestamp IS NULL OR j.published_timestamp<=extract(epoch FROM now())*1000)
            AND (score.document_id IS NULL OR score.cv_hash<>$3 OR score.job_hash<>e.content_hash) ORDER BY j.job_node_id LIMIT 50`,
          [RECOMMENDATION_EMBEDDING_VERSION, doc.id, doc.hash],
        );
        if (!jobs.length) break;
        await this.postgres.query(
          `WITH job_sentences AS MATERIALIZED (
          SELECT s.* FROM recommendation_sentence_embeddings s WHERE s.kind='job' AND s.node_id=ANY($4::bigint[]) AND s.weight>=0.35
        ), frequency AS MATERIALIZED (
          SELECT repeated.text_hash,count(DISTINCT repeated.node_id) AS documents FROM recommendation_sentence_embeddings repeated
          JOIN (SELECT DISTINCT text_hash FROM job_sentences) wanted USING(text_hash) WHERE repeated.kind='job' GROUP BY repeated.text_hash
        ), pairs AS MATERIALIZED (
          SELECT j.node_id,j.sentence_hash,j.weight,cv.similarity,cv.evidence_weight,frequency.documents,
            row_number() OVER(PARTITION BY j.node_id,cv.sentence_hash ORDER BY cv.similarity*j.weight DESC,j.sentence_hash) AS evidence_rank
          FROM job_sentences j JOIN frequency USING(text_hash)
          LEFT JOIN LATERAL (SELECT s.sentence_hash,s.weight AS evidence_weight,1-(s.embedding<=>j.embedding) AS similarity
            FROM recommendation_sentence_embeddings s WHERE s.kind='cv' AND s.node_id=$2 AND s.weight>=0.35 ORDER BY s.embedding<=>j.embedding LIMIT 1) cv ON true
        ), scores AS (
          SELECT node_id,sum(least(1.0,greatest(0,(similarity-0.65)/0.30))*weight*evidence_weight/sqrt(greatest(documents,1))) AS strength,
          count(*) FILTER(WHERE similarity>=0.8)::integer AS supported FROM pairs WHERE evidence_rank=1 GROUP BY node_id
        ) INSERT INTO candidate_cv_job_scores(document_id,job_node_id,cv_hash,job_hash,score,supported_sentences)
          SELECT $1,e.node_id,$3,e.content_hash,18.0*COALESCE(s.strength,0)/greatest(e.weight_sum,3),COALESCE(s.supported,0)
          FROM recommendation_embedding_documents e LEFT JOIN scores s ON s.node_id=e.node_id WHERE e.kind='job' AND e.node_id=ANY($4::bigint[])
          ON CONFLICT(document_id,job_node_id) DO UPDATE SET cv_hash=EXCLUDED.cv_hash,job_hash=EXCLUDED.job_hash,score=EXCLUDED.score,supported_sentences=EXCLUDED.supported_sentences,updated_at=now()`,
          [doc.id, doc.nodeId, doc.hash, jobs.map(j => j.id)],
        );
      }
    }
  }
  async refreshArchetypes(): Promise<void> {
    await this.postgres.query(
      "SELECT refresh_candidate_archetype_requirements()",
    );
  }
  async pending(limit: number): Promise<EmbeddingInput[]> {
    return this.postgres.query<EmbeddingInput & Record<string, unknown>>(
      `
      SELECT input.kind,input.node_id::text AS "nodeId",input.content,md5(input.content) AS hash
      FROM recommendation_embedding_inputs input LEFT JOIN recommendation_embedding_documents cached USING (kind,node_id)
      WHERE input.content IS NOT NULL
        AND (cached.status IS DISTINCT FROM 'failed' OR cached.retry_after <= now() OR cached.content_hash <> md5(input.content))
        AND (cached.node_id IS NULL OR cached.content_hash <> md5(input.content)
        OR cached.version <> $1 OR (cached.status='failed' AND cached.retry_after <= now()))
      ORDER BY cached.updated_at NULLS FIRST,input.kind,input.node_id LIMIT $2
    `,
      [RECOMMENDATION_EMBEDDING_VERSION, limit],
    );
  }
  async reusable(
    input: EmbeddingInput,
    hashes: string[],
  ): Promise<Map<string, number[]>> {
    const rows = await this.postgres.query<{
      hash: string;
      embedding: number[];
    }>(
      `
      SELECT DISTINCT ON (sentence.sentence_hash) sentence.sentence_hash AS hash,sentence.embedding::text::jsonb AS embedding
      FROM recommendation_sentence_embeddings sentence JOIN recommendation_embedding_documents doc USING (kind,node_id)
      WHERE doc.version=$1 AND sentence.sentence_hash=ANY($2::text[])
        AND ((sentence.kind=$3 AND sentence.node_id=$4) OR (sentence.kind IN ('job','employer') AND $3 IN ('job','employer')))
      ORDER BY sentence.sentence_hash,sentence.node_id
    `,
      [RECOMMENDATION_EMBEDDING_VERSION, hashes, input.kind, input.nodeId],
    );
    return new Map(rows.map(row => [row.hash, row.embedding]));
  }
  async store(
    input: EmbeddingInput,
    sentences: EmbeddedSentence[],
  ): Promise<boolean> {
    if (
      sentences.some(
        s =>
          s.embedding?.length !== 3072 ||
          s.embedding.some(x => !Number.isFinite(x)) ||
          !s.embedding.some(x => x !== 0),
      )
    )
      throw new Error("Invalid sentence embedding");
    return this.postgres.transaction(async manager => {
      await manager.query("SELECT id FROM graph_nodes WHERE id=$1 FOR UPDATE", [
        input.nodeId,
      ]);
      const [current] = await manager.query(
        "SELECT md5(recommendation_embedding_content($1,$2))=$3 AS fresh",
        [input.kind, input.nodeId, input.hash],
      );
      if (!current?.fresh) return false;
      await manager.query(
        `INSERT INTO recommendation_embedding_documents(kind,node_id,version,content_hash,status,weight_sum)
        VALUES ($1,$2,$3,$4,'ready',$5) ON CONFLICT (kind,node_id) DO UPDATE SET version=EXCLUDED.version,
        content_hash=EXCLUDED.content_hash,status='ready',weight_sum=EXCLUDED.weight_sum,retry_after=NULL,updated_at=now()`,
        [
          input.kind,
          input.nodeId,
          RECOMMENDATION_EMBEDDING_VERSION,
          input.hash,
          sentences.reduce(
            (sum, s) => sum + (s.weight >= 0.35 ? s.weight : 0),
            0,
          ),
        ],
      );
      await manager.query(
        "DELETE FROM recommendation_sentence_embeddings WHERE kind=$1 AND node_id=$2 AND NOT (sentence_hash=ANY($3::text[]))",
        [input.kind, input.nodeId, sentences.map(sentence => sentence.hash)],
      );
      await manager.query(
        `INSERT INTO recommendation_sentence_embeddings(kind,node_id,sentence_hash,text_hash,source,sentence,weight,embedding)
        SELECT $1,$2,row.hash,row."textHash",row.source,row.text,row.weight,row.embedding::halfvec(3072)
        FROM jsonb_to_recordset($3::jsonb) AS row(hash text,"textHash" text,source text,text text,weight real,embedding text)
        ON CONFLICT (kind,node_id,sentence_hash) DO UPDATE SET
          source=EXCLUDED.source,weight=EXCLUDED.weight,embedding=EXCLUDED.embedding
        WHERE (recommendation_sentence_embeddings.source,recommendation_sentence_embeddings.weight,recommendation_sentence_embeddings.embedding)
          IS DISTINCT FROM (EXCLUDED.source,EXCLUDED.weight,EXCLUDED.embedding)`,
        [
          input.kind,
          input.nodeId,
          JSON.stringify(
            sentences.map(s => ({
              ...s,
              embedding: JSON.stringify(s.embedding),
            })),
          ),
        ],
      );
      return true;
    });
  }
  async fail(input: EmbeddingInput): Promise<void> {
    await this.postgres.query(
      `INSERT INTO recommendation_embedding_documents(kind,node_id,version,content_hash,status,retry_after)
      SELECT $1,$2,$3,$4,'failed',now()+interval '15 minutes' WHERE md5(recommendation_embedding_content($1,$2))=$4
      ON CONFLICT (kind,node_id) DO UPDATE SET status='failed',content_hash=EXCLUDED.content_hash,
        retry_after=EXCLUDED.retry_after,updated_at=now()`,
      [input.kind, input.nodeId, RECOMMENDATION_EMBEDDING_VERSION, input.hash],
    );
  }
  async withWorkerLock(work: () => Promise<void>): Promise<void> {
    const runner = this.postgres.getDataSource().createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      [{ locked }] = await runner.query(
        "SELECT pg_try_advisory_lock(71268,1) AS locked",
      );
      if (locked) await work();
    } finally {
      try {
        if (locked) await runner.query("SELECT pg_advisory_unlock(71268,1)");
      } finally {
        await runner.release();
      }
    }
  }
}
