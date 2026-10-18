import { ScreeningGovernanceService } from "../career-agent/screening-governance.service";
import { CareerToolService } from "src/career-agent/career-tools.service";
import { CandidateCapabilityService } from "src/career-agent/candidate-capabilities.service";
import { prepareMcpTestTables } from "./mcp-test-fixture";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "src/career-agent/career.repository";
import { JobsService } from "src/jobs/jobs.service";
import { OrganizationsService } from "src/organizations/organizations.service";
import { McpOAuthService } from "./mcp-oauth.service";
import { McpMeteringService } from "./mcp-metering.service";
import { McpDataService } from "./mcp-data.service";
import { deviceConnectionFixture, leaseDeviceRequestFixture } from "src/career-agent/device-execution.fixture";
const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)(
  "Advanced data access with real authorization and PostgreSQL",
  () => {
    let db: PostgresService,
      oauth: McpOAuthService,
      data: McpDataService,
      auth: string;
    const settings = {
      NODE_ENV: "test",
      MCP_RESOURCE_URL: "http://127.0.0.1:3333/mcp",
      MCP_ISSUER_URL: "http://127.0.0.1:8085/mcp",
      MCP_FRONTEND_URL: "http://localhost:3000",
      MCP_ADVANCED_MONTHLY_LIMIT: "2",
      MCP_USAGE_UNIT: "calls",
    };
    const jobs = {
      getJobsListWithSearch: jest.fn(async () => ({
        page: 1,
        total: 1,
        count: 1,
        data: [{ id: "job" }],
      })),
    };
    const orgs = {
      getOrgsListWithSearch: jest.fn(async () => ({
        page: 1,
        total: 1,
        count: 1,
        data: [{ orgId: "org" }],
      })),
    };
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        parsed.hostname !== "127.0.0.1" ||
        parsed.pathname !== "/jobstash_mcp_test"
      )
        throw Error("Dedicated database required");
      db = new PostgresService({
        url: url!,
        applicationName: "mcp-data-tests",
        maxConnections: 12,
        statementTimeoutMs: 5000,
      });
      await db.onModuleInit();
      await db.query(
        "CREATE TABLE IF NOT EXISTS graph_nodes(id bigserial PRIMARY KEY,label text,properties jsonb)",
      );
      await db.query(
        "CREATE TABLE IF NOT EXISTS candidate_subscriptions(charge_id text PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),status text,paid_until timestamptz)",
      );
      await db.query(readFileSync("scripts/sql/mcp-access.sql", "utf8"));
      await prepareMcpTestTables(db);
      const career = new CareerRepository(db),
        config = new ConfigService(settings);
      oauth = new McpOAuthService(db, career, config);
      data = new McpDataService(
        db,
        career,
        config,
        oauth,
        new McpMeteringService(db),
        jobs as unknown as JobsService,
        orgs as unknown as OrganizationsService,
        new CandidateCapabilityService(career, undefined, db, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, new ScreeningGovernanceService(db, career)),
      );
    });
    afterAll(async () => db?.onModuleDestroy());
    beforeEach(async () => {
      jest.clearAllMocks();
      await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
      await db.query(
        `INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}')`,
      );
      const client = await oauth.register({
        client_name: "AI",
        redirect_uris: ["https://client.example/cb"],
      });
      const verifier = randomBytes(32).toString("base64url");
      const next = await oauth.authorize({
        client_id: client.client_id,
        redirect_uri: "https://client.example/cb",
        state: "state",
        resource: settings.MCP_RESOURCE_URL,
        scope: "data:read",
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
      });
      const consent = await oauth.consent(
        "alice",
        new URL(next).searchParams.get("request")!,
        true,
      );
      const token = await oauth.exchange({
        grant_type: "authorization_code",
        client_id: client.client_id,
        redirect_uri: "https://client.example/cb",
        resource: settings.MCP_RESOURCE_URL,
        code: new URL(consent.redirectUrl).searchParams.get("code"),
        code_verifier: verifier,
      });
      auth = "Bearer " + token.access_token;
    });
    const activate = () =>
      db.query(
        "INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('verified-payment',1,'active',now()+interval '10 days')",
      );
    const call = (name = "search_jobs") => ({
      name,
      arguments: { requestId: randomUUID(), query: "robotics", limit: 2 },
    });
    it("keeps the original public catalog reachable before membership without unlocking searches", async () => {
      expect(await data.identity(auth)).toEqual({ scope: "data:read", scopes: ["data:read"] });
      expect((await data.tools(auth)).tools.map(tool => tool.name)).toEqual([
        "search_jobs", "search_organizations", "research_jobs", "research_result",
      ]);
      await expect(data.call(auth, { name: "account_status", arguments: {} })).rejects.toMatchObject({
        status: 403, response: { error: "insufficient_scope", scope: "account:read" },
      });
      await expect(data.call(auth, call())).rejects.toMatchObject({ status: 403 });
      expect(jobs.getJobsListWithSearch).not.toHaveBeenCalled();
    });
    it("denies free, pending, and expired accounts before searching", async () => {
      await expect(data.call(auth, call())).rejects.toThrow("Advanced");
      await db.query(
        "INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('pending-payment',1,'pending',now()+interval '1 day')",
      );
      await expect(data.call(auth, call())).rejects.toThrow("Advanced");
      await db.query(
        "UPDATE candidate_subscriptions SET status='active',paid_until=now()-interval '1 second'",
      );
      await expect(data.call(auth, call())).rejects.toThrow("Advanced");
      expect(jobs.getJobsListWithSearch).not.toHaveBeenCalled();
    });
    it("includes both searches in Advanced, meters successful calls and saves retries", async () => {
      await activate();
      const request = call();
      const first = await data.call(auth, request);
      expect(first.structuredContent.usage.units).toBe(1);
      expect((await data.call(auth, request)).structuredContent).toEqual(
        first.structuredContent,
      );
      expect(jobs.getJobsListWithSearch).toHaveBeenCalledTimes(1);
      await data.call(auth, call("search_organizations"));
      await expect(data.call(auth, call())).rejects.toThrow("allowance");
      expect(await data.status("alice")).toMatchObject({
        advanced: true,
        usage: { used: 2, limit: 2, unit: "calls" },
      });
    });
    it("denies cached data after expiry or disconnect", async () => {
      await activate();
      const request = call();
      await data.call(auth, request);
      await db.query(
        "UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second'",
      );
      await expect(data.call(auth, request)).rejects.toThrow("Advanced");
      await db.query(
        "UPDATE candidate_subscriptions SET paid_until=now()+interval '1 day'",
      );
      const [connection] = await oauth.connections("alice");
      await oauth.disconnect("alice", String(connection.id));
      await expect(data.call(auth, request)).rejects.toThrow();
      expect(jobs.getJobsListWithSearch).toHaveBeenCalledTimes(1);
    });
    it("rejects oversized pages and unknown tools without charging", async () => {
      await activate();
      await expect(
        data.call(auth, {
          name: "search_jobs",
          arguments: { requestId: randomUUID(), limit: 500 },
        }),
      ).rejects.toThrow("Invalid");
      await expect(data.call(auth, call("private_cv"))).rejects.toMatchObject({ status: 404 });
      expect(jobs.getJobsListWithSearch).not.toHaveBeenCalled();
    });
    it("does not reset usage when the account renews or replaces its checkout", async () => {
      await activate();
      await data.call(auth, call());
      await db.query("UPDATE candidate_subscriptions SET status='expired'");
      await db.query(
        "INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('replacement-payment',1,'active',now()+interval '20 days')",
      );
      await data.call(auth, call());
      await expect(data.call(auth, call())).rejects.toThrow("allowance");
    });
    const research = () => ({
      name: "research_jobs",
      arguments: { requestId: randomUUID(), question: "Compare these jobs", limit: 2 },
    });
    const connectResearchAccount = () => deviceConnectionFixture(db, "1", { provider: "codex", online: false });
    const expectNoResearch = async () => {
      for (const table of ["candidate_agent_sessions", "candidate_agent_requests", "mcp_research_requests"])
        expect((await db.query(`SELECT count(*)::int AS count FROM ${table}`))[0].count).toBe(0);
      expect((await db.query("SELECT used,reserved FROM mcp_usage_periods"))[0]).toEqual({ used: "0", reserved: "0" });
    };
    it("does not queue research when Advanced expires while records are being read", async () => {
      await activate();
      await connectResearchAccount();
      jobs.getJobsListWithSearch.mockImplementationOnce(async () => {
        await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second'");
        return { page: 1, total: 1, count: 1, data: [{ id: "job" }] };
      });
      await expect(data.call(auth, research())).rejects.toThrow("Advanced");
      await expectNoResearch();
    });
    it("does not queue research when its saved usage claim expires", async () => {
      await activate();
      await connectResearchAccount();
      jobs.getJobsListWithSearch.mockImplementationOnce(async () => {
        await db.query("UPDATE mcp_usage_receipts SET expires_at=now()-interval '1 second' WHERE state='pending'");
        return { page: 1, total: 1, count: 1, data: [{ id: "job" }] };
      });
      const request = research();
      await expect(data.call(auth, request)).rejects.toThrow("expired");
      await expectNoResearch();
      await data.call(auth, request);
      expect((await db.query("SELECT count(*)::int AS count FROM candidate_agent_requests"))[0].count).toBe(1);
    });
    it("rolls back the research queue together with a failed usage write and retries once", async () => {
      await activate();
      await connectResearchAccount();
      const request = research();
      const transaction = db.transaction.bind(db);
      let transactions = 0;
      const failure = jest.spyOn(db, "transaction").mockImplementation(work => {
        const fail = ++transactions === 2;
        return transaction(async manager => {
          const result = await work(manager);
          if (fail) throw new Error("simulated receipt commit failure");
          return result;
        });
      });
      try {
        await expect(data.call(auth, request)).rejects.toThrow("simulated receipt commit failure");
      } finally {
        failure.mockRestore();
      }
      await expectNoResearch();
      await data.call(auth, request);
      await data.call(auth, request);
      expect((await db.query("SELECT count(*)::int AS count FROM candidate_agent_requests"))[0].count).toBe(1);
      expect((await db.query("SELECT used,reserved FROM mcp_usage_periods"))[0]).toEqual({ used: "1", reserved: "0" });
    });
    it("queues research for an offline paired device and restricts results to the authorizing app", async () => {
      await activate();
      const request = {
        name: "research_jobs",
        arguments: {
          requestId: randomUUID(),
          query: "robotics",
          limit: 2,
          question: "Compare the job requirements",
        },
      };
      await expect(data.call(auth, request)).rejects.toThrow();
      await connectResearchAccount();
      const started = await data.call(auth, request);
      expect(
        (started.structuredContent as { data: unknown }).data,
      ).toMatchObject({
        researchId: request.arguments.requestId,
        status: "waiting_for_device",
      });
      await data.call(auth, request);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM candidate_agent_requests WHERE id=$1",
            [request.arguments.requestId],
          )
        )[0].count,
      ).toBe(1);
      const workerId = await leaseDeviceRequestFixture(db, request.arguments.requestId);
      const isolatedTools = Object.assign(
        Object.create(CareerToolService.prototype),
        { db, career: new CareerRepository(db) },
      ) as CareerToolService;
      await expect(
        isolatedTools.mcp(workerId, request.arguments.requestId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "career_read" },
        }),
      ).rejects.toThrow("only use the records");
      expect(
        await isolatedTools.mcp(workerId, request.arguments.requestId, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      ).toMatchObject({ result: { tools: [] } });
      await db.query(
        "UPDATE candidate_agent_requests SET status='queued' WHERE id=$1",
        [request.arguments.requestId],
      );
      const result = await data.call(auth, {
        name: "research_result",
        arguments: { researchId: request.arguments.requestId },
      });
      expect(result.structuredContent).toMatchObject({
        status: "waiting_for_device",
        answer: "",
      });
      const usage = await data.status("alice");
      expect(usage).toMatchObject({ usage: { used: 1 } });
      await expect(
        data.call(auth, {
          name: "research_result",
          arguments: { researchId: randomUUID() },
        }),
      ).rejects.toThrow("not available");
    });
  },
);
