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
        AND ((sentence.kind=$3 AND sentence.node_id=$4) OR (sentence.kind <> 'user' AND $3 <> 'user'))
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
