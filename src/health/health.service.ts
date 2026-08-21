import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PostgresService } from "src/postgres/postgres.service";

type DependencyState = {
  status: "up" | "down";
  responseTimeMs: number;
};

export type ServiceHealth = {
  status: "live" | "ready" | "not_ready";
  service: string;
  environment: string;
  releaseSha: string;
  imageDigest: string;
  buildTime: string;
  responseTimeMs: number;
  instanceRole: string;
  dependencies: Record<string, DependencyState>;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly postgres: PostgresService,
  ) {}

  live(): ServiceHealth {
    return this.response("live", Date.now(), {});
  }

  async ready(): Promise<ServiceHealth> {
    const startedAt = Date.now();
    const [postgres, redis] = await Promise.all([
      this.probe(() => this.postgres.query("SELECT 1")),
      this.probeRedis(),
    ]);
    const dependencies = { postgres, redis };
    const isReady = Object.values(dependencies).every(
      dependency => dependency.status === "up",
    );
    return this.response(isReady ? "ready" : "not_ready", startedAt, dependencies);
  }

  private async probe(work: () => Promise<unknown>): Promise<DependencyState> {
    const startedAt = Date.now();
    try {
      await Promise.race([
        work(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("health probe timed out")), 1_500),
        ),
      ]);
      return { status: "up", responseTimeMs: Date.now() - startedAt };
    } catch {
      return { status: "down", responseTimeMs: Date.now() - startedAt };
    }
  }

  private probeRedis(): Promise<DependencyState> {
    return this.probe(async () => {
      const redis = new Redis({
        host: this.config.getOrThrow<string>("REDIS_HOST"),
        port: this.config.getOrThrow<number>("REDIS_PORT"),
        password: this.config.get<string>("REDIS_PASSWORD"),
        lazyConnect: true,
        connectTimeout: 1_000,
        commandTimeout: 1_000,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        redis.disconnect(false);
      }
    });
  }

  private response(
    status: ServiceHealth["status"],
    startedAt: number,
    dependencies: ServiceHealth["dependencies"],
  ): ServiceHealth {
    return {
      status,
      service: "jobstash-middleware",
      environment: this.config.get<string>(
        "APP_ENV",
        process.env.NODE_ENV ?? "unknown",
      ),
      releaseSha: this.config.get<string>("RELEASE_SHA", "unknown"),
      imageDigest: this.config.get<string>("IMAGE_DIGEST", "unknown"),
      buildTime: this.config.get<string>("BUILD_TIME", "unknown"),
      responseTimeMs: Date.now() - startedAt,
      instanceRole: this.config.get<string>("INSTANCE_ROLE", "api"),
      dependencies,
    };
  }
}
