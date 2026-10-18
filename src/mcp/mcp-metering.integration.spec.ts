import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { McpAllowance, McpMeteringService } from "./mcp-metering.service";
const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)(
  "Subscriber MCP usage (isolated PostgreSQL)",
  () => {
    let db: PostgresService, meter: McpMeteringService, plan: McpAllowance;
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        parsed.hostname !== "127.0.0.1" ||
        parsed.pathname !== "/jobstash_mcp_test"
      )
        throw Error("Dedicated local MCP test database required");
      db = new PostgresService({
        url: url!,
        applicationName: "mcp-meter-tests",
        maxConnections: 12,
        statementTimeoutMs: 5000,
      });
      await db.onModuleInit();
      await db.query(
        "CREATE TABLE IF NOT EXISTS graph_nodes(id bigserial PRIMARY KEY,label text,properties jsonb)",
      );
      await db.query(readFileSync("scripts/sql/mcp-access.sql", "utf8"));
      meter = new McpMeteringService(db);
    });
    afterAll(async () => {
      await db?.onModuleDestroy();
    });
    beforeEach(async () => {
      await db.query(
        "TRUNCATE mcp_usage_receipts,mcp_usage_periods,mcp_tokens,mcp_grants,mcp_authorizations,mcp_clients,graph_nodes RESTART IDENTITY CASCADE",
      );
      await db.query(
        `INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`,
      );
      plan = {
        subscriptionId: "verified-subscription",
        periodStart: new Date(Date.now() - 60000).toISOString(),
        periodEnd: new Date(Date.now() + 3600000).toISOString(),
        limit: 2,
        unit: "calls",
      };
    });
    const input = () => ({
      owner: "1",
      requestId: randomUUID(),
      tool: "search_jobs",
      arguments: { query: "engineer" },
      maxRecords: 20,
    });
    const allowance = async () => plan;
    const result = async () => ({
      data: { jobs: [{ id: "one" }] },
      records: 1,
    });
    async function usage() {
      return (await db.query("SELECT used,reserved FROM mcp_usage_periods"))[0];
    }
    it("does not return data or reserve usage without an active subscription", async () => {
      plan.periodEnd = new Date(Date.now() - 1000).toISOString();
      const work = jest.fn(result);
      await expect(meter.execute(input(), allowance, work)).rejects.toThrow(
        "active data subscription",
      );
      expect(work).not.toHaveBeenCalled();
      expect(await usage()).toBeUndefined();
    });
    it("counts successful calls, returns a saved retry after restart and rejects changed retry arguments", async () => {
      const request = input(),
        work = jest.fn(result);
      const first = await meter.execute(request, allowance, work);
      const second = await new McpMeteringService(db).execute(
        request,
        allowance,
        work,
      );
      expect(first).toEqual(second);
      expect(work).toHaveBeenCalledTimes(1);
      expect(await usage()).toEqual({ used: "1", reserved: "0" });
      await expect(
        meter.execute(
          { ...request, arguments: { query: "different" } },
          allowance,
          work,
        ),
      ).rejects.toThrow("different arguments");
    });
    it("cannot exceed the allowance with concurrent requests", async () => {
      const work = jest.fn(async () => {
        await new Promise(r => setTimeout(r, 20));
        return result();
      });
      const completed = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          meter.execute(input(), allowance, work),
        ),
      );
      expect(
        completed.filter(item => item.status === "fulfilled"),
      ).toHaveLength(2);
      expect(work).toHaveBeenCalledTimes(2);
      expect(await usage()).toEqual({ used: "2", reserved: "0" });
    });
    it("does not execute or charge a concurrent duplicate twice", async () => {
      const request = input(),
        work = jest.fn(async () => {
          await new Promise(r => setTimeout(r, 20));
          return result();
        });
      const completed = await Promise.allSettled([
        meter.execute(request, allowance, work),
        meter.execute(request, allowance, work),
      ]);
      expect(
        completed.filter(item => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(work).toHaveBeenCalledTimes(1);
      expect(await usage()).toEqual({ used: "1", reserved: "0" });
    });
    it("releases failed work and lets the same request retry", async () => {
      const request = input();
      await expect(
        meter.execute(request, allowance, async () => {
          throw Error("source unavailable");
        }),
      ).rejects.toThrow("source unavailable");
      expect(await usage()).toEqual({ used: "0", reserved: "0" });
      await meter.execute(request, allowance, result);
      expect(await usage()).toEqual({ used: "1", reserved: "0" });
    });
    it("rejects a late result after its saved claim expired and allows recovery", async () => {
      const request = input();
      await expect(
        meter.execute(request, allowance, async () => {
          await db.query(
            "UPDATE mcp_usage_receipts SET expires_at=now()-interval '1 second' WHERE request_id=$1",
            [request.requestId],
          );
          return result();
        }),
      ).rejects.toThrow("expired");
      expect(await usage()).toEqual({ used: "0", reserved: "0" });
      await meter.execute(request, allowance, result);
      expect(await usage()).toEqual({ used: "1", reserved: "0" });
    });
    it("counts actual returned records and frees the unused reservation", async () => {
      plan.unit = "records";
      plan.limit = 25;
      await meter.execute(input(), allowance, async () => ({
        data: { jobs: [1, 2, 3] },
        records: 3,
      }));
      expect(await usage()).toEqual({ used: "3", reserved: "0" });
    });
    it("rejects a response larger than its reservation without charging", async () => {
      await expect(
        meter.execute(input(), allowance, async () => ({
          data: {},
          records: 21,
        })),
      ).rejects.toThrow("Invalid data response");
      expect(await usage()).toEqual({ used: "0", reserved: "0" });
    });
    it("checks subscription again before returning the response and before replaying saved data", async () => {
      await expect(
        meter.execute(input(), allowance, async () => {
          plan.periodEnd = new Date(Date.now() - 1000).toISOString();
          return result();
        }),
      ).rejects.toThrow("active data subscription");
      expect(await usage()).toEqual({ used: "0", reserved: "0" });
      plan.periodEnd = new Date(Date.now() + 3600000).toISOString();
      const request = input();
      await meter.execute(request, allowance, result);
      plan.periodEnd = new Date(Date.now() - 1000).toISOString();
      await expect(meter.execute(request, allowance, result)).rejects.toThrow(
        "active data subscription",
      );
    });
    it("keeps usage separate between subscribers", async () => {
      await meter.execute(input(), allowance, result);
      await meter.execute({ ...input(), owner: "2" }, allowance, result);
      expect(
        await db.query(
          "SELECT used FROM mcp_usage_periods ORDER BY user_node_id",
        ),
      ).toEqual([{ used: "1" }, { used: "1" }]);
    });
  },
);
