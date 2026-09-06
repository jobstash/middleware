import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { OpenAIEmbeddings } from "@langchain/openai";
import {
  RecommendationEmbeddingRepository,
  RECOMMENDATION_EMBEDDING_MODEL,
} from "src/postgres/recommendation-embedding.repository";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { recommendationSentences } from "./recommendation-sentences";

@Injectable()
export class RecommendationEmbeddingService {
  private readonly logger = new CustomLogger(
    RecommendationEmbeddingService.name,
  );
  private running = false;
  constructor(
    private readonly repository: RecommendationEmbeddingRepository,
    private readonly config: ConfigService,
  ) {}
  @Cron("*/5 * * * *", { name: "recommendation-embeddings" })
  async refresh(): Promise<void> {
    if (this.running || process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1") return;
    this.running = true;
    try {
      await this.repository.withWorkerLock(async () => {
        const model = new OpenAIEmbeddings({
          apiKey: this.config.getOrThrow<string>("OPENAI_API_KEY"),
          model: RECOMMENDATION_EMBEDDING_MODEL,
          dimensions: 3072,
          batchSize: 16,
          maxConcurrency: 2,
          maxRetries: 2,
          timeout: 60_000,
        });
        const inputs = await this.repository.pending(
          this.config.get<number>("RECOMMENDATION_EMBEDDING_BATCH_SIZE", 100),
        );
        let completed = 0;
        for (const input of inputs) {
          try {
            const sentences = recommendationSentences(input.content).filter(
              sentence => sentence.weight >= 0.35,
            );
            const reusable = await this.repository.reusable(
              input,
              sentences.map(s => s.hash),
            );
            const missing = sentences.filter(s => !reusable.has(s.hash));
            if (missing.length) {
              const vectors = await model.embedDocuments(
                missing.map(s => s.text),
              );
              if (vectors.length !== missing.length)
                throw new Error("Incomplete embedding response");
              missing.forEach((sentence, index) =>
                reusable.set(sentence.hash, vectors[index]),
              );
            }
            if (
              await this.repository.store(
                input,
                sentences.map(sentence => ({
                  ...sentence,
                  embedding: reusable.get(sentence.hash)!,
                })),
              )
            )
              completed++;
          } catch (error) {
            await this.repository.fail(input);
            const status = (error as { status?: number })?.status;
            this.logger.warn(
              `Sentence embedding failed: ${input.kind}/${input.nodeId}, status=${status ?? "unknown"}`,
            );
            if (status === 429 || status === 401 || status === 403) break;
          }
        }
        this.logger.log(
          `Sentence embeddings: ${completed}/${inputs.length} documents processed`,
        );
      });
    } catch {
      this.logger.error(
        "Sentence embedding refresh failed; retrying on the next scheduled pass",
      );
    } finally {
      this.running = false;
    }
  }
}
