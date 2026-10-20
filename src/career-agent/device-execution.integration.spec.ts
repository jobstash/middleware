import { ConflictException, ForbiddenException, INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import * as http from "supertest";
import { AuthService } from "src/auth/auth.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { AgentService } from "./agent.service";
import { AgentController } from "./agent.controller";
import { CareerToolService } from "./career-tools.service";
import { ConnectionInputGuard } from "./connection-input.guard";
import { DeviceAuthGuard } from "./device-execution.guard";
import { DeviceExecutionController, ProfileDevicesController } from "./device-execution.controller";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
import { prepareMcpTestTables } from "src/mcp/mcp-test-fixture";
import { CareerRepository } from "./career.repository";
import { DeviceExecutionService } from "./device-execution.service";
import { canonicalJSON, deviceCanonicalRequest, MatchingCatalogueArgs, sha256 } from "./device-execution.protocol";
import { matchingCatalogue, matchingJobs } from "./device-matching";
import { candidateScreeningSource, unknownDocumentProvenance } from "./candidate-document-provenance";
import { CandidateInvocationContext } from "./candidate-context";

import { CandidateDocumentsService } from "./candidate-documents.service";
const databaseUrl = process.env.CAREER_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("Paired device access (isolated PostgreSQL)", () => {
  const schema = `device_${randomUUID().replace(/-/g, "")}`;
  const origin = "http://127.0.0.1:3001";
  const config = new ConfigService({ RECRUITERS_PUBLIC_ORIGIN: origin });
  let db: PostgresService, career: CareerRepository, devices: DeviceExecutionService, documents: CandidateDocumentsService, app: INestApplication;
  let owner: string, foreignOwner: string;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || !["/career_agent_test", "/jobstash_hosted_career_test"].includes(url.pathname))
      throw new Error("Dedicated local career test database required");
    db = new PostgresService({ url: databaseUrl!, applicationName: "device-execution-tests", maxConnections: 8, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await prepareMcpTestTables(db);
    await db.query(readFileSync("scripts/sql/candidate-document-provenance.sql", "utf8"));
    await db.query(`ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS object_content_type text;
      CREATE TABLE candidate_career_profiles(user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),revision integer DEFAULT 0,evidence jsonb DEFAULT '[]');
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),short_uuid text,title text,payload jsonb,detail_payload jsonb,
        organization_id text,organization_name text,project_id text,online boolean DEFAULT true,blocked boolean DEFAULT false,
        published_timestamp bigint DEFAULT (extract(epoch FROM now())*1000)::bigint,search_vector tsvector DEFAULT '');
      CREATE TABLE organization_search_documents(organization_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),organization_id text UNIQUE,
        project_ids text[] DEFAULT '{}',payload jsonb);
      CREATE TABLE project_search_documents(project_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),project_id text UNIQUE,
        organization_ids text[] DEFAULT '{}',payload jsonb);
      CREATE TABLE candidate_applications(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),job_node_id bigint REFERENCES graph_nodes(id),
        revision integer DEFAULT 0,state jsonb DEFAULT '{}',ranking_version text,job_snapshot jsonb,short_uuid text,updated_at timestamptz DEFAULT now());
      CREATE TABLE candidate_cv_versions(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),cv_id uuid,revision integer,name text,
        heading jsonb,selections jsonb,direction text,guidance text,baseline jsonb,cv_layout jsonb,created_at timestamptz DEFAULT now());
      CREATE TABLE candidate_application_documents(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),
        application_id uuid REFERENCES candidate_applications(id),cv_version_id uuid REFERENCES candidate_cv_versions(id),revision integer DEFAULT 1,
        content jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE candidate_exports(id uuid PRIMARY KEY,user_node_id bigint REFERENCES graph_nodes(id),
        document_id uuid REFERENCES candidate_application_documents(id),document_revision integer,kind text,filename text,bytes bytea,created_at timestamptz DEFAULT now());`);
    career = new CareerRepository(db);
    devices = new DeviceExecutionService(db, career, config);
    const agent = new AgentService(db, career, config, undefined, devices);
    documents = new CandidateDocumentsService(db, career, undefined as never, agent, undefined as never, config, undefined as never);
    const rows = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('User','{\"wallet\":\"device-alice\",\"name\":\"Alice\"}'),('User','{\"wallet\":\"device-bob\"}') RETURNING id::text");
    owner = String(rows[0].id); foreignOwner = String(rows[1].id);
    await db.query("INSERT INTO candidate_subscriptions(charge_id,user_node_id,status,paid_until) VALUES('alice',$1,'active',now()+interval '1 day'),('bob',$2,'active',now()+interval '1 day')", [owner, foreignOwner]);
    const module = await Test.createTestingModule({
      controllers: [DeviceExecutionController, ProfileDevicesController, AgentController],
      providers: [DeviceAuthGuard, PBACGuard, ConnectionInputGuard,
        { provide: DeviceExecutionService, useValue: devices },
        { provide: CandidateDocumentsService, useValue: { download: documents.download.bind(documents) } },
        { provide: AgentService, useValue: agent },
        { provide: CareerToolService, useValue: { mcp: jest.fn() } },
        { provide: ConfigService, useValue: config },
        { provide: AuthService, useValue: { getSession: async (request: { headers: Record<string, string> }) =>
          request.headers.authorization === "Bearer candidate-session"
            ? { address: "device-alice", permissions: [CheckWalletPermissions.USER] } : undefined } },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => { if (app) await app.close(); if (db) { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.onModuleDestroy(); } });
  beforeEach(async () => {
    await db.query("TRUNCATE candidate_agent_requests,candidate_device_tasks CASCADE");
    await db.query("UPDATE candidate_ai_connections SET execution_lease=NULL,execution_lease_until=NULL");
  });

  async function paired(wallet = "device-alice") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const id = randomUUID();
    const enrollment = await devices.pair(wallet, { requestId: randomUUID(), deviceId: id,
      publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url"), label: "Local companion" });
    const request = (path: string, body: unknown = {}, time = String(Date.now())) => {
      const nonce = randomUUID(), bytes = Buffer.from(JSON.stringify(body));
      return { id, time, nonce, method: "POST", path, body: bytes,
        signature: sign(null, Buffer.from(deviceCanonicalRequest(time, nonce, "POST", path, bytes)), privateKey).toString("base64url") };
    };
    const activation = { challenge: enrollment.challenge, account: enrollment.account };
    const identity = await devices.authenticate(request("/device/activate", activation));
    await devices.activate(identity, activation);
    return { identity, request, privateKey, publicKey };
  }

  it("enforces session origin only for enrollment and signed raw bytes for execution over HTTP", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const enrollment = { requestId: randomUUID(), deviceId: randomUUID(), label: "Companion",
      publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url") };
    await http(app.getHttpServer()).post("/profile/devices/pair").set("Origin", origin).send(enrollment).expect(403);
    await http(app.getHttpServer()).post("/profile/devices/pair").set("Authorization", "Bearer candidate-session").set("Origin", "https://foreign.example").send(enrollment).expect(403);
    const pending = await http(app.getHttpServer()).post("/profile/devices/pair").set("Authorization", "Bearer candidate-session").set("Origin", origin).send(enrollment).expect(201);
    expect(pending.body).toMatchObject({ deviceId: enrollment.deviceId, account: { id: owner, label: "Alice" } });
    const device = await paired(), signed = device.request("/device/heartbeat");
    const headers = { "X-Device-Id": signed.id, "X-Device-Time": signed.time, "X-Device-Nonce": signed.nonce, "X-Device-Signature": signed.signature };
    await http(app.getHttpServer()).post(signed.path).set(headers).send({ extra: true }).expect(403);
    await http(app.getHttpServer()).post(signed.path).set(headers).send({}).expect(201);
    await http(app.getHttpServer()).post(signed.path).set(headers).send({}).expect(403);
    await http(app.getHttpServer()).post("/device/claim").set("Authorization", "Bearer candidate-session").send({ connectionId: randomUUID() }).expect(403);
    for (const path of ["/profile/ai-connections/api", "/profile/ai-connections/hosted", "/profile/agent/browser/claim"])
      await http(app.getHttpServer()).post(path).send({ apiKey: "synthetic-never-persisted" }).expect(404);
  });

  it("allows signed direct-app status and owned reads without provider authority, denying writes and foreign records", async () => {
    const a = await paired(), b = await paired("device-bob");
    const call = (device: { request: (path: string, body: unknown) => { id: string; time: string; nonce: string; signature: string; path: string } }, body: Record<string, unknown>) => {
      const signed = device.request("/device/platform", body);
      return http(app.getHttpServer()).post(signed.path).set({
        "X-Device-Id": signed.id, "X-Device-Time": signed.time, "X-Device-Nonce": signed.nonce, "X-Device-Signature": signed.signature,
      }).send(body);
    };
    expect((await call(a, { operation: "status", args: {} }).expect(201)).body).toMatchObject({
      mode: "direct-app", account: { id: owner }, providerRequired: false, membership: { active: true },
    });
    expect(await devices.connections(a.identity)).toEqual([]);
    const sourceId = randomUUID(), text = "Owned historical career source";
    await db.query("INSERT INTO candidate_documents(id,user_node_id,filename,source_text,content_hash,storage_kind) VALUES($1,$2,'Owned.txt',$3,$4,'text')",
      [sourceId, owner, text, sha256(`pasted-cv-v1\n${text}`)]);
    const source = (await call(a, { operation: "legacy_source_read", args: { id: sourceId } }).expect(201)).body;
    expect(source).toMatchObject({ id: sourceId, text, originalBase64: Buffer.from(text).toString("base64") });
    await call(b, { operation: "legacy_source_read", args: { id: sourceId } }).expect(404);
    expect((await call(b, { operation: "legacy_sources", args: {} }).expect(201)).body.sources).toEqual([]);
    for (const input of [
      { operation: "source_text_create", args: { text: "Never stored" } },
      { operation: "legacy_source_read", args: { id: sourceId, owner } },
      { operation: "status", args: {}, apiKey: "Never accepted" },
      { operation: "search_jobs", args: { url: "http://127.0.0.1/private" } },
    ]) await call(a, input).expect(400);
    const context: CandidateInvocationContext = { kind: "device", owner, wallet: "device-alice", deviceId: a.identity.id };
    await expect(documents.begin(context, { requestId: randomUUID(), filename: "New.pdf", contentType: "application/pdf", byteLength: 100 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    const download = (ctx: CandidateInvocationContext, id: string) => documents.download(ctx, id);
    await expect(devices.platform({ id: a.identity.id, owner: foreignOwner }, { operation: "status", args: {} }, download))
      .rejects.toBeInstanceOf(ForbiddenException);
    await devices.revoke("device-alice", a.identity.id, { requestId: randomUUID() });
    await call(a, { operation: "status", args: {} }).expect(403);
    await expect(devices.platform(a.identity, { operation: "legacy_source_read", args: { id: sourceId } }, download))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps membership and catalogue visibility boundaries without a provider connection", async () => {
    const a = await paired(), download = (ctx: CandidateInvocationContext, id: string) => documents.download(ctx, id);
    const read = (operation: string, args: Record<string, unknown> = {}) => devices.platform(a.identity, { operation, args }, download);
    const [company] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{\"orgId\":\"blocked-platform-company\"}') RETURNING id");
    await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'BLOCKED_ORG_JOBS')", [owner, company.id]);
    const ids: Record<string, string> = {};
    for (const [id, online, blocked, organization, days] of [
      ["platform-visible", true, false, "visible", 1], ["platform-offline", false, false, "visible", 1],
      ["platform-blocked", true, true, "visible", 1], ["platform-company", true, false, "blocked-platform-company", 1],
      ["platform-old", true, false, "visible", 30],
    ] as const) {
      const [job] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost','{}') RETURNING id");
      ids[id] = `node:${job.id}`;
      await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,title,payload,online,blocked,organization_id,published_timestamp,organization_name)
        VALUES($1,$2,'Platform Engineer','{"description":"Real job description","url":"https://example.com/apply"}',$3,$4,$5,
        (extract(epoch FROM now())*1000)::bigint-$6::bigint*86400000,'Real company')`, [job.id, id, online, blocked, organization, days]);
    }
    expect(await read("search_jobs", { query: "Real company" })).toMatchObject({ jobs: [{ id: ids["platform-visible"], shortUUID: "platform-visible", company: "Real company", description: "Real job description" }] });
    expect(await read("job_read", { id: "platform-visible" })).toMatchObject({ id: "platform-visible", shortUUID: "platform-visible" });
    for (const id of ["platform-visible", "platform-company", "platform-old"])
      expect(await read("job_read", { id: ids[id] })).toMatchObject({ id: ids[id], shortUUID: id });
    for (const id of ["platform-offline", "platform-blocked"])
      await expect(read("job_read", { id: ids[id] })).rejects.toThrow("Job not found");
    for (const id of ["platform-offline", "platform-blocked", "platform-company", "platform-old"])
      await expect(read("job_read", { id })).rejects.toThrow("Job not found");
    await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second' WHERE user_node_id=$1", [owner]);
    try {
      expect(await read("status")).toMatchObject({ membership: { active: false }, providerRequired: false });
      for (const operation of ["search_jobs", "legacy_sources", "legacy_career", "legacy_applications"])
        await expect(read(operation)).rejects.toThrow("Advanced subscription required");
      await expect(read("job_read", { id: ids["platform-visible"] })).rejects.toThrow("Advanced subscription required");
    } finally {
      await db.query("UPDATE candidate_subscriptions SET paid_until=now()+interval '1 day' WHERE user_node_id=$1", [owner]);
    }
  });

  describe("batch matching catalogue", () => {
    const fourteenDays = 14 * 86400000;
    const download = (ctx: CandidateInvocationContext, id: string) => documents.download(ctx, id);
    function catalogueArgs(): MatchingCatalogueArgs {
      const until = new Date().toISOString();
      return { publicationRange: "past_2_weeks", since: new Date(Date.parse(until) - fourteenDays).toISOString(), until };
    }
    beforeEach(async () => {
      await db.query("TRUNCATE job_search_documents,organization_search_documents,project_search_documents");
    });
    async function job(id: string | null, published: number | null, payload: Record<string, unknown> = {}) {
      const [node] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('StructuredJobpost','{}') RETURNING id::text");
      await db.query(`INSERT INTO job_search_documents(job_node_id,short_uuid,title,organization_name,payload,published_timestamp)
        VALUES($1,$2,'Unrelated role','Canonical employer',$3,$4)`, [node.id, id, payload, published]);
      return node.id as string;
    }
    async function original(jobId: string, text: string | null, location?: unknown) {
      const [node] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Jobpost',$1) RETURNING id::text", [{ content: text, location }]);
      await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_STRUCTURED_JOBPOST')", [node.id, jobId]);
      return node.id as string;
    }
    function signedCall(device: { request(path: string, body: unknown): { id: string; time: string; nonce: string; path: string; signature: string } }, body: Record<string, unknown>) {
      const signed = device.request("/device/platform", body);
      return http(app.getHttpServer()).post(signed.path).set({
        "X-Device-Id": signed.id, "X-Device-Time": signed.time, "X-Device-Nonce": signed.nonce, "X-Device-Signature": signed.signature,
      }).send(body);
    }

    it("returns selected visible jobs newest first without personal filters or alias deduplication", async () => {
      const device = await paired(), published = Date.now() - 60000, scope = catalogueArgs();
      const publicationWindow = { range: scope.publicationRange, since: scope.since, until: scope.until };
      expect((await signedCall(device, { operation: "matching_catalogue", args: scope }).expect(201)).body)
        .toEqual({ total: 0, jobs: [], nextOffset: null, publicationWindow });
      const expected: { id: string; timestamp: number }[] = [];
      for (let index = 0; index < 125; index++) {
        const timestamp = published - Math.floor(index / 3) * 1000;
        expected.push({ id: `node:${await job(`cohort-${index}`, timestamp)}`, timestamp });
      }
      expected.push({ id: `node:${await job(null, published)}`, timestamp: published });
      expected.push({ id: `node:${await job("cohort-1", published)}`, timestamp: published });
      const [company] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{\"orgId\":\"ignored-personal-exclusion\"}') RETURNING id");
      await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'BLOCKED_ORG_JOBS')", [owner, company.id]);
      await db.query("UPDATE job_search_documents SET organization_id='ignored-personal-exclusion'");
      await job("old", published - fourteenDays);
      await job("future", Date.now() + 86400000);
      await job("unknown", null);
      for (const hidden of ["offline", "blocked"]) {
        await job(hidden, published);
        await db.query("UPDATE job_search_documents SET online=$2,blocked=$3 WHERE short_uuid=$1", [hidden, hidden !== "offline", hidden === "blocked"]);
      }
      const catalogue = (await signedCall(device, { operation: "matching_catalogue", args: scope }).expect(201)).body;
      expect(await devices.connections(device.identity)).toEqual([]);
      expected.sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      expect(catalogue).toEqual({ total: 127, nextOffset: null, publicationWindow, jobs: expected.map(item => ({
        id: item.id, title: "Unrelated role", company: "Canonical employer", publishedAt: new Date(item.timestamp).toISOString(),
        salary: null, city: null, location: null, workMode: null,
      })) });
    });

    it("uses caller calendar [since,until) bounds for today/yesterday and includes older month/all jobs", async () => {
      const midnight = Date.parse("2026-10-19T22:00:00.000Z"), until = "2026-10-20T12:00:00.000Z";
      const timestamps = [midnight - 86400000 - 1, midnight - 86400000, midnight - 1, midnight,
        Date.parse(until) - 1, Date.parse(until), midnight - 20 * 86400000, midnight - 100 * 86400000];
      for (let index = 0; index < timestamps.length; index++) await job(`boundary-${index}`, timestamps[index]);
      const scopes: [MatchingCatalogueArgs, number[]][] = [
        [{ publicationRange: "today", since: new Date(midnight).toISOString(), until }, [4, 3]],
        [{ publicationRange: "yesterday", since: new Date(midnight - 86400000).toISOString(), until: new Date(midnight).toISOString() }, [2, 1]],
        [{ publicationRange: "past_month", since: new Date(Date.parse(until) - 30 * 86400000).toISOString(), until }, [4, 3, 2, 1, 0, 6]],
        [{ publicationRange: "all", since: null, until }, [4, 3, 2, 1, 0, 6, 7]],
      ];
      for (const [args, indexes] of scopes) {
        const result = await matchingCatalogue(db, args);
        expect(result.total).toBe(indexes.length);
        expect(result.jobs.map(item => item.publishedAt)).toEqual(indexes.map(index => new Date(timestamps[index]).toISOString()));
        expect(result.nextOffset).toBeNull();
        expect(await matchingCatalogue(db, { ...args, countOnly: true })).toEqual({
          total: indexes.length, jobs: [], nextOffset: null,
          publicationWindow: { range: args.publicationRange, since: args.since, until: args.until },
        });
      }
      const old = (await matchingCatalogue(db, scopes[3][0])).jobs.at(-1)!;
      await original(old.id.slice(5), "  Complete hundred-day-old original.\n");
      expect((await matchingJobs(db, [old.id])).jobs[0]).toMatchObject({
        id: old.id, ad: "  Complete hundred-day-old original.\n",
      });
    });

    it("fetches ten jobs in one SQL query and accounts for unavailable IDs in requested order", async () => {
      const ids: string[] = [];
      for (let index = 0; index < 9; index++) ids.push(`node:${await job(index % 2 ? "same-alias" : null, Date.now() - 10000)}`);
      await db.query("UPDATE job_search_documents SET online=false WHERE job_node_id=$1", [ids[2].slice(5)]);
      await db.query("UPDATE job_search_documents SET blocked=true WHERE job_node_id=$1", [ids[5].slice(5)]);
      const requested = [...ids.reverse(), "node:9223372036854775808"];
      const query = jest.fn((sql: string, parameters?: unknown[]) => db.query(sql, parameters));
      const result = await matchingJobs({ query }, requested);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual([requested]);
      expect(result.remainingIds).toEqual([]);
      expect(result.unavailableIds).toEqual([requested[3], requested[6], requested[9]]);
      expect(result.jobs.map(item => item.id)).toEqual(requested.filter(id => !result.unavailableIds.includes(id)));
      expect(result.jobs.every(item => item.ad === null)).toBe(true);
    });

    it("returns identical factual terms in paid catalogue and batch without inventing city or salary units", async () => {
      const device = await paired(), published = Date.now() - 10000;
      const cases = [
        { payload: { minimumSalary: 208000, maximumSalary: 312000, extractedMinimumSalary: 100, extractedMaximumSalary: 150,
            payRate: "HOURLY", salaryCurrency: "USD", location: "Germany", locationType: "remote",
            availability: [{ placeKind: "country", placeName: "Germany", workMode: "remote" }] },
          detail: { availability: [
            { placeKind: "city", placeName: "Berlin", workMode: "hybrid", privateFact: "Excluded" },
            { placeKind: "city", placeText: "Amsterdam", workMode: "onsite" },
            { placeKind: "city", placeName: "Berlin", workMode: "hybrid" },
            { placeKind: "country", placeName: "Germany" }, { placeKind: "world_region", placeName: "Europe" },
          ] },
          terms: { salary: { minimum: 100, maximum: 150, stated: null, currency: "USD", period: "hour" },
            city: "Amsterdam, Berlin", location: "Germany", workMode: "hybrid, onsite" } },
        { payload: { minimumSalary: 96000, payRate: "MONTHLY", salaryCurrency: "EUR", location: "Paris, France", locationCity: "Paris", locationType: "hybrid" },
          terms: { salary: { minimum: 96000, maximum: null, stated: null, currency: "EUR", period: "year" },
            city: "Paris", location: "Paris, France", workMode: "hybrid" } },
        { payload: { extractedMinimumSalary: 80, location: "Europe", locationType: "unstated",
            availability: [{ placeKind: "continent", placeName: "Europe" }, { placeName: "London", workMode: "unknown" }] },
          terms: { salary: { minimum: 80, maximum: null, stated: null, currency: null, period: null },
            city: null, location: "Europe", workMode: null } },
        { payload: { location: "Worldwide", workArrangement: { classification: "remote_unqualified", options: [{ officeCity: "Employer HQ", confidence: "inherited" }] } },
          terms: { salary: null, city: null, location: "Worldwide", workMode: "remote_unqualified" } },
        { payload: { location: "Berlin", availability: { placeKind: "city", placeName: "Berlin" } },
          terms: { salary: null, city: null, location: "Berlin", workMode: null } },
        { payload: { location: "UK", salaryCurrency: "GBP" },
          detail: { location: "England", locationCity: "London", extractedMinimumSalary: 1200, payRate: "WEEKLY", salaryCurrency: "USD", locationType: "onsite" },
          terms: { salary: { minimum: 1200, maximum: null, stated: null, currency: "GBP", period: "week" },
            city: "London", location: "UK", workMode: "onsite" } },
        { payload: { salary: "90000", location: { name: "Paris" }, locationCity: 123, locationType: 123,
            availability: [{ placeKind: "city", placeName: "", placeText: "" }, { placeKind: "country", placeName: "France", workMode: "" }] },
          terms: { salary: null, city: null, location: null, workMode: null } },
        { payload: {},
          terms: { salary: null, city: null, location: null, workMode: null } },
      ];
      const [employer] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{}') RETURNING id");
      await db.query("INSERT INTO organization_search_documents VALUES($1,'terms-employer','{}',$2)", [employer.id, { name: "Employer", location: "London", city: "London" }]);
      const ids: string[] = [];
      const ad = "  Original salary and geographic conditions.\nDo not rewrite.\t";
      for (const [index, fixture] of cases.entries()) {
        const node = await job(`terms-${index}`, published - index, fixture.payload);
        await db.query("UPDATE job_search_documents SET organization_id='terms-employer',detail_payload=$2 WHERE job_node_id=$1", [node, fixture.detail ?? null]);
        await original(node, ad);
        ids.push(`node:${node}`);
      }
      const catalogue = (await signedCall(device, { operation: "matching_catalogue", args: catalogueArgs() }).expect(201)).body;
      const batch = (await signedCall(device, { operation: "matching_jobs", args: { ids } }).expect(201)).body;
      expect(catalogue.total).toBe(cases.length);
      expect(batch.remainingIds).toEqual([]);
      expect(batch.unavailableIds).toEqual([]);
      for (const [index, fixture] of cases.entries()) {
        expect(catalogue.jobs[index]).toMatchObject({ id: ids[index], ...fixture.terms });
        expect(batch.jobs[index]).toMatchObject({ id: ids[index], ...fixture.terms, ad });
        expect(Object.keys(catalogue.jobs[index]).sort()).toEqual(["city", "company", "id", "location", "publishedAt", "salary", "title", "workMode"]);
        expect(JSON.stringify([catalogue.jobs[index], batch.jobs[index]])).not.toContain("Excluded");
      }
    });

    it("preserves raw advertised role locations without guessing cities, remote permission or employer geography", async () => {
      const device = await paired(), published = Date.now() - 10000;
      const offices = "Chicago, New York, Seattle, South San Francisco HQ";
      const attendanceCadence = "At least 50% of the time in a given month in the local office or with users for office-assigned employees.";
      const hybridOptions = [{ scope: "unstated", officeCity: null, attendanceCadence, confidence: "source_stated" }];
      const stripe = await job("stripe-like", published, { location: null, locationType: "HYBRID",
        workArrangement: { classification: "verified_hybrid", fullyRemote: false, hybridOptions } });
      const okx = await job("okx-like", published - 1, { location: null, locationType: "unstated" });
      const unstated = await job("no-role-location", published - 2);
      const ad = "  Complete role text.\nApplicants outside the US may request their local salary range.\t";
      await original(stripe, ad, offices);
      await original(okx, ad, "Hong Kong/Singapore");
      await original(unstated, ad, { name: "Do not stringify a location object" });
      const [employer] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{}') RETURNING id");
      await db.query("INSERT INTO organization_search_documents VALUES($1,'location-employer','{}',$2)",
        [employer.id, { name: "Employer", location: "Employer HQ canary", city: "Employer HQ canary" }]);
      await db.query("UPDATE job_search_documents SET organization_id='location-employer'");
      const ids = [stripe, okx, unstated].map(id => `node:${id}`);
      const catalogue = (await signedCall(device, { operation: "matching_catalogue", args: catalogueArgs() }).expect(201)).body;
      const batch = (await signedCall(device, { operation: "matching_jobs", args: { ids } }).expect(201)).body;
      const expected = [
        { location: offices, city: null, workMode: "HYBRID", locationEvidence: [
          `Raw advertised role location: ${offices}`,
          `Work arrangement: ${JSON.stringify({ classification: "verified_hybrid", fullyRemote: false })}`,
          `Work arrangement hybridOptions 1: ${JSON.stringify({ scope: "unstated", attendanceCadence, confidence: "source_stated" })}`,
        ] },
        { location: "Hong Kong/Singapore", city: null, workMode: null,
          locationEvidence: ["Raw advertised role location: Hong Kong/Singapore"] },
        { location: null, city: null, workMode: null, locationEvidence: [] },
      ];
      for (const [index, facts] of expected.entries()) {
        const { locationEvidence, ...display } = facts;
        expect(catalogue.jobs[index]).toMatchObject(display);
        expect(batch.jobs[index]).toMatchObject({ ...display, ad });
        const read = (await signedCall(device, { operation: "job_read", args: { id: ids[index] } }).expect(201)).body;
        expect(read).toMatchObject({ ...display, description: ad });
        // JSONB key order is not source order; compare facts rather than JSON formatting.
        expect(batch.jobs[index].locationEvidence.map((entry: string) => entry.includes(": {")
          ? JSON.parse(entry.slice(entry.indexOf(": ") + 2)) : entry)).toEqual(locationEvidence.map(entry => entry.includes(": {")
          ? JSON.parse(entry.slice(entry.indexOf(": ") + 2)) : entry));
        expect(read.locationEvidence).toEqual(batch.jobs[index].locationEvidence);
        expect(JSON.stringify([catalogue.jobs[index], batch.jobs[index], read])).not.toContain("Employer HQ canary");
      }
    });

    it("keeps every canonical constraint on its distinct alternative and retains a conditional footer in both detailed reads", async () => {
      const device = await paired(), published = Date.now() - 10000;
      const footer = `Remote exceptions require written approval. ${"Approval conditions remain applicable. ".repeat(80)}No exception is promised.`;
      const availability = [
        { requirement: "required", workMode: "remote", placeId: "netherlands", placeName: "Netherlands", placeText: "NL",
          placeKind: "country", ancestorPlaceIds: ["europe"], placeTimezoneIds: ["Europe/Amsterdam"],
          timezoneKind: "utc_offset", timezone: "UTC+01:00", minimumUtcOffsetMinutes: 60, maximumUtcOffsetMinutes: 120,
          rawText: "Must reside in the Netherlands and overlap the stated hours.", confidence: 1, extractorVersion: "fixture" },
        { requirement: "preferred", timezoneKind: "iana", timezone: "Europe/Amsterdam", rawText: footer, confidence: 1, extractorVersion: "fixture" },
      ];
      const remoteOptions = [
        { classification: "verified_remote", mode: "remote", scope: "country_list", includedCountries: ["NL", "DE"],
          excludedCountries: ["US"], includedRegions: ["Europe"], excludedRegions: ["APAC"],
          requiredUtcBand: { minimumMinutes: 60, maximumMinutes: 120 },
          preferredUtcBand: { minimumUtcOffset: 1, maximumUtcOffset: 1 },
          residencyRequirements: ["Must already reside in an allowed country"],
          workAuthorizationRequirements: ["Must hold local working rights"], sponsorshipStatus: "unavailable",
          officeCity: null, attendanceCadence: null, travelRequirement: "Quarterly travel", confidence: "source_stated" },
        { scope: "country_list", includedCountries: ["US"], residencyRequirements: ["US residence required"],
          attendanceCadence: footer, confidence: "parsed" },
      ];
      const hybridOptions = [{ scope: "country_list", includedCountries: ["GB"], officeCity: "London",
        attendanceCadence: "Three days each week", confidence: "source_stated" }];
      const onsiteOptions = [{ officeCity: "Paris", attendanceCadence: "Every working day", confidence: "source_stated" }];
      const arrangement = { classification: "verified_remote", fullyRemote: false };
      const node = await job("alternatives", published, { location: "Europe or US", availability: [] });
      await db.query("UPDATE job_search_documents SET detail_payload=$2 WHERE job_node_id=$1",
        [node, { availability, workArrangement: { ...arrangement, remoteOptions, hybridOptions, onsiteOptions } }]);
      const ad = `  Full ad.\nRemote from NL/DE or a separately restricted US option.\n${footer}\t`;
      await original(node, ad, "Europe or US");
      const id = `node:${node}`;
      const batch = (await signedCall(device, { operation: "matching_jobs", args: { ids: [id] } }).expect(201)).body.jobs[0];
      const read = (await signedCall(device, { operation: "job_read", args: { id } }).expect(201)).body;
      expect(batch.ad).toBe(ad); expect(read.description).toBe(ad);
      expect(read.locationEvidence).toEqual(batch.locationEvidence);
      const entries = Object.fromEntries(batch.locationEvidence.map((entry: string) => {
        const separator = entry.indexOf(": ");
        return [entry.slice(0, separator), entry.slice(separator + 2)];
      }));
      expect(entries["Raw advertised role location"]).toBe("Europe or US");
      for (const [index, facts] of availability.entries())
        expect(JSON.parse(entries[`Canonical availability ${index + 1}`])).toEqual(facts);
      expect(JSON.parse(entries["Work arrangement"])).toEqual(arrangement);
      for (const [key, alternatives] of Object.entries({ remoteOptions, hybridOptions, onsiteOptions }))
        for (const [index, facts] of alternatives.entries())
          expect(JSON.parse(entries[`Work arrangement ${key} ${index + 1}`]))
            .toEqual(Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== null)));
      expect(Object.keys(entries)).toHaveLength(8);
      expect(batch.city).toBeNull();
    });

    it("keeps canonical IDs selectable when aliases collide and refuses ambiguous legacy reads", async () => {
      const device = await paired(), first = await job("shared-alias", Date.now() - 10000), second = await job("shared-alias", Date.now() - 10000);
      await original(first, "First complete original"); await original(second, "Second complete original");
      const response = (await signedCall(device, { operation: "matching_jobs", args: { ids: [`node:${second}`, `node:${first}`] } }).expect(201)).body;
      expect(response.jobs.map((item: { ad: string }) => item.ad)).toEqual(["Second complete original", "First complete original"]);
      await signedCall(device, { operation: "job_read", args: { id: "shared-alias" } }).expect(409);
      await db.query("UPDATE job_search_documents SET online=false WHERE job_node_id=$1", [second]);
      await signedCall(device, { operation: "job_read", args: { id: "shared-alias" } }).expect(409);
      const changed = (await signedCall(device, { operation: "matching_jobs", args: { ids: [`node:${second}`, `node:${first}`] } }).expect(201)).body;
      expect(changed.unavailableIds).toEqual([`node:${second}`]);
      expect(changed.jobs.map((item: { id: string }) => item.id)).toEqual([`node:${first}`]);
    });

    it("keeps every original character while projecting only compact company facts and the latest distinct rounds", async () => {
      const device = await paired(), published = Date.now() - 10000;
      const node = await job("full-original", published, { description: "Not the original", url: "https://employer.example/apply",
        location: "Berlin", availability: [{ workMode: "hybrid", privateFact: "Excluded" }] });
      const ad = `  Full original ad\n${"All original conditions. ".repeat(6000)}\nFinal condition.  `;
      await original(node, ad); await original(node, "Second original\nLast requirement.");
      const rounds = [
        { id: "round-old", date: 1000, raisedAmount: 10, roundName: "Seed" },
        { id: "round-new", date: 4000, raisedAmount: 50, roundName: "Series A", currency: "USD", sourceUrl: "Excluded" },
        { id: "round-middle", date: 3000, raisedAmount: 30, roundName: "Seed" },
        { id: "round-older", date: 2000, raisedAmount: null, amount: 22, financingType: "commitment", roundName: "Seed" },
      ];
      const organization = { name: "Canonical org", summary: "Company summary", description: "Long description".repeat(1000),
        headcountEstimate: 42, fundingRounds: [...rounds, rounds[1]], fundingStage: "Series A",
        investors: [{ name: "Not assigned to every round" }], provenance: { secret: "Excluded" } };
      const project = { name: "Protocol", summary: "Project summary", description: "Long project description", owners: [organization], crawler: "Excluded" };
      const [orgNode] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Organization','{}') RETURNING id");
      const [projectNode] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Project','{}') RETURNING id");
      await db.query("INSERT INTO organization_search_documents VALUES($1,'canonical-org','{canonical-project}',$2)", [orgNode.id, organization]);
      await db.query("INSERT INTO project_search_documents VALUES($1,'canonical-project','{canonical-org}',$2)", [projectNode.id, project]);
      const [roundNode] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('FundingRound',$1) RETURNING id", [rounds[1]]);
      const [investor] = await db.query("INSERT INTO graph_nodes(label,properties) VALUES('Investor','{\"name\":\"Round investor\",\"source\":\"Excluded\"}') RETURNING id");
      await db.query("INSERT INTO graph_relationships(source_id,target_id,type) VALUES($1,$2,'HAS_INVESTOR')", [roundNode.id, investor.id]);
      await db.query("UPDATE job_search_documents SET organization_id='canonical-org' WHERE job_node_id=$1", [node]);
      const args = { ids: [`node:${node}`] };
      const result = (await signedCall(device, { operation: "matching_jobs", args }).expect(201)).body;
      expect(result).toEqual({ jobs: [{
        id: args.ids[0], title: "Unrelated role", company: { name: "Canonical employer", description: "Company summary", headcount: 42, stage: "Series A",
          funding: [
            { date: 4000, amount: 50, currency: "USD", round: "Series A", type: null, investors: ["Round investor"] },
            { date: 3000, amount: 30, currency: null, round: "Seed", type: null, investors: [] },
            { date: 2000, amount: 22, currency: null, round: "Seed", type: "commitment", investors: [] },
          ], projects: [{ name: "Protocol", description: "Project summary" }] },
        salary: null, city: null, location: "Berlin", workMode: "hybrid", publishedAt: new Date(published).toISOString(), applyUrl: "https://employer.example/apply",
        locationEvidence: ['Canonical availability 1: {"workMode":"hybrid"}'],
        ad: `${ad}\n\nSecond original\nLast requirement.`,
      }], remainingIds: [], unavailableIds: [] });
      await db.query("UPDATE job_search_documents SET organization_id=NULL,organization_name=NULL,project_id='canonical-project' WHERE job_node_id=$1", [node]);
      const direct = (await signedCall(device, { operation: "matching_jobs", args }).expect(201)).body.jobs[0];
      expect(direct.company).toEqual({ name: "Protocol", description: "Project summary", headcount: null, stage: null,
        funding: [], projects: [{ name: "Protocol", description: "Project summary" }] });
    });

    it("bounds normal batches around 60k characters, keeps one oversized original, and never substitutes structured text", async () => {
      const device = await paired(), ids: string[] = [];
      for (let index = 0; index < 4; index++) {
        const node = await job(`budget-${index}`, Date.now() - 10000, { description: "Do not substitute this" });
        ids.push(`node:${node}`);
        if (index !== 3) await original(node, String(index).repeat(index === 2 ? 70000 : 31000));
      }
      for (const missing of [null, "", " \n\t "]) await original(ids[3].slice(5), missing);
      const batch = async (requested: string[]) => (await signedCall(device, { operation: "matching_jobs", args: { ids: requested } }).expect(201)).body;
      const first = await batch(ids);
      expect(first.jobs.map((item: { id: string }) => item.id)).toEqual([ids[0]]);
      expect(first.jobs[0].ad).toBe("0".repeat(31000));
      expect(first.remainingIds).toEqual(ids.slice(1)); expect(first.unavailableIds).toEqual([]);
      expect(JSON.stringify(first).length).toBeLessThanOrEqual(60000);
      const second = await batch(first.remainingIds);
      expect(second.jobs.map((item: { id: string }) => item.id)).toEqual([ids[1]]);
      const third = await batch(second.remainingIds);
      expect(third.jobs[0].ad).toBe("2".repeat(70000)); expect(third.remainingIds).toEqual([ids[3]]);
      expect((await batch(third.remainingIds)).jobs[0].ad).toBeNull();
      await original(ids[3].slice(5), "x".repeat(8 * 1024 * 1024));
      expect((await signedCall(device, { operation: "matching_jobs", args: { ids: [ids[3]] } }).expect(400)).body.code).toBe("matching_capacity_exceeded");
      await db.query("UPDATE job_search_documents SET title=$1", ["x".repeat(8 * 1024 * 1024)]);
      expect((await signedCall(device, { operation: "matching_catalogue", args: catalogueArgs() }).expect(400)).body.code).toBe("matching_capacity_exceeded");
    });

    it("requires strict inputs, signed ownership and membership before and after matching and detailed reads", async () => {
      const device = await paired(), id = `node:${await job("authorized", Date.now() - 10000)}`;
      const valid = [
        { operation: "matching_catalogue", args: catalogueArgs() },
        { operation: "matching_catalogue", args: { ...catalogueArgs(), countOnly: true } },
        { operation: "matching_jobs", args: { ids: [id] } }, { operation: "job_read", args: { id } },
      ];
      for (const body of valid) {
        await http(app.getHttpServer()).post("/device/platform").send(body).expect(403);
        await expect(devices.platform({ id: device.identity.id, owner: foreignOwner }, body, download)).rejects.toBeInstanceOf(ForbiddenException);
      }
      for (const body of [
        { operation: "evaluation_manifest", args: {} }, { operation: "evaluation_context", args: { id } },
        { operation: "matching_catalogue", args: {} },
        { operation: "matching_catalogue", args: { ...catalogueArgs(), limit: 50 } },
        { operation: "matching_catalogue", args: { ...catalogueArgs(), query: "engineer" } },
        { operation: "matching_jobs", args: { ids: [id], owner } },
        { operation: "matching_jobs", args: { ids: [id], candidate: { headline: "Private" } } },
        { operation: "matching_jobs", args: { ids: [] } },
        { operation: "matching_jobs", args: { ids: [id, id] } },
        { operation: "matching_jobs", args: { ids: Array.from({ length: 11 }, (_, index) => `node:${index + 1}`) } },
        ...["alias", "node:0", "node:1\n", "node:1 OR true", "node:0001"].map(invalid => ({ operation: "matching_jobs", args: { ids: [invalid] } })),
      ]) await signedCall(device, body).expect(400);
      for (const [status, future] of [["active", false], ["pending", true], ["expired", true]] as const) {
        await db.query("UPDATE candidate_subscriptions SET status=$2,paid_until=now()+$3::int*interval '1 day' WHERE user_node_id=$1",
          [owner, status, future ? 1 : -1]);
        try { for (const body of valid) await signedCall(device, body).expect(403); }
        finally { await db.query("UPDATE candidate_subscriptions SET status='active',paid_until=now()+interval '1 day' WHERE user_node_id=$1", [owner]); }
      }
      const authorize = career.authorizeCandidate.bind(career);
      for (const body of valid) {
        const changing = await paired();
        const spy = jest.spyOn(career, "authorizeCandidate").mockImplementationOnce(async context => {
          await authorize(context);
          await devices.revoke("device-alice", changing.identity.id, { requestId: randomUUID() });
        });
        try { await signedCall(changing, body).expect(403); }
        finally { spy.mockRestore(); }
        const membership = jest.spyOn(career, "authorizeCandidate").mockImplementationOnce(async context => {
          await authorize(context);
          await db.query("UPDATE candidate_subscriptions SET paid_until=now()-interval '1 second' WHERE user_node_id=$1", [owner]);
        });
        try { await signedCall(device, body).expect(403); }
        finally {
          membership.mockRestore();
          await db.query("UPDATE candidate_subscriptions SET paid_until=now()+interval '1 day' WHERE user_node_id=$1", [owner]);
        }
      }
      await devices.revoke("device-alice", device.identity.id, { requestId: randomUUID() });
      for (const body of valid) await signedCall(device, body).expect(403);
    });
  });

  it("joins legacy application drafts, CV versions and exports to their actual owner", async () => {
    const a = await paired(), b = await paired("device-bob"), applicationId = randomUUID(), documentId = randomUUID(), cvId = randomUUID();
    await db.query("INSERT INTO candidate_applications(id,user_node_id,short_uuid) VALUES($1,$2,'historical-job')", [applicationId, owner]);
    await db.query("INSERT INTO candidate_cv_versions(id,user_node_id,cv_id,revision,name,selections) VALUES($1,$2,$3,1,'Owned CV','[]')",
      [cvId, owner, randomUUID()]);
    await db.query("INSERT INTO candidate_application_documents(id,user_node_id,application_id,cv_version_id,content) VALUES($1,$2,$3,$4,'{\"letter\":\"Owned letter\"}')",
      [documentId, owner, applicationId, cvId]);
    await db.query("INSERT INTO candidate_exports(id,user_node_id,document_id,document_revision,kind,filename,bytes) VALUES($1,$2,$3,1,'letter','letter.pdf',$4)",
      [randomUUID(), owner, documentId, Buffer.from("historical bytes")]);
    // Broken historical cross-owner references must never leak foreign contents.
    await db.query("INSERT INTO candidate_application_documents(id,user_node_id,application_id,cv_version_id,content) VALUES($1,$2,$3,$4,'{\"letter\":\"Foreign letter\"}')",
      [randomUUID(), foreignOwner, applicationId, cvId]);
    const download = (ctx: CandidateInvocationContext, id: string) => documents.download(ctx, id);
    const input = { operation: "legacy_application_read", args: { id: applicationId } };
    expect(await devices.platform(a.identity, input, download)).toMatchObject({
      application: { id: applicationId }, documents: [{ id: documentId, content: { letter: "Owned letter" } }],
      cvs: [{ id: cvId, name: "Owned CV" }], exportsMetadata: [{ documentId, filename: "letter.pdf" }],
    });
    await expect(devices.platform(b.identity, input, download)).rejects.toThrow("Application not found");
  });

  it("keeps enrollment pending when website account identity or label differs from the local approval", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519"), id = randomUUID();
    const enrollment = await devices.pair("device-alice", { requestId: randomUUID(), deviceId: id, label: "Companion",
      publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url") });
    for (const account of [{ id: foreignOwner, label: enrollment.account.label }, { ...enrollment.account, label: "Misleading account" }]) {
      const body = Buffer.from(JSON.stringify({ challenge: enrollment.challenge, account })), time = String(Date.now()), nonce = randomUUID();
      const identity = await devices.authenticate({ id, time, nonce, path: "/device/activate", method: "POST", body,
        signature: sign(null, Buffer.from(deviceCanonicalRequest(time, nonce, "POST", "/device/activate", body)), privateKey).toString("base64url") });
      await expect(devices.activate(identity, JSON.parse(body.toString()))).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(await db.query("SELECT status FROM candidate_devices WHERE id=$1", [id])).toEqual([{ status: "pending" }]);
    const body = Buffer.from("{}"), time = String(Date.now()), nonce = randomUUID();
    await expect(devices.authenticate({ id, time, nonce, path: "/device/heartbeat", method: "POST", body,
      signature: sign(null, Buffer.from(deviceCanonicalRequest(time, nonce, "POST", "/device/heartbeat", body)), privateKey).toString("base64url") })).rejects.toBeInstanceOf(ForbiddenException);
  });
  async function configured() {
    const device = await paired();
    const connectionId = randomUUID();
    await devices.registerConnection(device.identity, { connectionId, provider: "openai", purpose: "reasoning", model: "test-model", reasoningEffort: null,
      models: [{ id: "test-model", label: "Test model", reasoningEfforts: ["high"], defaultReasoningEffort: null }] });
    return { ...device, connectionId };
  }
  const taskInput = (connectionId: string) => ({ id: randomUUID(), owner, connectionId, model: "test-model", reasoningEffort: null,
    prompt: "Return the supplied category as structured data.", schema: { type: "object", additionalProperties: false, required: ["category"], properties: { category: { enum: ["engineering"] } } } });

  async function appGrant() {
    const clientId = randomUUID(), grantId = randomUUID();
    await db.query("INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,'Lease regression','[]')", [clientId]);
    await db.query("INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at) VALUES($1,$2,$3,'https://mcp.example/mcp','career:write',now()+interval '1 day')", [grantId, owner, clientId]);
    return { kind: "oauth", owner, wallet: "device-alice", clientId, grantId, scopes: ["career:write"] } satisfies CandidateInvocationContext;
  }

  it("rejects changed bytes, wrong paths, expired signatures, foreign keys and persisted nonce replays", async () => {
    const a = await paired(), b = await paired("device-bob");
    const request = a.request("/device/heartbeat");
    await expect(devices.authenticate({ ...request, body: Buffer.from('{"extra":true}') })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(devices.authenticate({ ...request, path: "/device/claim" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(devices.authenticate({ ...request, signature: b.request("/device/heartbeat").signature })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await devices.authenticate(request)).toEqual(a.identity);
    const restarted = new DeviceExecutionService(db, career, config);
    await expect(restarted.authenticate(request)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(devices.authenticate(a.request("/device/heartbeat", {}, String(Date.now() - 31000)))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(devices.pair("device-bob", { requestId: randomUUID(), deviceId: a.identity.id,
      publicKey: a.publicKey.export({ type: "spki", format: "der" }).toString("base64url"), label: "Other account" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects provider secrets before storing metadata, and fences foreign and revoked devices", async () => {
    const a = await configured(), b = await paired("device-bob");
    const id = randomUUID();
    await expect(devices.registerConnection(a.identity, { connectionId: id, provider: "openai", purpose: "reasoning", model: "test-model", reasoningEffort: null,
      models: [{ id: "test-model", label: "Test", reasoningEfforts: [], defaultReasoningEffort: null }], apiKey: "synthetic-only" })).rejects.toThrow("Invalid device input");
    expect(await db.query("SELECT id FROM candidate_ai_connections WHERE id=$1", [id])).toEqual([]);
    await expect(devices.claim(b.identity, a.connectionId)).rejects.toBeInstanceOf(ForbiddenException);
    await devices.revoke("device-alice", a.identity.id, { requestId: randomUUID() });
    await expect(devices.authenticate(a.request("/device/heartbeat"))).rejects.toBeInstanceOf(ForbiddenException);
    expect(await devices.connections(a.identity)).toEqual([expect.objectContaining({ id: a.connectionId, status: "disconnected" })]);
  });

  it("retains a single paid attempt across offline leases, restart, schema rejection and duplicate delivery", async () => {
    const a = await configured(), input = taskInput(a.connectionId);
    await expect(devices.structured(input, "screening-eval")).rejects.toMatchObject({ response: expect.objectContaining({ code: "waiting_for_device", taskId: input.id }) });
    const first = await devices.claim(a.identity, a.connectionId, input.id);
    expect(first).toMatchObject({ id: input.id, kind: "structured", model: "test-model" });
    await db.query("UPDATE candidate_device_tasks SET lease_expires_at=now()-interval '1 minute' WHERE id=$1", [input.id]);
    const restarted = new DeviceExecutionService(db, career, config);
    expect(await restarted.readStructuredTask(owner, input.id)).toMatchObject({ status: "waiting_for_device" });
    expect(await restarted.claim(a.identity, a.connectionId, input.id)).toMatchObject({ leaseId: first!.leaseId });
    await restarted.structuredHeartbeat(a.identity, input.id, first!.leaseId);
    const receipt = { leaseId: first!.leaseId, eventId: randomUUID(), result: { category: "engineering" }, model: "test-model", reasoningEffort: null, usage: [{ model: "test-model", inputTokens: 12, outputTokens: 3 }] };
    await expect(restarted.result(a.identity, input.id, { ...receipt, result: { category: "fabricated" } })).rejects.toThrow("task schema");
    await restarted.result(a.identity, input.id, receipt);
    await restarted.result(a.identity, input.id, receipt);
    await expect(restarted.result(a.identity, input.id, { ...receipt, usage: [] })).rejects.toBeInstanceOf(ConflictException);
    expect(await restarted.structured(input, "screening-eval")).toMatchObject({ result: '{"category":"engineering"}', source: "device_reported", usage: [expect.objectContaining({ source: "device_reported" })] });
    expect(await restarted.claim(a.identity, a.connectionId, input.id)).toBeNull();
    await expect(restarted.structured({ ...input, prompt: "different" }, "screening-eval")).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps structured assessment pins independent through queued and running preference changes", async () => {
    const a = await configured(), input = taskInput(a.connectionId);
    const agent = new AgentService(db, career, config, undefined, devices);
    const catalog = [
      { id: "test-model", label: "Test", reasoningEfforts: ["high"], defaultReasoningEffort: null },
      { id: "other-model", label: "Other", reasoningEfforts: ["low"], defaultReasoningEffort: null },
    ];
    await db.query("UPDATE candidate_ai_connections SET model_catalog=$2 WHERE id=$1", [a.connectionId, JSON.stringify(catalog)]);
    await agent.selectConnectionModel("device-alice", a.connectionId, { requestId: randomUUID(), revision: 0, model: "other-model", reasoningEffort: null });
    await expect(devices.structured(input, "screening-eval")).rejects.toMatchObject({ response: expect.objectContaining({ code: "waiting_for_device" }) });
    await agent.selectConnectionModel("device-alice", a.connectionId, { requestId: randomUUID(), revision: 1, model: "other-model", reasoningEffort: "low" });
    const task = (await devices.claim(a.identity, a.connectionId, input.id))!;
    expect(task).toMatchObject({ id: input.id, model: "test-model", reasoningEffort: null, generation: 0 });
    await agent.selectConnectionModel("device-alice", a.connectionId, { requestId: randomUUID(), revision: 2, model: "test-model", reasoningEffort: "high" });
    expect(await devices.claim(a.identity, a.connectionId, input.id)).toEqual(task);
    await devices.structuredHeartbeat(a.identity, input.id, task.leaseId);
    const receipt = { leaseId: task.leaseId, eventId: randomUUID(), result: { category: "engineering" }, model: "test-model", reasoningEffort: null };
    await expect(devices.result(a.identity, input.id, { ...receipt, reasoningEffort: "high" })).rejects.toBeInstanceOf(ConflictException);
    await expect(devices.result(a.identity, input.id, { ...receipt, model: "other-model" })).rejects.toBeInstanceOf(ConflictException);
    await devices.result(a.identity, input.id, receipt);
    expect(await devices.readStructuredTask(owner, input.id)).toMatchObject({ status: "completed" });
    const next = { ...input, id: randomUUID(), model: undefined, reasoningEffort: undefined };
    await expect(devices.structured(next, "screening-eval")).rejects.toMatchObject({ response: expect.objectContaining({ code: "waiting_for_device" }) });
    expect(await devices.claim(a.identity, a.connectionId, next.id)).toMatchObject({ model: "test-model", reasoningEffort: "high", generation: 0 });
  });

  it.each(["waiting_for_device", "running"])("invalidates %s work when credentials are registered again with the same model", async status => {
    const a = await configured(), input = taskInput(a.connectionId);
    await expect(devices.structured(input, "screening-eval")).rejects.toBeInstanceOf(ConflictException);
    const task = status === "running" ? await devices.claim(a.identity, a.connectionId, input.id) : null;
    const connection = await devices.registerConnection(a.identity, { connectionId: a.connectionId, provider: "openai", purpose: "reasoning",
      model: "test-model", reasoningEffort: null, models: [{ id: "test-model", label: "Test", reasoningEfforts: ["high"], defaultReasoningEffort: null }] });
    expect(connection.details.generation).toBe(1);
    expect(await devices.readStructuredTask(owner, input.id)).toMatchObject({ status: "cancelled" });
    expect(await devices.claim(a.identity, a.connectionId, input.id)).toBeNull();
    if (task) await expect(devices.result(a.identity, input.id, { leaseId: task.leaseId, eventId: randomUUID(),
      result: { category: "engineering" }, model: "test-model", reasoningEffort: null })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(["revoked", "expired", "content", "text", "provenance", "generation"].flatMap(change =>
    ["waiting_for_device", "running"].map(status => ({ change, status }))))(
    "retires $status work after $change authority changes without reissuing the attempt", async ({ change, status }) => {
      const a = await configured(), context = await appGrant(), sourceId = randomUUID();
      const [source] = await db.query("INSERT INTO candidate_documents(id,user_node_id,content_hash,filename,source_text) VALUES($1,$2,$3,'cv.txt','Original CV') RETURNING *", [sourceId, owner, sourceId]);
      const input = { ...taskInput(a.connectionId), sourceDocumentId: sourceId, sourcePins: {
        contentHash: sourceId, sourceTextHash: sha256("Original CV"), provenanceHash: candidateScreeningSource(source as never).provenance_hash,
      } };
      await expect(career.withCandidateInvocation(context, "source_parse", true, () => devices.structured(input, "screening-eval")))
        .rejects.toMatchObject({ response: expect.objectContaining({ code: "waiting_for_device" }) });
      const first = status === "running" ? await devices.claim(a.identity, a.connectionId, input.id) : null;
      if (first) await db.query("UPDATE candidate_device_tasks SET lease_expires_at=now()-interval '1 minute' WHERE id=$1", [input.id]);
      if (change === "revoked") await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [context.grantId]);
      if (change === "expired") await db.query("UPDATE mcp_grants SET expires_at=now()-interval '1 minute' WHERE id=$1", [context.grantId]);
      if (change === "generation") await db.query("UPDATE candidate_ai_connections SET generation=generation+1 WHERE id=$1", [a.connectionId]);
      if (change === "content") await db.query("UPDATE candidate_documents SET content_hash=$2 WHERE id=$1", [sourceId, randomUUID()]);
      if (change === "text") await db.query("UPDATE candidate_documents SET source_text='Changed CV' WHERE id=$1", [sourceId]);
      if (change === "provenance") await db.query("UPDATE candidate_documents SET extraction_provenance=$2 WHERE id=$1",
        [sourceId, JSON.stringify({ ...unknownDocumentProvenance(sourceId, "Original CV"), truncated: true })]);
      const next = taskInput(a.connectionId);
      await expect(devices.structured(next, "screening-eval")).rejects.toBeInstanceOf(ConflictException);
      const restarted = new DeviceExecutionService(db, career, config);
      expect(await restarted.claim(a.identity, a.connectionId)).toMatchObject({ id: next.id });
      expect(await db.query("SELECT status,lease_id,response FROM candidate_device_tasks WHERE id=$1", [input.id]))
        .toEqual([{ status: "cancelled", lease_id: first?.leaseId ?? null, response: null }]);
      expect(await db.query("SELECT execution_lease FROM candidate_ai_connections WHERE id=$1", [a.connectionId]))
        .toEqual([{ execution_lease: next.id }]);
      // Restoring authority cannot resurrect an uncertain paid attempt or its old result.
      await db.query("UPDATE mcp_grants SET revoked_at=NULL,expires_at=now()+interval '1 day' WHERE id=$1", [context.grantId]);
      await db.query("UPDATE candidate_documents SET content_hash=$2,source_text='Original CV',extraction_provenance=NULL WHERE id=$1", [sourceId, sourceId]);
      await expect(restarted.structured(input, "screening-eval")).rejects.toMatchObject({ response: expect.objectContaining({ code: "task_cancelled" }) });
      expect(await restarted.claim(a.identity, a.connectionId, input.id)).toBeNull();
      if (first) await expect(restarted.result(a.identity, input.id, { leaseId: first.leaseId, eventId: randomUUID(),
        result: { category: "engineering" }, model: "test-model", reasoningEffort: null })).rejects.toBeInstanceOf(change === "generation" ? ForbiddenException : ConflictException);
      expect(await db.query("SELECT status,response FROM candidate_device_tasks WHERE id=$1", [input.id]))
        .toEqual([{ status: "cancelled", response: null }]);
      expect(await db.query("SELECT execution_lease FROM candidate_ai_connections WHERE id=$1", [a.connectionId]))
        .toEqual([{ execution_lease: next.id }]);
    });

  it.each(["heartbeat", "result", "failure"])("commits revocation cleanup before rejecting a %s receipt", async method => {
    const a = await configured(), context = await appGrant(), input = taskInput(a.connectionId);
    await expect(career.withCandidateInvocation(context, "source_parse", true, () => devices.structured(input, "screening-eval"))).rejects.toBeInstanceOf(ConflictException);
    const claimed = (await devices.claim(a.identity, a.connectionId, input.id))!;
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [context.grantId]);
    const receipt = { leaseId: claimed.leaseId, eventId: randomUUID(), model: "test-model", reasoningEffort: null, result: { category: "engineering" } };
    const operation = method === "heartbeat" ? devices.structuredHeartbeat(a.identity, input.id, claimed.leaseId)
      : method === "result" ? devices.result(a.identity, input.id, receipt)
        : devices.failure(a.identity, input.id, { leaseId: claimed.leaseId, eventId: randomUUID(), type: "failed" });
    await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.query("SELECT status,response FROM candidate_device_tasks WHERE id=$1", [input.id])).toEqual([{ status: "cancelled", response: null }]);
    expect(await db.query("SELECT execution_lease,execution_lease_until FROM candidate_ai_connections WHERE id=$1", [a.connectionId]))
      .toEqual([{ execution_lease: null, execution_lease_until: null }]);
  });

  it("retires an invalid waiting task without releasing another task's lease or accepting a foreign device receipt", async () => {
    const a = await configured(), foreign = await paired("device-bob"), context = await appGrant();
    const obsolete = taskInput(a.connectionId), valid = taskInput(a.connectionId);
    await expect(career.withCandidateInvocation(context, "source_parse", true, () => devices.structured(obsolete, "screening-eval"))).rejects.toBeInstanceOf(ConflictException);
    await expect(devices.structured(valid, "screening-eval")).rejects.toBeInstanceOf(ConflictException);
    const claimed = (await devices.claim(a.identity, a.connectionId, valid.id))!;
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [context.grantId]);
    await expect(devices.result(foreign.identity, obsolete.id, { leaseId: claimed.leaseId, eventId: randomUUID(),
      result: { category: "engineering" }, model: "test-model", reasoningEffort: null })).rejects.toThrow();
    expect(await db.query("SELECT status FROM candidate_device_tasks WHERE id=$1", [obsolete.id])).toEqual([{ status: "waiting_for_device" }]);
    await devices.reconcile(owner);
    expect(await db.query("SELECT status FROM candidate_device_tasks WHERE id=$1", [obsolete.id])).toEqual([{ status: "cancelled" }]);
    expect(await db.query("SELECT execution_lease FROM candidate_ai_connections WHERE id=$1", [a.connectionId])).toEqual([{ execution_lease: valid.id }]);
    await devices.result(a.identity, valid.id, { leaseId: claimed.leaseId, eventId: randomUUID(),
      result: { category: "engineering" }, model: "test-model", reasoningEffort: null });
    expect(await devices.readStructuredTask(owner, valid.id)).toMatchObject({ status: "completed" });
  });

  it("lets a signed companion claim unrelated agent work after a structured app grant is revoked", async () => {
    const a = await configured(), context = await appGrant(), input = taskInput(a.connectionId);
    await expect(career.withCandidateInvocation(context, "source_parse", true, () => devices.structured(input, "screening-eval"))).rejects.toBeInstanceOf(ConflictException);
    await devices.claim(a.identity, a.connectionId, input.id);
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [context.grantId]);
    const sessionId = randomUUID(), requestId = randomUUID();
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id) VALUES($1,$2,$3)", [sessionId, owner, a.connectionId]);
    await db.query("INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt) VALUES($1,$2,$3,'Continue my career conversation')", [requestId, sessionId, owner]);
    const body = { connectionId: a.connectionId, requestId }, signed = a.request("/device/claim", body);
    const response = await http(app.getHttpServer()).post(signed.path).set({
      "X-Device-Id": signed.id, "X-Device-Time": signed.time, "X-Device-Nonce": signed.nonce, "X-Device-Signature": signed.signature,
    }).send(body).expect(201);
    expect(response.body.task).toMatchObject({ id: requestId, kind: "agent" });
    expect(await db.query("SELECT status FROM candidate_device_tasks WHERE id=$1", [input.id])).toEqual([{ status: "cancelled" }]);
  });

  it("resumes the original agent lease and rejects another owned device, stale sources and changed model receipts", async () => {
    const a = await configured(), other = await paired();
    const sourceId = randomUUID(), sessionId = randomUUID(), id = randomUUID();
    await db.query("INSERT INTO candidate_documents(id,user_node_id,content_hash,filename,source_text) VALUES($1,$2,$3,'agent.txt','Source for this conversation')", [sourceId, owner, sourceId]);
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id,context_seed) VALUES($1,$2,$3,$4)", [sessionId, owner, a.connectionId, JSON.stringify({ sourceDocumentId: sourceId })]);
    await db.query("INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt) VALUES($1,$2,$3,'Read the selected source')", [id, sessionId, owner]);
    const agent = new AgentService(db, career, config, undefined, devices);
    const claimed = await agent.claimDevice(a.identity, a.connectionId, id);
    expect(claimed).toMatchObject({ id, kind: "agent", sourceDocumentId: sourceId });
    expect(await agent.claimDevice(a.identity, a.connectionId, id)).toEqual(claimed);
    const event = { leaseId: String(claimed!.leaseId), eventId: randomUUID(), type: "text", text: "Draft response" };
    await expect(agent.deviceEvent(other.identity, id, event)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(agent.deviceEvent(a.identity, id, { ...event, type: "usage", model: "different-model" })).rejects.toBeInstanceOf(ConflictException);
    await agent.deviceEvent(a.identity, id, event);
    await agent.deviceEvent(a.identity, id, event);
    expect(await db.query("SELECT event FROM candidate_agent_events WHERE request_id=$1", [id])).toEqual([
      { event: expect.objectContaining({ type: "text", text: "Draft response", source: "device_reported" }) },
    ]);
    await db.query("UPDATE candidate_documents SET source_text='Replaced source' WHERE id=$1", [sourceId]);
    await expect(agent.assertDeviceLease(a.identity, id, event.leaseId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(agent.deviceEvent(a.identity, id, { ...event, eventId: randomUUID(), type: "completed" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.query("SELECT status FROM candidate_agent_requests WHERE id=$1", [id])).toEqual([{ status: "running" }]);
  });

  it("binds browser receipts to active owner, device and domain with canonical object ordering", async () => {
    const a = await paired(), payload = { sequence: 1, runId: randomUUID(), action: { type: "scroll", direction: "down" } };
    const domain = "recruiters.browser.plan.v1";
    const signature = sign(null, Buffer.from(`${domain}\n${canonicalJSON(payload)}`), a.privateKey).toString("base64url");
    await devices.verifyOwnedReceipt(owner, a.identity.id, domain, { action: payload.action, runId: payload.runId, sequence: 1 }, signature);
    await expect(devices.verifyOwnedReceipt(foreignOwner, a.identity.id, domain, payload, signature)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(devices.verifyOwnedReceipt(owner, a.identity.id, "recruiters.browser.approval.v1", payload, signature)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(devices.verifyOwnedReceipt(owner, a.identity.id, domain, { ...payload, sequence: 2 }, signature)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps unclaimed paired-device work intact when the retirement migration is applied again", async () => {
    const a = await configured(), sessionId = randomUUID(), id = randomUUID();
    await db.query("INSERT INTO candidate_agent_sessions(id,user_node_id,connection_id) VALUES($1,$2,$3)", [sessionId, owner, a.connectionId]);
    await db.query("INSERT INTO candidate_agent_requests(id,session_id,user_node_id,prompt) VALUES($1,$2,$3,'Saved pending request')", [id, sessionId, owner]);
    await db.query(readFileSync("scripts/sql/candidate-device-execution.sql", "utf8"));
    expect(await db.query("SELECT status,device_id FROM candidate_agent_requests WHERE id=$1", [id])).toEqual([{ status: "queued", device_id: null }]);
    expect(await db.query("SELECT status,generation,device_id FROM candidate_ai_connections WHERE id=$1", [a.connectionId]))
      .toEqual([{ status: "connected", generation: 0, device_id: a.identity.id }]);
    expect(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('candidate_ai_connections','candidate_voice_connections') AND column_name IN ('credential_ciphertext','credential_lease','credential_lease_until')", [schema])).toEqual([]);
  });
});
