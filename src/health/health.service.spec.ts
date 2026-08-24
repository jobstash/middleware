import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { HealthService } from "./health.service";

describe("HealthService readiness", () => {
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === "APP_ENV" ? "test" : fallback,
    ),
  } as unknown as ConfigService;

  it("is ready when PostgreSQL is reachable and has no Redis dependency", async () => {
    const postgres = {
      query: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as PostgresService;

    const health = await new HealthService(config, postgres).ready();

    expect(health.status).toBe("ready");
    expect(health.dependencies).toEqual({
      postgres: expect.objectContaining({ status: "up" }),
    });
    expect(health.dependencies).not.toHaveProperty("redis");
  });

  it("is not ready when PostgreSQL is unreachable", async () => {
    const postgres = {
      query: jest.fn().mockRejectedValue(new Error("database unavailable")),
    } as unknown as PostgresService;

    const health = await new HealthService(config, postgres).ready();

    expect(health.status).toBe("not_ready");
    expect(health.dependencies.postgres.status).toBe("down");
  });
});
