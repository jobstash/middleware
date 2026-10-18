import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { screeningEvalFixtures, screeningEvalPairs, ScreeningEvalFixture, ScreeningEvalPair, validateScreeningEvalFixtures } from "./screening-eval-fixtures";
import { gradeScreeningFixture, gradeScreeningPairs, ScreeningEvalOutput, EvalCheck } from "./screening-eval-graders";
import { pairedPolicyCalibration, screeningBatchDiagnostics, ScreeningBatchDiagnostics } from "../../src/career-agent/screening-calibration";
import { screeningPrompt, screeningRubricHash, screeningAssessmentSchemaForSources, parseScreeningAssessment } from "../../src/career-agent/job-screening";
import {
  screeningEvidencePrompt, candidateCapabilityPrompt, screeningEvidenceSchema,
  candidateCapabilitySchema, parseScreeningEvidence, parseCandidateCapability,
  ScreeningStage, ScreeningPolicy,
} from "../../src/career-agent/screening-workflow";

export function evalHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item !== null && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(canonical(value))).digest("hex");
}

export interface ScreeningEvalFailure {
  stage: ScreeningStage;
  requestId: string | null;
  category: "execution" | "provenance" | "validation" | "internal";
  code: "network_error" | "request_timeout" | "http_error" | "invalid_response_json" |
    "policy_mismatch" | "stage_provenance_mismatch" | "model_attribution_mismatch" |
    "invalid_stage_artifact" | "local_evaluation_error" | "invalid_json_output" |
    "incomplete_response" | "stage_timeout" | "provider_execution_failed" | "screening_eval_failed";
  httpStatus?: number;
  stopReason?: "max_tokens" | "max_agent_steps" | "cancelled" | "error";
}
export class ScreeningEvalError extends Error {
  constructor(
    readonly category: ScreeningEvalFailure["category"],
    readonly code: ScreeningEvalFailure["code"],
    readonly httpStatus?: number,
    readonly stopReason?: ScreeningEvalFailure["stopReason"],
  ) {
    super(code);
    this.name = "ScreeningEvalError";
  }
}
export function screeningEvalFailure(error: unknown, stage: ScreeningStage, requestId: string | null): ScreeningEvalFailure {
  if (error instanceof ScreeningEvalError) {
    return { stage, requestId, category: error.category, code: error.code,
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      ...(error.stopReason === undefined ? {} : { stopReason: error.stopReason }) };
  }
  // Native/parser/provider Error.message can contain input text. Never expose it.
  return { stage, requestId, category: "internal", code: "local_evaluation_error" };
}
export function validateEvalStageArtifact<T>(parse: () => T): T {
  try { return parse(); }
  catch { throw new ScreeningEvalError("validation", "invalid_stage_artifact"); }
}
const safeRemoteCodes: Record<string, true> = {
  invalid_json_output: true, incomplete_response: true, stage_timeout: true,
  provider_execution_failed: true, screening_eval_failed: true,
};
const safeStopReasons: Record<string, true> = {
  max_tokens: true, max_agent_steps: true, cancelled: true, error: true,
};
export function screeningEvalHttpError(status: number, payload: unknown): ScreeningEvalError {
  const details = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  const code = typeof details.code === "string" && safeRemoteCodes[details.code] === true
    ? details.code as ScreeningEvalFailure["code"] : "http_error";
  const stopReason = typeof details.stopReason === "string" && safeStopReasons[details.stopReason] === true
    ? details.stopReason as ScreeningEvalFailure["stopReason"] : undefined;
  return new ScreeningEvalError("execution", code, status, stopReason);
}
interface FrozenSuite {
  version: 1;
  purpose: "synthetic-heldout-screening";
  frozenAt: string;
  graderHash: string;
  fixtures: ScreeningEvalFixture[];
  pairs: ScreeningEvalPair[];
  suiteHash: string;
}
interface Selection { connectionId: string; provider: string; model: string; reasoningEffort: string | null }
interface StageRecord {
  stage: ScreeningStage; requestId: string; promptHash: string; taskPromptHash: string; schemaHash: string;
  resultHash: string; inputHash: string; connectionGeneration: number;
  validatedResultHash?: string;
  completedAt: string; elapsedMs: number;
  usage: { provider: string; model: string; inputTokens: number | null; outputTokens: number | null }[];
}
interface StageResponse extends Selection {
  stage: ScreeningStage; requestId: string; promptHash: string; taskPromptHash: string; result: unknown;
  execution: "device"; source: "device_reported"; effectivePolicy: ScreeningPolicy; inputHash: string;
  connectionGeneration: number; completedAt: string;
  usage: { provider?: string; model: string; inputTokens: number | null; outputTokens: number | null }[];
}
interface CaseReport {
  id: string;
  sourceHash: string;
  sourceHashes: Record<string, string>;
  labelHash: string;
  stages: StageRecord[];
  checks: EvalCheck[];
  error?: string;
  failure?: ScreeningEvalFailure;
  fit?: number | null;
  capability?: number | null;
  coverage?: number;
  verdict?: string;
  outcome?: "interview" | "reject";
}
export interface ScreeningEvalReport {
  version: 2;
  kind: "device-screening-eval";
  transport: "device_structured_output";
  evaluationUse: "development_regression";
  unseenHoldout: false;
  policyPromotionEligible: false;
  limitations: string[];
  reportId: string;
  startedAt: string;
  completedAt: string;
  suiteHash: string;
  rubricHash: string;
  harnessHash: string;
  graderHash: string;
  modelHash: string;
  selection: Selection;
  policy: ScreeningPolicy;
  policyHash: string;
  cases: CaseReport[];
  pairChecks: EvalCheck[];
  diagnostics: ScreeningBatchDiagnostics;
  artifactHash: string;
  passed: boolean;
  fullSuite: boolean;
  reportHash: string;
}

export function compareScreeningReports(baseline: ScreeningEvalReport, proposed: ScreeningEvalReport) {
  for (const report of [baseline, proposed]) {
    const { reportHash, ...body } = report;
    if (evalHash(body) !== reportHash || report.version !== 2 || report.kind !== "device-screening-eval") throw Error("Report integrity check failed");
  }
  if (baseline.reportId === proposed.reportId || baseline.suiteHash !== proposed.suiteHash ||
      evalHash(baseline.selection) !== evalHash(proposed.selection) || baseline.graderHash !== proposed.graderHash ||
      !baseline.fullSuite || !proposed.fullSuite || baseline.cases.length !== proposed.cases.length)
    throw Error("Comparison requires independent complete frozen holdouts with matched selection and graders");
  if (baseline.policyHash === proposed.policyHash && baseline.rubricHash === proposed.rubricHash)
    throw Error("Baseline and proposed must identify a policy or rubric change, not repeated sampling noise");
  const reference = new Map(baseline.cases.map(item => [item.id, item]));
  if (reference.size !== baseline.cases.length) throw Error("Baseline heldouts must be distinct");
  const observedIds = new Set<string>();
  const pairs: { baseline: number; proposed: number; outcome: "interview" | "reject" }[] = [];
  for (const candidate of proposed.cases) {
    const previous = reference.get(candidate.id);
    if (observedIds.has(candidate.id) || !previous || candidate.sourceHash !== previous.sourceHash || candidate.labelHash !== previous.labelHash || candidate.outcome !== previous.outcome)
      throw Error("Heldout source or label changed");
    observedIds.add(candidate.id);
    if (candidate.error || previous.error || [candidate, previous].some(item =>
      item.stages.map(stage => stage.stage).join(",") !== "evidence,capability,fit") ||
      candidate.fit === undefined || previous.fit === undefined)
      throw Error("Comparison requires three observed successful stages per heldout");
    if (candidate.stages.some(stage => previous.stages.some(prior => prior.requestId === stage.requestId))) throw Error("Baseline and proposed must be independently executed");
    if (candidate.outcome && previous.fit !== null && candidate.fit !== null)
      pairs.push({ baseline: previous.fit, proposed: candidate.fit, outcome: candidate.outcome });
  }
  const calibration = pairedPolicyCalibration(pairs);
  return {
    kind: "matched-regression-comparison", baselineReportHash: baseline.reportHash, proposedReportHash: proposed.reportHash,
    suiteHash: baseline.suiteHash, calibration,
    unknownLabeledPairs: proposed.cases.filter(candidate => candidate.outcome && (candidate.fit === null || reference.get(candidate.id)?.fit === null)).length,
    regression: [
      ...baseline.cases.flatMap(item => item.checks.filter(check => check.passed).filter(check =>
        !proposed.cases.find(candidate => candidate.id === item.id)?.checks.find(candidate => candidate.id === check.id)?.passed
      ).map(check => `${item.id}:${check.id}`)),
      ...baseline.pairChecks.filter(check => check.passed && !proposed.pairChecks.find(candidate => candidate.id === check.id)?.passed).map(check => check.id),
    ],
    proposedBehaviorPassed: proposed.passed,
    governanceAuthority: false,
    evaluationUse: "development_regression", unseenHoldout: false, policyPromotionEligible: false,
    interpretation: "These fixed synthetic cases have informed prompt/schema development. This is regression research, not unseen holdout evidence. Fresh independent heldouts and authenticated persisted governance trials are required before any rubric promotion.",
  };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    out: { type: "string" }, manifest: { type: "string" }, base: { type: "string", default: "http://127.0.0.1:3001" },
    origin: { type: "string" }, "session-file": { type: "string" }, connection: { type: "string" },
    policy: { type: "string" }, cases: { type: "string" }, baseline: { type: "string" }, proposed: { type: "string" },
    "authorize-real-inference": { type: "boolean", default: false }, help: { type: "boolean" },
  } });
  const command = positionals[0];
  if (values.help || !command) {
    console.log("screening-eval.ts freeze --out FILE\nscreening-eval.ts run --manifest FILE --out DIRECTORY --session-file COOKIE_HEADER_FILE --origin LOCAL_FRONTEND_ORIGIN --connection ID --authorize-real-inference [--cases ID,ID] [--policy JSON_FILE]\nscreening-eval.ts compare --baseline REPORT --proposed REPORT --out FILE\nExplicit run executes three real paid provider calls per case; no automatic retries. Cookie file contains the Cookie header value, not browser export JSON. Logs contain hashes, IDs and numeric grades only.");
    return;
  }
  if (!values.out) throw Error("--out is required; output files are exclusive-create and never overwritten");
  const graderHash = evalHash(await Promise.all([
    readFile(join(__dirname, "screening-eval-graders.ts"), "utf8"),
    readFile(join(__dirname, "../../src/career-agent/screening-calibration.ts"), "utf8"),
  ]));
  if (command === "freeze") {
    validateScreeningEvalFixtures(screeningEvalFixtures);
    const body = { version: 1 as const, purpose: "synthetic-heldout-screening" as const, frozenAt: new Date().toISOString(), graderHash, fixtures: screeningEvalFixtures, pairs: screeningEvalPairs };
    const suite = { ...body, suiteHash: evalHash(body) };
    await writeFile(resolve(values.out), JSON.stringify(suite, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ suiteHash: suite.suiteHash, cases: suite.fixtures.length }));
    return;
  }
  if (command === "compare") {
    if (!values.baseline || !values.proposed) throw Error("--baseline and --proposed are required");
    const result = compareScreeningReports(JSON.parse(await readFile(values.baseline, "utf8")), JSON.parse(await readFile(values.proposed, "utf8")));
    await writeFile(resolve(values.out), JSON.stringify({ ...result, comparisonHash: evalHash(result) }, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ status: result.calibration.status, regressions: result.regression.length, proposedBehaviorPassed: result.proposedBehaviorPassed, evaluationUse: result.evaluationUse, policyPromotionEligible: false }));
    if (result.calibration.status !== "improved" || result.regression.length || !result.proposedBehaviorPassed) process.exitCode = 1;
    return;
  }
  if (command !== "run") throw Error("Unknown command");
  if (!values["authorize-real-inference"] || !values.manifest || !values["session-file"] || !values.origin || !values.connection)
    throw Error("run requires frozen manifest, session file, local Origin, connection and explicit real-inference authorization");
  const base = new URL(values.base!);
  const origin = new URL(values.origin);
  if (![base, origin].every(url => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.username && !url.password))
    throw Error("Only loopback HTTP is allowed for this development harness");
  const cookie = (await readFile(values["session-file"], "utf8")).trim();
  if (!cookie || /[\r\n]/.test(cookie)) throw Error("Invalid session cookie header file");
  const suite: FrozenSuite = JSON.parse(await readFile(values.manifest, "utf8"));
  const { suiteHash, ...suiteBody } = suite;
  if (suite.version !== 1 || suite.purpose !== "synthetic-heldout-screening" || evalHash(suiteBody) !== suiteHash) throw Error("Frozen manifest integrity check failed");
  if (suite.graderHash !== graderHash) throw Error("Frozen graders changed; freeze a new independent suite before evaluating");
  validateScreeningEvalFixtures(suite.fixtures);
  if (new Set(suite.fixtures.map(fixture => fixture.id)).size !== suite.fixtures.length || suite.fixtures.some(fixture => fixture.split !== "heldout")) throw Error("Distinct heldout fixtures required");
  const selectedIds = values.cases ? new Set(values.cases.split(",")) : new Set(suite.fixtures.map(fixture => fixture.id));
  const fixtures = suite.fixtures.filter(fixture => selectedIds.has(fixture.id));
  if (!fixtures.length || fixtures.length !== selectedIds.size) throw Error("Unknown or empty case selection");
  const requestedPolicy: unknown = values.policy ? JSON.parse(await readFile(values.policy, "utf8")) : undefined;
  let effectivePolicy: ScreeningPolicy | undefined;
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const deadline = Date.now() + 600000;
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    for (;;) {
      if (Date.now() >= deadline) throw new ScreeningEvalError("execution", "request_timeout");
      let response: Response;
      try {
        response = await fetch(new URL(`/api/backend${path}`, base), {
          method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
          headers: { cookie, origin: origin.origin, "content-type": "application/json" },
          ...(serialized === undefined ? {} : { body: serialized }),
        });
      } catch (error) {
        throw new ScreeningEvalError("execution", error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "request_timeout" : "network_error");
      }
      if (!response.ok) {
        let details: unknown;
        try { details = await response.json(); } catch { /* Discard non-JSON bodies. */ }
        if (body !== undefined && response.status === 409 && details && typeof details === "object" &&
            "code" in details && details.code === "waiting_for_device") {
          // Same immutable request joins its durable task; it cannot start another paid attempt.
          await delay(2000);
          continue;
        }
        throw screeningEvalHttpError(response.status, details);
      }
      try { return await response.json(); }
      catch { throw new ScreeningEvalError("execution", "invalid_response_json", response.status); }
    }
  }
  const selection = await api<Selection>("/local-fixtures/screening-eval/selection");
  if (selection.connectionId !== values.connection || typeof selection.model !== "string" || !selection.model || typeof selection.provider !== "string" || !(selection.reasoningEffort === null || typeof selection.reasoningEffort === "string")) throw Error("Selected account pins unavailable");
  const startedAt = new Date().toISOString();
  const cases: CaseReport[] = [];
  const outputs = new Map<string, ScreeningEvalOutput>();
  const artifacts: Record<string, unknown> = {};
  const directory = resolve(values.out);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const fixture of fixtures) {
    const item: CaseReport = { id: fixture.id, sourceHash: evalHash(fixture.sources), sourceHashes: Object.fromEntries(Object.entries(fixture.sources).map(([key, value]) => [key, evalHash(value)])), labelHash: evalHash(fixture.expected), stages: [], checks: [], ...(fixture.expected.outcome ? { outcome: fixture.expected.outcome } : {}) };
    cases.push(item);
    let stage: ScreeningStage = "evidence";
    let activeRequestId: string | null = null;
    try {
      async function execute(buildPrompt: (policy: ScreeningPolicy) => string, schema: unknown, evidence?: ScreeningEvalOutput["evidence"]): Promise<string> {
        const requestId = randomUUID(), start = Date.now();
        activeRequestId = requestId;
        const response = await api<StageResponse>("/local-fixtures/screening-eval/stage", { connectionId: selection.connectionId, model: selection.model, reasoningEffort: selection.reasoningEffort, stage, sources: fixture.sources, ...(evidence ? { evidence } : {}), ...(requestedPolicy === undefined ? {} : { policy: requestedPolicy }), requestId });
        if (!response || typeof response !== "object")
          throw new ScreeningEvalError("provenance", "stage_provenance_mismatch");
        if (!response.effectivePolicy?.version || (effectivePolicy && evalHash(effectivePolicy) !== evalHash(response.effectivePolicy)))
          throw new ScreeningEvalError("provenance", "policy_mismatch");
        effectivePolicy = response.effectivePolicy;
        const prompt = buildPrompt(effectivePolicy);
        if (response.execution !== "device" || response.source !== "device_reported" || response.requestId !== requestId || response.stage !== stage || response.promptHash !== evalHash(prompt) ||
          response.taskPromptHash !== evalHash(prompt) ||
          response.connectionId !== selection.connectionId || response.provider !== selection.provider || response.model !== selection.model || response.reasoningEffort !== selection.reasoningEffort)
          throw new ScreeningEvalError("provenance", "stage_provenance_mismatch");
        if (!response.inputHash || !response.completedAt || !Array.isArray(response.usage) || !response.usage.length ||
          response.usage.some(usage => (usage.provider !== undefined && usage.provider !== selection.provider) || usage.model !== selection.model))
          throw new ScreeningEvalError("provenance", "model_attribution_mismatch");
        const raw = typeof response.result === "string" ? response.result : JSON.stringify(response.result);
        item.stages.push({ stage, requestId, promptHash: response.promptHash, taskPromptHash: response.taskPromptHash, schemaHash: evalHash(schema), resultHash: evalHash(raw),
          inputHash: response.inputHash, connectionGeneration: response.connectionGeneration, completedAt: response.completedAt,
          elapsedMs: Date.now() - start, usage: response.usage.map(({ model, inputTokens, outputTokens }) => ({ provider: response.provider, model, inputTokens, outputTokens })) });
        artifacts[`${fixture.id}:${stage}`] = response.result;
        return raw;
      }
      const evidenceRaw = await execute(policy => screeningEvidencePrompt(fixture.sources, policy, { delivery: "structured" }), screeningEvidenceSchema);
      const evidence = validateEvalStageArtifact(() => parseScreeningEvidence(evidenceRaw, fixture.sources));
      artifacts[`${fixture.id}:evidence:validated`] = evidence;
      item.stages[item.stages.length - 1].validatedResultHash = evalHash(evidence);
      stage = "capability";
      activeRequestId = null;
      const candidateSources = { candidate_cv: fixture.sources.candidate_cv, hidden_context: fixture.sources.hidden_context };
      const capabilityRaw = await execute(policy => candidateCapabilityPrompt(candidateSources, evidence, policy, { delivery: "structured" }), candidateCapabilitySchema, evidence);
      const capability = validateEvalStageArtifact(() => parseCandidateCapability(capabilityRaw, candidateSources, evidence, effectivePolicy));
      artifacts[`${fixture.id}:capability:validated`] = capability;
      item.stages[item.stages.length - 1].validatedResultHash = evalHash(capability);
      stage = "fit";
      activeRequestId = null;
      const fitRaw = await execute(policy => screeningPrompt(fixture.sources.candidate_cv, fixture.sources.job_description, fixture.sources.additional_context, { evidence, policy, delivery: "structured", hiddenContext: fixture.sources.hidden_context, hiringManager: fixture.sources.hiring_manager }), screeningAssessmentSchemaForSources(fixture.sources), evidence);
      const fit = validateEvalStageArtifact(() => parseScreeningAssessment(fitRaw, fixture.sources, { evidence, policy: effectivePolicy }));
      artifacts[`${fixture.id}:fit:validated`] = fit;
      item.stages[item.stages.length - 1].validatedResultHash = evalHash(fit);
      const output = { evidence, capability, fit };
      outputs.set(fixture.id, output);
      item.fit = fit.overall_score;
      item.capability = capability.score;
      item.coverage = fit.evidence_coverage;
      item.verdict = fit.recommendation;
      item.checks = gradeScreeningFixture(fixture, output);
    } catch (error) {
      item.failure = screeningEvalFailure(error, stage, activeRequestId);
      item.error = `${stage}_${item.failure.category}_failed`;
      item.checks.push({ id: "three-valid-isolated-stages", passed: false, observed: item.stages.map(record => record.stage), expected: ["evidence", "capability", "fit"] });
    }
    console.log(JSON.stringify({ case: item.id, stages: item.stages.length, fit: item.fit, capability: item.capability, failedChecks: item.checks.filter(check => !check.passed).map(check => check.id), ...(item.failure ? { failure: item.failure } : {}) }));
  }
  const pairChecks = gradeScreeningPairs(suite.pairs.filter(pair => selectedIds.has(pair.baseline) && selectedIds.has(pair.variant)), outputs);
  const body = {
    version: 2 as const, kind: "device-screening-eval" as const, reportId: randomUUID(), startedAt, completedAt: new Date().toISOString(),
    transport: "device_structured_output" as const,
    evaluationUse: "development_regression" as const, unseenHoldout: false as const, policyPromotionEligible: false as const,
    limitations: [
      "Model execution and usage are device-reported. Task/source hashes bind input identity; they do not independently attest provider execution.",
      "These fixed synthetic labels and observed failures have informed prompt/schema development; this run is regression smoke, not genuinely unseen heldout evaluation.",
      "A passing suite or improved matched calibration cannot approve policy. Rubric promotion requires fresh independent heldouts and the separate authenticated production governance workflow.",
    ],
    suiteHash, rubricHash: screeningRubricHash,
    harnessHash: evalHash(await readFile(__filename, "utf8")), graderHash,
    modelHash: evalHash({ provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort }),
    selection, policy: effectivePolicy ?? { version: screeningRubricHash }, policyHash: evalHash(effectivePolicy ?? { version: screeningRubricHash }), cases, pairChecks,
    diagnostics: screeningBatchDiagnostics(cases.map(item => ({ score: item.fit ?? null, evidenceCoverage: item.coverage, expectedOutcome: item.outcome })), "labeled_eval"),
    artifactHash: evalHash(artifacts), passed: cases.every(item => !item.error && item.checks.every(check => check.passed)) && pairChecks.every(check => check.passed),
    fullSuite: fixtures.length === suite.fixtures.length,
  };
  const report: ScreeningEvalReport = { ...body, reportHash: evalHash(body) };
  // Sensitive model artifacts are separate private files. Normal reports contain no source excerpts.
  await writeFile(join(directory, `${report.reportHash}.artifacts.json`), JSON.stringify(artifacts, null, 2), { flag: "wx", mode: 0o600 });
  await writeFile(join(directory, `${report.reportHash}.report.json`), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ reportHash: report.reportHash, passed: report.passed, cases: cases.length, fullSuite: report.fullSuite, evaluationUse: report.evaluationUse, unseenHoldout: false, policyPromotionEligible: false, reviewReasons: report.diagnostics.reviewReasons }));
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) void main().catch(() => {
  console.error("Screening eval failed before a complete report; verify local authorization, frozen inputs, endpoint availability and output paths. No source or credentials logged.");
  process.exitCode = 1;
});
