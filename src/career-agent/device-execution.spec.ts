import { ValidationPipe } from "@nestjs/common";
import {
  DeviceEventInput,
  DeviceToolInput,
} from "./device-execution.dto";
import { deviceInput } from "./device-execution.protocol";
import { randomUUID } from "node:crypto";
import { replySuggestions } from "./reply-suggestions";
import { matchingJobs, projectLocationEvidence } from "./device-matching";
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe("device execution HTTP schemas", () => {
  it("accepts only catalogue reads and bounded distinct canonical matching IDs without candidate data", () => {
    for (const value of [
      { operation: "matching_catalogue", args: {} },
      { operation: "matching_jobs", args: { ids: Array.from({ length: 10 }, (_, index) => `node:${index + 1}`) } },
    ]) expect(deviceInput("platform", value)).toEqual(value);
    for (const value of [
      { operation: "evaluation_manifest", args: {} },
      { operation: "evaluation_context", args: { id: "node:1" } },
      { operation: "matching_catalogue", args: { limit: 10 } },
      { operation: "matching_jobs", args: { ids: ["node:1"], candidate: { name: "Private" } } },
      { operation: "matching_jobs", args: { ids: [] } },
      { operation: "matching_jobs", args: { ids: ["node:1", "node:1"] } },
      { operation: "matching_jobs", args: { ids: Array.from({ length: 11 }, (_, index) => `node:${index + 1}`) } },
      ...["node:0", "node:01", "node:1\n", "public-alias", "node:1 OR true", 1].map(id => ({
        operation: "matching_jobs", args: { ids: [id] },
      })),
    ]) expect(() => deviceInput("platform", value)).toThrow("Invalid device input");
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
