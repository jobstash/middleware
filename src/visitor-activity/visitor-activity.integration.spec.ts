import { Client } from "pg";
import { readFileSync } from "node:fs";
import { VisitorActivityService } from "./visitor-activity.service";
import { VisitorQuery, VisitorDetailQuery } from "./visitor-activity.dto";
import { PostgresService } from "src/postgres/postgres.service";
const url = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("visitor reporting SQL", () => {
  let db: Client;
  let service: VisitorActivityService;
  const schema = `visitor_test_${process.pid}`;
  const visitor = "11111111-1111-4111-8111-111111111111";
  const another = "22222222-2222-4222-8222-222222222222";
  beforeAll(async () => {
    if (!["127.0.0.1", "localhost"].includes(new URL(url!).hostname))
      throw new Error("Local test database only");
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema},public;
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY,label text,properties jsonb);
      CREATE TABLE user_activity_events(user_node_id bigint,job_node_id bigint,event_type text,occurred_at timestamptz);
      INSERT INTO graph_nodes VALUES(1,'User','{"wallet":"test-wallet","name":"Test account"}'),(10,'StructuredJobpost','{"title":"Engineer","shortUUID":"job-1"}');
      INSERT INTO user_activity_events VALUES(1,10,'job_view',now()),(1,10,'job_apply',now()),(1,10,'job_view',now()-interval '40 days');`);
    await db.query(readFileSync("scripts/sql/visitor-activity.sql", "utf8"));
    service = new VisitorActivityService({
      query: async (sql: string, args: unknown[]) =>
        (await db.query(sql, args)).rows,
    } as PostgresService);
  });
  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  });
  it("preserves anonymous and signed-in activity and reuses existing job metrics", async () => {
    await service.record(
      { visitorId: visitor, kind: "request", path: "/jobs", country: "SG" },
      null,
    );
    await service.record(
      { visitorId: visitor, kind: "request", path: "/jobs", country: "SG" },
      null,
    );
    await service.record(
      {
        visitorId: visitor,
        kind: "job_view",
        path: "/jobs/job-1",
        country: "SG",
      },
      null,
    );
    await service.record(
      {
        visitorId: visitor,
        kind: "presence",
        path: "/jobs/job-1",
        country: "SG",
      },
      "TEST-WALLET",
    );
    const data = (await service.list(new VisitorQuery())) as {
      total: number;
      rows: Record<string, unknown>[];
    };
    expect(data.total).toBe(1);
    expect(data.rows[0]).toMatchObject({
      signedIn: true,
      hasSignedIn: true,
      requests: 2,
      views: 1,
      applies: 1,
      anonymousViews: 1,
      country: "SG",
      active: true,
    });
    const detail = (await service.detail(visitor, 7)) as {
      visits: Record<string, unknown>[];
      accountEvents: unknown[];
    };
    expect(detail.visits.some(v => v.signedIn === false)).toBe(true);
    expect(detail.accountEvents).toHaveLength(2);
  });
  it("filters and sorts before pagination and distinguishes logout from ever signed in", async () => {
    await service.record(
      { visitorId: another, kind: "request", path: "/", country: "LT" },
      null,
    );
    await service.record(
      { visitorId: visitor, kind: "request", path: "/logout", country: "SG" },
      null,
    );
    const query = Object.assign(new VisitorQuery(), {
      sort: "requests",
      limit: 1,
    });
    const data = (await service.list(query)) as {
      total: number;
      rows: Record<string, unknown>[];
    };
    expect(data.total).toBe(2);
    expect(data.rows[0]).toMatchObject({
      id: visitor,
      signedIn: false,
      hasSignedIn: true,
    });
    const filtered = (await service.list(
      Object.assign(query, { country: "LT" }),
    )) as { total: number; rows: Record<string, unknown>[] };
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].id).toBe(another);
  });
  it("keeps old visits readable through all-history reports", async () => {
    await db.query(
      "UPDATE visitor_activity SET last_seen=now()-interval '31 days' WHERE visitor_id=$1",
      [another],
    );
    const recent = (await service.list(
      Object.assign(new VisitorQuery(), { days: 30 }),
    )) as { rows: { id: string }[] };
    expect(recent.rows.some(row => row.id === another)).toBe(false);
    const history = (await service.list(
      Object.assign(new VisitorQuery(), { days: 0 }),
    )) as { rows: { id: string }[] };
    expect(history.rows.some(row => row.id === another)).toBe(true);
    const detail = (await service.detail(another, 0)) as { visits: unknown[] };
    expect(detail.visits).toHaveLength(1);
    const accountHistory = (await service.detail(visitor, 0)) as {
      accountEvents: unknown[];
    };
    expect(accountHistory.accountEvents).toHaveLength(3);
    expect(
      (
        await db.query(
          "SELECT count(*) FROM visitor_activity WHERE visitor_id=$1",
          [another],
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (await db.query("SELECT count(*) FROM user_activity_events")).rows[0]
        .count,
    ).toBe("3");
  });
  it("stores and exposes IPv4 and IPv6 addresses in visitor reports", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    for (const ip of ["8.8.8.8", "2001:4860:4860::8888"]) {
      await service.record(
        { visitorId: id, kind: "request", path: "/ip-check", ip },
        null,
      );
      const report = (await service.list(new VisitorQuery())) as {
        rows: Record<string, unknown>[];
      };
      expect(report.rows.find(row => row.id === id)?.ip).toBe(ip);
      const detail = (await service.detail(id, 7)) as {
        visits: Record<string, unknown>[];
      };
      expect(detail.visits[0].ip).toBe(ip);
    }
  });
  it("combines actual visits from one IP and sorts the complete activity before paging", async () => {
    const ip = "9.9.9.9";
    for (const [id, path] of [
      [visitor, "/jobs/job-1"],
      [another, "/about"],
    ]) {
      await service.record({ visitorId: id, kind: "request", path, ip }, null);
    }
    const query = Object.assign(new VisitorDetailQuery(), {
      ip,
      sort: "path",
      direction: "asc",
    });
    const report = (await service.detail(visitor, 0, query)) as {
      visitTotal: number;
      visits: Record<string, unknown>[];
    };
    expect(report.visitTotal).toBe(2);
    expect(report.visits.map(v => v.path)).toEqual(["/about", "/jobs/job-1"]);
    expect(report.visits[1].title).toBe("Engineer");
    query.offset = 1;
    const page = (await service.detail(visitor, 0, query)) as typeof report;
    expect(page.visitTotal).toBe(2);
    expect(page.visits).toHaveLength(1);
    expect(page.visits[0].path).toBe("/jobs/job-1");
    for (const sort of [
      "id",
      "active",
      "signedIn",
      "hasSignedIn",
      "account",
      "ip",
      "country",
      "lastSeen",
      "requests",
      "anonymousViews",
      "views",
      "applies",
      "path",
      "lastBrowserSeen",
      "browser",
    ]) {
      const result = (await service.list(
        Object.assign(new VisitorQuery(), { sort, limit: 1 }),
      )) as { rows: unknown[] };
      expect(result.rows).toHaveLength(1);
    }
  });
});
