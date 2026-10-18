import { compareScreeningReports, evalHash, ScreeningEvalReport, ScreeningEvalError, screeningEvalFailure, screeningEvalHttpError, validateEvalStageArtifact } from "../../dev/career/screening-eval";
import { screeningBatchDiagnostics } from "./screening-calibration";

// Fabricated numeric records exercise report validation only; they are never
// written as CLI reports or presented as evidence that a model was evaluated.
function report(proposed: boolean): ScreeningEvalReport {
  const policy = { version: proposed ? "proposal" : "baseline" };
  const body: Omit<ScreeningEvalReport, "reportHash"> = {
    version: 2, kind: "device-screening-eval", transport: "device_structured_output", reportId: proposed ? "new-run" : "old-run",
    evaluationUse: "development_regression", unseenHoldout: false, policyPromotionEligible: false, limitations: ["Synthetic regression input, not model quality proof."],
    startedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T11:00:00.000Z",
    suiteHash: "frozen-suite", rubricHash: "rubric", harnessHash: "harness", graderHash: "grader", modelHash: "model",
    selection: { connectionId: "owned-connection", provider: "codex", model: "selected-model", reasoningEffort: "low" },
    policy, policyHash: evalHash(policy),
    cases: ["a", "b", "c", "d"].map((id, index) => ({
      id, sourceHash: `sources-${id}`, sourceHashes: { candidate_cv: `cv-${id}` }, labelHash: `label-${id}`,
      stages: (["evidence", "capability", "fit"] as const).map(stage => ({
        stage, requestId: `${proposed ? "new" : "old"}-${id}-${stage}`, promptHash: `${stage}-prompt`, taskPromptHash: `${stage}-task-prompt`, schemaHash: `${stage}-schema`,
        resultHash: `${id}-${stage}-result`, inputHash: `${id}-${stage}-input`, connectionGeneration: 1,
        completedAt: "2026-10-01T10:30:00.000Z", elapsedMs: 1000,
        usage: [{ provider: "codex", model: "selected-model", inputTokens: 10, outputTokens: 10 }],
      })),
      checks: [{ id: "behavior", passed: true, observed: true, expected: true }],
      fit: proposed ? index < 2 ? 20 : 90 : index < 2 ? 70 : 60,
      capability: 80, coverage: 100, verdict: index < 2 ? "reject" : "interview", outcome: index < 2 ? "reject" : "interview",
    })),
    pairChecks: [{ id: "stable-capability", passed: true, observed: 0, expected: 5 }],
    diagnostics: screeningBatchDiagnostics([], "labeled_eval"), artifactHash: "private-artifacts",
    passed: true, fullSuite: true,
  };
  return { ...body, reportHash: evalHash(body) };
}
function reseal(value: ScreeningEvalReport): ScreeningEvalReport {
  const { reportHash: _previous, ...body } = value;
  return { ...body, reportHash: evalHash(body) };
}

describe("Frozen matched screening report comparisons", () => {
  it("retains request identity and HTTP status when execution failed before an artifact existed", () => {
    const requestId = "3eaecf5b-6901-4bd2-a1d7-846b25d60172";
    const failure = screeningEvalFailure(new ScreeningEvalError("execution", "http_error", 502), "fit", requestId);
    expect(failure).toEqual({ stage: "fit", requestId, category: "execution", code: "http_error", httpStatus: 502 });
  });
  it("retains only allowlisted endpoint codes and stop reasons, never upstream text", () => {
    const safe = screeningEvalFailure(screeningEvalHttpError(503, {
      code: "incomplete_response", stopReason: "max_tokens", error: "secret provider text",
    }), "fit", "3eaecf5b-6901-4bd2-a1d7-846b25d60172");
    expect(safe).toEqual({ stage: "fit", requestId: "3eaecf5b-6901-4bd2-a1d7-846b25d60172", category: "execution", code: "incomplete_response", stopReason: "max_tokens", httpStatus: 503 });
    const rejected = screeningEvalFailure(screeningEvalHttpError(502, {
      code: "private source and account token", stopReason: "private source", message: "raw upstream response",
    }), "evidence", null);
    expect(rejected).toEqual({ stage: "evidence", requestId: null, category: "execution", code: "http_error", httpStatus: 502 });
  });
  it("distinguishes invalid model artifacts without retaining parser input or exception messages", () => {
    let failure;
    try { validateEvalStageArtifact(() => JSON.parse("sensitive CV source")); }
    catch (error) { failure = screeningEvalFailure(error, "evidence", "3eaecf5b-6901-4bd2-a1d7-846b25d60172"); }
    expect(failure).toEqual({ stage: "evidence", requestId: "3eaecf5b-6901-4bd2-a1d7-846b25d60172", category: "validation", code: "invalid_stage_artifact" });
    expect(JSON.stringify(failure)).not.toContain("sensitive CV");
    const unknown = screeningEvalFailure(new Error("provider echoed sensitive CV source and account secret"), "capability", null);
    expect(unknown).toEqual({ stage: "capability", requestId: null, category: "internal", code: "local_evaluation_error" });
  });
  it("computes improvement only from distinct observed matched heldouts", () => {
    const comparison = compareScreeningReports(report(false), report(true));
    expect(comparison.calibration.status).toBe("improved");
    expect(comparison.calibration.pairCount).toBe(4);
    expect(comparison.governanceAuthority).toBe(false);
    expect(comparison.regression).toEqual([]);
  });
  it("excludes unknown labeled pairs instead of converting an unknown aggregate into zero loss", () => {
    const proposed = report(true);
    proposed.cases[0].fit = null;
    const comparison = compareScreeningReports(report(false), reseal(proposed));
    expect(comparison.unknownLabeledPairs).toBe(1);
    expect(comparison.calibration.pairCount).toBe(3);
    expect(comparison.calibration.status).toBe("pending");
    expect(comparison.calibration.baselineLoss).toBeCloseTo(0.27);
  });
  it("detects edited report bytes rather than trusting its old digest", () => {
    const proposed = report(true);
    proposed.cases[0].fit = 0;
    expect(() => compareScreeningReports(report(false), proposed)).toThrow("integrity");
  });
  it.each(["source", "label", "effort", "subset", "stage", "request", "duplicate", "unchanged-policy"])("rejects unmatched %s provenance even when rehashed", kind => {
    const baseline = report(false), proposed = report(true);
    if (kind === "source") proposed.cases[0].sourceHash = "different-source";
    if (kind === "label") proposed.cases[0].labelHash = "different-label";
    if (kind === "effort") proposed.selection.reasoningEffort = "high";
    if (kind === "subset") proposed.fullSuite = false;
    if (kind === "stage") proposed.cases[0].stages[1].stage = "evidence";
    if (kind === "request") proposed.cases[0].stages[0].requestId = baseline.cases[0].stages[0].requestId;
    if (kind === "duplicate") proposed.cases[1] = proposed.cases[0];
    if (kind === "unchanged-policy") { proposed.policy = baseline.policy; proposed.policyHash = baseline.policyHash; }
    expect(() => compareScreeningReports(baseline, reseal(proposed))).toThrow();
  });
  it("reports a behavioral regression even if average calibration improved", () => {
    const proposed = report(true);
    proposed.cases[0].checks[0].passed = false;
    proposed.pairChecks[0].passed = false;
    proposed.passed = false;
    const comparison = compareScreeningReports(report(false), reseal(proposed));
    expect(comparison.calibration.status).toBe("improved");
    expect(comparison.regression).toEqual(["a:behavior", "stable-capability"]);
    expect(comparison.proposedBehaviorPassed).toBe(false);
  });
});
