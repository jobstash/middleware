import { Client } from "pg";
import { readFileSync } from "node:fs";
import { ExecutionContext, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { PostgresService } from "src/postgres/postgres.service";
import {
  VisitorIpBlocksService,
  VisitorIpBlocksController,
  BlockIpInput,
  BlockIpQuery,
  BlockProxyGuard,
} from "./visitor-ip-blocks";
describe("IP block access", () => {
  it.each(["list", "set"] as const)(
    "requires superadmin for %s",
    async method => {
      const getSession = jest.fn();
      const guard = new PBACGuard(new Reflector(), { getSession } as never);
      const context = {
        switchToHttp: () => ({
          getRequest: (): Record<string, unknown> => ({}),
          getResponse: (): Record<string, unknown> => ({}),
        }),
        getHandler: () => VisitorIpBlocksController.prototype[method],
        getClass: () => VisitorIpBlocksController,
      } as unknown as ExecutionContext;
      for (const session of [
        null,
        { address: "member", permissions: [CheckWalletPermissions.USER] },
      ]) {
        getSession.mockResolvedValue(session);
        await expect(guard.canActivate(context)).rejects.toThrow();
      }
      getSession.mockResolvedValue({
        address: "admin",
        permissions: [CheckWalletPermissions.SUPER_ADMIN],
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
  it("protects proxy list and acknowledgements with a separate key", () => {
    process.env.VISITOR_BLOCKLIST_SECRET =
      "test-only-blocklist-key-at-least-32-chars";
    const headers: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getRequest: (): Record<string, unknown> => ({ headers }),
      }),
    } as unknown as ExecutionContext;
    const guard = new BlockProxyGuard();
    expect(() => guard.canActivate(context)).toThrow();
    headers["x-blocklist-key"] = process.env.VISITOR_BLOCKLIST_SECRET;
    expect(guard.canActivate(context)).toBe(true);
    headers["x-blocklist-key"] = "x".repeat(headers["x-blocklist-key"].length);
    expect(() => guard.canActivate(context)).toThrow();
    delete process.env.VISITOR_BLOCKLIST_SECRET;
  });
  it("accepts IPs only, not hostnames, ranges or injected rules", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const ip of [
      "example.com",
      "fe80::1%eth0",
      "1.2.3.4/24",
      "1.2.3.4`) || Host(`anything",
    ])
      await expect(
        pipe.transform(
          { ip, blocked: true },
          { type: "body", metatype: BlockIpInput },
        ),
      ).rejects.toThrow();
    for (const ip of ["1.2.3.4", "2001:db8::1"])
      await expect(
        pipe.transform(
          { ip, blocked: true },
          { type: "body", metatype: BlockIpInput },
        ),
      ).resolves.toMatchObject({ ip });
  });
});
const url = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
(url ? describe : describe.skip)("saved IP blocks", () => {
  let db: Client;
  let service: VisitorIpBlocksService;
  const schema = `blocks_test_${process.pid}`;
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
      throw new Error("Local database only");
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query(
      `CREATE SCHEMA ${schema};SET search_path TO ${schema},public`,
    );
    await db.query(readFileSync("scripts/sql/visitor-ip-blocks.sql", "utf8"));
    service = new VisitorIpBlocksService({
      query: async (sql: string, args: unknown[]) =>
        (await db.query(sql, args)).rows,
    } as PostgresService);
    process.env.VISITOR_BLOCKLIST_SECRET =
      "test-only-blocklist-key-at-least-32-chars";
  });
  afterAll(async () => {
    delete process.env.VISITOR_BLOCKLIST_SECRET;
    if (db) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  });
  it("keeps bans until unbanned and records each actual change once", async () => {
    await service.set({ ip: "1.2.3.4", blocked: true }, "admin");
    await service.set({ ip: "1.2.3.4", blocked: true }, "admin");
    let state = await service.snapshot();
    expect(state.ips).toEqual(["1.2.3.4"]);
    expect(state.applied).toBe(false);
    await service.ack(state.revision);
    expect((await service.snapshot()).applied).toBe(true);
    await service.set({ ip: "2001:db8:0:0:0:0:0:1", blocked: true }, "admin");
    state = await service.snapshot();
    expect(state.ips).toContain("2001:db8::1");
    expect(state.applied).toBe(false);
    await service.ack(state.revision);
    await service.set({ ip: "1.2.3.4", blocked: false }, "another-admin");
    await service.ack(state.revision);
    expect((await service.snapshot()).applied).toBe(false);
    expect((await service.snapshot()).ips).toEqual(["2001:db8::1"]);
    const history = await db.query(
      "SELECT blocked,changed_by FROM visitor_ip_block_history ORDER BY id",
    );
    expect(history.rows).toHaveLength(3);
    expect(history.rows[2]).toMatchObject({
      blocked: false,
      changed_by: "another-admin",
    });
  });
  it("sorts all blocks before pagination and detects stale proxy reports", async () => {
    await service.set({ ip: "8.8.8.8", blocked: true }, "admin");
    const report = (await service.list(
      Object.assign(new BlockIpQuery(), {
        sort: "ip",
        direction: "asc",
        limit: 1,
        offset: 1,
      }),
    )) as { rows: { ip: string }[]; total: number };
    expect(report.total).toBe(2);
    expect(report.rows[0].ip).toBe("2001:db8::1");
    await service.ack((await service.snapshot()).revision);
    await db.query(
      "UPDATE visitor_ip_block_proxy_state SET checked_at=now()-interval '1 minute'",
    );
    expect((await service.snapshot()).applied).toBe(false);
  });
});
