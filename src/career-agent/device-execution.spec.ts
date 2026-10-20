import { ValidationPipe } from "@nestjs/common";
import {
  DeviceEventInput,
  DeviceToolInput,
} from "./device-execution.dto";
import { deviceInput, MatchingCatalogueArgs, publicationRanges } from "./device-execution.protocol";
import { randomUUID } from "node:crypto";
import { replySuggestions } from "./reply-suggestions";
import { matchingCatalogue, matchingCataloguePageSize, matchingJobs, projectLocationEvidence } from "./device-matching";
import { DeviceExecutionService } from "./device-execution.service";
import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CareerRepository } from "./career.repository";
import { PostgresService } from "src/postgres/postgres.service";
const publicationArgs: MatchingCatalogueArgs = {
  publicationRange: "past_month", since: "2026-09-20T12:00:00.000Z", until: "2026-10-20T12:00:00.000Z",
};
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe("device execution HTTP schemas", () => {
  it("accepts only catalogue reads and bounded distinct canonical matching IDs without candidate data", () => {
    for (const value of [
      ...publicationRanges.map(publicationRange => ({ operation: "matching_catalogue", args: {
        ...publicationArgs, publicationRange, since: publicationRange === "all" ? null : publicationArgs.since,
        offset: 100000, countOnly: true,
      } })),
      { operation: "matching_jobs", args: { ids: Array.from({ length: 10 }, (_, index) => `node:${index + 1}`) } },
    ]) expect(deviceInput("platform", value)).toEqual(value);
    for (const value of [
      { operation: "evaluation_manifest", args: {} },
      { operation: "evaluation_context", args: { id: "node:1" } },
      { operation: "matching_catalogue", args: { limit: 10 } },
      { operation: "matching_catalogue", args: {} },
      ...[
        { publicationRange: "week" }, { since: null }, { publicationRange: "all" },
        { since: publicationArgs.until }, { since: "2026-10-21T12:00:00.000Z" },
        { since: "2026-02-30T12:00:00.000Z" }, { until: "not-a-date" },
        { until: "2026-10-20T12:00:00+00:00" }, { until: "2026-10-20T12:00:00.000Z\n" },
        { offset: -1 }, { offset: 0.5 }, { offset: Number.MAX_SAFE_INTEGER + 1 },
        { countOnly: "true" }, { limit: 1000 }, { owner: "foreign" }, { candidate: "Private" },
      ].map(changed => ({ operation: "matching_catalogue", args: { ...publicationArgs, ...changed } })),
      { operation: "matching_jobs", args: { ids: ["node:1"], candidate: { name: "Private" } } },
      { operation: "matching_jobs", args: { ids: [] } },
      { operation: "matching_jobs", args: { ids: ["node:1", "node:1"] } },
      { operation: "matching_jobs", args: { ids: Array.from({ length: 11 }, (_, index) => `node:${index + 1}`) } },
      ...["node:0", "node:01", "node:1\n", "public-alias", "node:1 OR true", 1].map(id => ({
        operation: "matching_jobs", args: { ids: [id] },
      })),
    ]) expect(() => deviceInput("platform", value)).toThrow();
  });
  it("accepts only bounded suggestion labels, never hidden action payloads", async () => {
    const valid = {
      leaseId: randomUUID(),
      eventId: randomUUID(),
      type: "suggestions",
      question: "Where would you like to work?",
      replies: ["Remote", "Hybrid", "No preference"],
    };
    await expect(
      pipe.transform(valid, { type: "body", metatype: DeviceEventInput }),
    ).resolves.toMatchObject(valid);
    for (const bad of [
      { ...valid, question: undefined },
      { ...valid, replies: undefined },
      { ...valid, replies: ["a"] },
      { ...valid, replies: ["a", "b", "c", "d", "e"] },
      { ...valid, replies: ["Remote", { label: "Hybrid", action: "confirm" }] },
      { ...valid, question: "x".repeat(241) },
      { ...valid, replies: ["x".repeat(81), "a"] },
    ])
      await expect(
        pipe.transform(bad, { type: "body", metatype: DeviceEventInput }),
      ).rejects.toThrow();
    for (const bad of [
      { ...valid, replies: ["Remote", " remote "] },
      { ...valid, question: " " },
      { ...valid, replies: [" ", "a"] },
    ])
      expect(() => replySuggestions(bad)).toThrow();
  });
  it.each([
    "credential",
    "access_token",
    "refresh_token",
    "apiKey",
    "owner",
    "workerId",
    "code",
  ])("rejects %s in connection metadata", key => {
    expect(() => deviceInput("connection", {
      connectionId: randomUUID(), provider: "codex", purpose: "reasoning", model: "gpt-6-astra", reasoningEffort: null,
      models: [{ id: "gpt-6-astra", label: "Model", reasoningEfforts: [], defaultReasoningEffort: null }],
      [key]: "synthetic-canary",
    })).toThrow();
  });
  it("rejects trailing control characters in a selected model rather than allowing provider-default fallback", () => {
    const connection = { connectionId: randomUUID(), provider: "openai", purpose: "reasoning", model: "model-a", reasoningEffort: null,
      models: [{ id: "model-a", label: "Model", reasoningEfforts: ["high"], defaultReasoningEffort: null }] };
    for (const changed of [
      { ...connection, model: "model-a\n" },
      { ...connection, reasoningEffort: "high\n" },
      { ...connection, models: [{ ...connection.models[0], label: "Model\n" }] },
      { ...connection, models: [{ ...connection.models[0], apiKey: "synthetic-only" }] },
    ]) expect(() => deviceInput("connection", changed)).toThrow();
  });
  it("does not let a caller supply owner or service identity for a claim", () => {
    expect(() => deviceInput("claim", { connectionId: randomUUID(), owner: "someone-else" })).toThrow();
  });
  it("requires a bounded supported event, an event receipt and a device lease", async () => {
    const valid = {
      leaseId: randomUUID(),
      eventId: randomUUID(),
      type: "text",
      text: "hello",
    };
    await expect(
      pipe.transform(valid, { type: "body", metatype: DeviceEventInput }),
    ).resolves.toMatchObject(valid);
    for (const bad of [
      { ...valid, type: "credential" },
      { ...valid, text: "x".repeat(20001) },
      { ...valid, leaseId: "service-secret" },
      { ...valid, credential: "synthetic" },
    ])
      await expect(
        pipe.transform(bad, { type: "body", metatype: DeviceEventInput }),
      ).rejects.toThrow();
  });
  it("allows only the tools interface, never arbitrary worker methods", async () => {
    await expect(
      pipe.transform(
        { leaseId: randomUUID(), method: "login/complete" },
        { type: "body", metatype: DeviceToolInput },
      ),
    ).rejects.toThrow();
  });
});

describe("selected publication catalogue transport", () => {
  const row = (id: number, total: number, publishedTimestamp = Date.parse("2026-09-25T12:00:00.000Z")) => ({
    id: `node:${id}`, total: String(total), title: "Complete title", company: "Employer",
    publishedTimestamp, salaryPayload: {}, city: null, location: "Role location", workMode: null,
  });
  it.each([
    { publicationRange: "today", since: "2026-10-19T22:00:00.000Z", until: "2026-10-20T12:00:00.000Z" },
    { publicationRange: "yesterday", since: "2026-10-18T22:00:00.000Z", until: "2026-10-19T22:00:00.000Z" },
    publicationArgs,
    { publicationRange: "all", since: null, until: publicationArgs.until },
  ] as MatchingCatalogueArgs[])("parameterizes exact $publicationRange bounds without a server rolling cutoff", async args => {
    const query = jest.fn(async () => [{ total: "100001" }]);
    expect(deviceInput("platform", { operation: "matching_catalogue", args })).toBeDefined();
    expect(await matchingCatalogue({ query }, { ...args, countOnly: true })).toEqual({
      total: 100001, jobs: [], nextOffset: null, publicationWindow: { range: args.publicationRange, since: args.since, until: args.until },
    });
    const [sql, parameters] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(parameters).toEqual([args.since === null ? null : Date.parse(args.since), Date.parse(args.until)]);
    expect(sql).toContain("j.online AND NOT j.blocked");
    expect(sql).toContain("($1::bigint IS NULL OR j.published_timestamp >= $1::bigint)");
    expect(sql).toContain("j.published_timestamp < $2::bigint");
    expect(sql).not.toMatch(/interval|statement_timestamp|now\(|LIMIT|OFFSET|candidate_|graph_nodes/i);
  });

  it("retrieves all 100001 metadata records through transport-sized pages, preserving exact totals", async () => {
    const total = 100001, ids = new Set<string>();
    const query = jest.fn(async (_sql: string, parameters: unknown[] = []) => {
      const [,, limit, offset] = parameters as [unknown, unknown, number, number];
      return Array.from({ length: Math.min(limit, total - offset) }, (_, index) => row(offset + index + 1, total));
    });
    let offset: number | null = 0;
    while (offset !== null) {
      const result = await matchingCatalogue({ query }, { ...publicationArgs, offset });
      expect(result.total).toBe(total);
      expect(result.jobs.length).toBeLessThanOrEqual(matchingCataloguePageSize);
      result.jobs.forEach(job => ids.add(job.id));
      offset = result.nextOffset;
    }
    expect(ids.size).toBe(total);
    expect(query).toHaveBeenCalledTimes(101);
    const [sql, parameters] = query.mock.calls[100];
    expect(parameters).toEqual([Date.parse(publicationArgs.since!), Date.parse(publicationArgs.until), 1000, 100000]);
    expect(sql).toContain('ORDER BY published_timestamp DESC,(\'node:\' || job_node_id::text) COLLATE "C"');
    expect(sql).toContain("LIMIT $3 OFFSET $4");
    expect(sql).not.toMatch(/interval|statement_timestamp|now\(/i);
  });

  it("retains exact scope totals for empty and exhausted pages", async () => {
    for (const total of [0, 100001]) {
      const query = jest.fn(async () => [{ total: String(total), id: null }]);
      expect(await matchingCatalogue({ query }, { ...publicationArgs, offset: 100001 })).toEqual({
        total, jobs: [], nextOffset: null,
        publicationWindow: { range: publicationArgs.publicationRange, since: publicationArgs.since, until: publicationArgs.until },
      });
    }
  });

  it("returns complete older online original ads without a publication cutoff", async () => {
    const ad = "  Complete older original.\n\tFinal condition.  ";
    const query = jest.fn(async () => [{ ...row(1, 1, Date.parse("2020-01-01T00:00:00.000Z")), ad }]);
    const result = await matchingJobs({ query }, ["node:1"]);
    expect(result.jobs[0]).toMatchObject({ id: "node:1", publishedAt: "2020-01-01T00:00:00.000Z", ad });
    expect(result.remainingIds).toEqual([]);
    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain("WHERE j.online AND NOT j.blocked");
    expect(sql).not.toMatch(/interval|statement_timestamp|now\(/i);
  });
});

describe("publication read authorization and byte capacity", () => {
  const identity = { id: "synthetic-device", owner: "1" };
  function fixture() {
    const query = jest.fn(async (sql: string) => sql.includes("FROM graph_nodes WHERE id=$1 AND label='User'")
      ? [{ wallet: "synthetic-wallet" }] : [{ total: "0", id: null }]);
    const authorizeCandidate = jest.fn(async () => undefined);
    const service = new DeviceExecutionService({ query } as unknown as PostgresService,
      { authorizeCandidate } as unknown as CareerRepository, new ConfigService());
    return { service, query, authorizeCandidate, download: jest.fn() };
  }
  it.each([
    { operation: "matching_catalogue", args: { ...publicationArgs, countOnly: true } },
    { operation: "matching_catalogue", args: publicationArgs },
    { operation: "matching_jobs", args: { ids: ["node:1"] } },
    { operation: "job_read", args: { id: "node:1" } },
  ])("does not bypass paid-device authority for $operation", async input => {
    for (const reason of ["Advanced subscription required", "Device is no longer paired", "Candidate identity changed"]) {
      const { service, query, authorizeCandidate, download } = fixture();
      authorizeCandidate.mockRejectedValueOnce(new ForbiddenException(reason));
      await expect(service.platform(identity, input, download)).rejects.toThrow(reason);
      expect(query).toHaveBeenCalledTimes(1);
      expect(download).not.toHaveBeenCalled();
    }
  });
  it.each([false, true])("checks authority again after metadata/count reads (countOnly=%s)", async countOnly => {
    const { service, query, authorizeCandidate, download } = fixture();
    authorizeCandidate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ForbiddenException("Device is no longer paired"));
    await expect(service.platform(identity, { operation: "matching_catalogue", args: { ...publicationArgs, countOnly } }, download))
      .rejects.toThrow("Device is no longer paired");
    expect(authorizeCandidate).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("passes canonical job reads through the existing age-filter bypass and checks authority twice", async () => {
    const { service, query, authorizeCandidate, download } = fixture();
    query.mockResolvedValueOnce([{ wallet: "synthetic-wallet" }]).mockResolvedValueOnce([{
      id: "node:1", identityMatches: 1, description: "  Complete older ad.\n", salaryPayload: {},
    }] as never);
    expect(await service.platform(identity, { operation: "job_read", args: { id: "node:1" } }, download))
      .toMatchObject({ id: "node:1", description: "  Complete older ad.\n" });
    expect(query.mock.calls[1][0]).toContain("AND ($6::boolean OR (");
    expect((query.mock.calls[1] as unknown as [string, unknown[]])[1][5]).toBe(true);
    expect(authorizeCandidate).toHaveBeenCalledTimes(2);
  });
  it("fails an oversized metadata page explicitly without truncating it", async () => {
    const { service, query, authorizeCandidate, download } = fixture();
    query.mockResolvedValueOnce([{ wallet: "synthetic-wallet" }]).mockResolvedValueOnce([{
      total: "1", id: "node:1", publishedTimestamp: Date.parse(publicationArgs.until) - 1,
      title: "x".repeat(8 * 1024 * 1024), salaryPayload: {},
    }] as never);
    await expect(service.platform(identity, { operation: "matching_catalogue", args: publicationArgs }, download))
      .rejects.toMatchObject({ response: { code: "matching_capacity_exceeded" } });
    expect(authorizeCandidate).toHaveBeenCalledTimes(2);
  });
});

describe("device role-location evidence", () => {
  it("serializes factual fields without interpreting a candidate, dropping conditions or merging alternatives", () => {
    const condition = `Only with written approval: ${"the residence restriction still applies; ".repeat(100)}`;
    const row = {
      rawLocations: ["Hong Kong/Singapore", " ", null, { name: "Not a plain role location" }],
      availability: [{ requirement: "required", placeKind: "country", placeName: "Netherlands", rawText: condition }],
      workArrangement: { classification: "conflicting", fullyRemote: false },
      remoteOptions: [
        { scope: "country_list", includedCountries: ["NL"], excludedCountries: ["US"], attendanceCadence: condition },
        { scope: "country_list", includedCountries: ["US"], residencyRequirements: ["US residence required"] },
      ],
      hybridOptions: [{ officeCity: "New York", attendanceCadence: "50% of each month" }],
      onsiteOptions: [{ officeCity: "Singapore", attendanceCadence: "Five days each week" }],
    };
    expect(projectLocationEvidence(row)).toEqual([
      "Raw advertised role location: Hong Kong/Singapore",
      `Canonical availability 1: ${JSON.stringify(row.availability[0])}`,
      `Work arrangement: ${JSON.stringify(row.workArrangement)}`,
      ...row.remoteOptions.map((facts, index) => `Work arrangement remoteOptions ${index + 1}: ${JSON.stringify(facts)}`),
      `Work arrangement hybridOptions 1: ${JSON.stringify(row.hybridOptions[0])}`,
      `Work arrangement onsiteOptions 1: ${JSON.stringify(row.onsiteOptions[0])}`,
    ]);
    expect(projectLocationEvidence({})).toEqual([]);
    expect(projectLocationEvidence({ rawLocations: [], availability: [null, {}], workArrangement: {}, remoteOptions: [null, {}] })).toEqual([]);
  });

  it("omits empty facts but keeps false, zero, full text and alternative numbering", () => {
    expect(projectLocationEvidence({
      workArrangement: { fullyRemote: false },
      availability: [{ minimumUtcOffsetMinutes: 0, confidence: 0, placeText: " ", placeTimezoneIds: [] }],
      remoteOptions: [{ officeCity: null, residencyRequirements: [], attendanceCadence: "" },
        { includedCountries: ["NL"], requiredUtcBand: { minimumMinutes: 0, maximumMinutes: 120 },
          attendanceCadence: "  Only with approval; all other restrictions remain.  ", travelRequirement: null }],
    })).toEqual([
      'Canonical availability 1: {"minimumUtcOffsetMinutes":0,"confidence":0}',
      'Work arrangement: {"fullyRemote":false}',
      'Work arrangement remoteOptions 2: {"includedCountries":["NL"],"requiredUtcBand":{"minimumMinutes":0,"maximumMinutes":120},"attendanceCadence":"  Only with approval; all other restrictions remain.  "}',
    ]);
  });

  it("counts untruncated location constraints toward the batch budget while keeping an oversized first job intact", async () => {
    const condition = `${"Complete conditional restriction. ".repeat(2200)}Final required approval.`;
    const salaryPayload = { minimumSalary: null, maximumSalary: null, salary: null,
      extractedMinimumSalary: null, extractedMaximumSalary: null, salaryCurrency: null, payRate: null };
    const rows = [
      { id: "node:1", salaryPayload, availability: [{ rawText: condition }], rawLocations: ["Hong Kong/Singapore"], ad: "  Exact original.\n\t" },
      { id: "node:2", salaryPayload, ad: "Second exact original." },
    ];
    const query = jest.fn(async () => rows);
    const result = await matchingJobs({ query }, ["node:1", "node:2"]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.remainingIds).toEqual(["node:2"]);
    expect(result.unavailableIds).toEqual([]);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ ad: rows[0].ad, city: null, workMode: null,
      locationEvidence: ["Raw advertised role location: Hong Kong/Singapore", `Canonical availability 1: ${JSON.stringify(rows[0].availability![0])}`] });
  });
});
