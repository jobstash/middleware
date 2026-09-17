import { Client } from "pg";
import { readFileSync } from "node:fs";
import { VisitorActivityService } from "./visitor-activity.service";
import { VisitorQuery } from "./visitor-activity.dto";
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
      INSERT INTO graph_nodes VALUES(1,'User','{"wallet":"test-wallet","name":"Test account"}'),(10,'Job','{"title":"Engineer","shortUUID":"job-1"}');
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
  it("expires only old visitor records, retaining existing job events", async () => {
    await db.query(
      "UPDATE visitor_activity SET last_seen=now()-interval '31 days' WHERE visitor_id=$1",
      [another],
    );
    await service.expire();
    expect(
      (
        await db.query(
          "SELECT count(*) FROM visitor_activity WHERE visitor_id=$1",
          [another],
        )
      ).rows[0].count,
    ).toBe("0");
    expect(
      (await db.query("SELECT count(*) FROM user_activity_events")).rows[0]
        .count,
    ).toBe("3");
  });
});
