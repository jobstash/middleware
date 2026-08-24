import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";

type DependencyState = {
  status: "up" | "down";
  responseTimeMs: number;
};

export type ServiceHealth = {
  status: "live" | "ready" | "not_ready";
  service: string;
  environment: string;
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
    const postgres = await this.probe(() => this.postgres.query("SELECT 1"));
    const dependencies = { postgres };
    const isReady = postgres.status === "up";
    return this.response(
      isReady ? "ready" : "not_ready",
      startedAt,
      dependencies,
    );
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
      responseTimeMs: Date.now() - startedAt,
      instanceRole: this.config.get<string>("INSTANCE_ROLE", "api"),
      dependencies,
    };
  }
}
