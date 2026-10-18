import { randomBytes } from "node:crypto";
import { openCareerData, protectCareerData } from "./data-protection";
import { assemblePaths, NetworkEdge } from "./network.service";
import { validateSync } from "class-validator";
import { plainToInstance } from "class-transformer";
import * as Ajv from "ajv";
import { SelectConnectionModelInput } from "./agent.dto";
import { candidateSchemas } from "./candidate-capabilities.dto";
describe("Career workflow security", () => {
  it("binds protected assessment data to its owner, record and purpose", () => {
    const key = randomBytes(32).toString("hex");
    const assessment = { evidence: [{ source: "owned-cv", excerpt: "Built accessible interfaces" }] };
    const binding = "alice:assessment-one:screening";
    const sealed = protectCareerData(assessment, key, binding);
    expect(openCareerData(sealed, key, binding)).toEqual(assessment);
    for (const context of [
      "bob:assessment-one:screening",
      "alice:assessment-two:screening",
      "alice:assessment-one:other-purpose",
    ])
      expect(() => openCareerData(sealed, key, context)).toThrow();
    expect(() => openCareerData(sealed, randomBytes(32).toString("hex"), binding)).toThrow();
  });
  const edge = (a: string, b: string): NetworkEdge => ({
    user_a: a,
    user_b: b,
    shared_org: "org",
    overlap_start: "2025-01-01",
    overlap_end: "2026-07-01",
    common_repos: ["org/repo"],
    strength_score: 1,
  });
  it("finds bounded paths, excludes cycles and suppresses every position", () => {
    const left = [edge("alice", "bridge1")],
      right = [edge("bridge2", "target")],
      bridge = [edge("bridge1", "bridge2")];
    const paths = assemblePaths(
      "alice",
      new Set(["target"]),
      left,
      right,
      bridge,
      new Set(),
    );
    expect(paths[0].people).toEqual(["alice", "bridge1", "bridge2", "target"]);
    expect(paths[0].edges.every(e => !e.caption.includes("employment"))).toBe(
      true,
    );
    for (const login of paths[0].people)
      expect(
        assemblePaths(
          "alice",
          new Set(["target"]),
          left,
          right,
          bridge,
          new Set([login]),
        ),
      ).toEqual([]);
    expect(
      assemblePaths(
        "alice",
        new Set(["target"]),
        left,
        right,
        [edge("bridge1", "extra"), edge("extra", "bridge2")],
        new Set(),
      ),
    ).toEqual([]);
  });
});

describe("Model selection input boundary", () => {
  const schema = new Ajv().compile(candidateSchemas.connection_model_set);
  const input = {
    requestId: "ea682f40-9fb4-4d87-9108-89bccde44a8a", revision: 0,
    connectionId: "ac9d9c0e-90c6-4f14-b66d-3b2e365ff1fb", model: "gpt-6-sol",
  };
  const dtoErrors = (value: Record<string, unknown>) => {
    const { connectionId: _connectionId, ...body } = value;
    return validateSync(plainToInstance(SelectConnectionModelInput, body));
  };
  it.each(["high", "none", "adaptive-v2", null])("accepts an explicit %s effort on both public transports", reasoningEffort => {
    const value = { ...input, reasoningEffort };
    expect(schema(value)).toBe(true);
    expect(dtoErrors(value)).toEqual([]);
  });
  it("requires the effort field instead of silently converting omission to a default", () => {
    expect(schema(input)).toBe(false);
    expect(dtoErrors(input).map(error => error.property)).toContain("reasoningEffort");
  });
  it.each(["", "High", "high effort", "low\n", "x".repeat(33), 1, false, []])("rejects an unsafe effort value %p", reasoningEffort => {
    const value = { ...input, reasoningEffort };
    expect(schema(value)).toBe(false);
    expect(dtoErrors(value).map(error => error.property)).toContain("reasoningEffort");
  });
});
