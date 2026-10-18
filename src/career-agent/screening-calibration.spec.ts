import { pairedPolicyCalibration, screeningBatchDiagnostics } from "./screening-calibration";

describe("Evidence-based screening calibration", () => {
  it("requires four heldouts and both outcome classes instead of approving a favorable slice", () => {
    expect(pairedPolicyCalibration([{ baseline: 90, proposed: 20, outcome: "reject" }]).status).toBe("pending");
    expect(pairedPolicyCalibration(Array.from({ length: 4 }, () => ({ baseline: 90, proposed: 20, outcome: "reject" as const }))).status).toBe("pending");
  });
  it("measures matched Brier improvement without manufacturing a target distribution", () => {
    const result = pairedPolicyCalibration([
      { baseline: 80, proposed: 30, outcome: "reject" },
      { baseline: 70, proposed: 20, outcome: "reject" },
      { baseline: 60, proposed: 85, outcome: "interview" },
      { baseline: 70, proposed: 90, outcome: "interview" },
    ]);
    expect(result.status).toBe("improved");
    expect(result.baselineLoss).toBeCloseTo(0.345);
    expect(result.proposedLoss).toBeCloseTo(0.040625);
  });
  it("rejects unchanged or worse policies after sufficient matched coverage", () => {
    const unchanged = [0, 1, 2, 3].map(index => ({ baseline: 75, proposed: 75, outcome: index % 2 ? "interview" as const : "reject" as const }));
    expect(pairedPolicyCalibration(unchanged).status).toBe("not_improved");
    expect(pairedPolicyCalibration(unchanged.map(pair => ({ ...pair, proposed: pair.outcome === "interview" ? 0 : 100 }))).status).toBe("not_improved");
  });
  it.each([NaN, Infinity, -1, 101])("rejects invalid score %s rather than clamping it", score => {
    expect(() => pairedPolicyCalibration([{ baseline: score, proposed: 50, outcome: "reject" }])).toThrow();
    expect(() => screeningBatchDiagnostics([{ score }], "whole_pool")).toThrow();
  });
  it("flags concentration for review but does not call a selected strong shortlist inflated", () => {
    const observations = Array.from({ length: 10 }, () => ({ score: 94, evidenceCoverage: 100, expectedOutcome: "interview" as const }));
    const result = screeningBatchDiagnostics(observations, "eligible_shortlist");
    expect(result.reviewReasons).toEqual(["score_concentration"]);
    expect(result.highScoringLabeledRejectCount).toBe(0);
    expect(result.histogram[4].count).toBe(10);
    expect(observations.every(observation => observation.score === 94)).toBe(true);
  });
  it("finds evidence inflation independently of concentration and retains unknowns", () => {
    const result = screeningBatchDiagnostics([
      { score: 95, evidenceCoverage: 60, expectedOutcome: "reject" },
      { score: 40, evidenceCoverage: 80, expectedOutcome: "reject" },
      { score: null },
    ], "labeled_eval");
    expect(result.reviewReasons).toEqual(["incomplete_evidence_90_plus", "high_scores_on_labeled_rejects"]);
    expect(result.unknown).toBe(1);
    expect(result.highScoreFraction).toBe(0.5);
    expect(result.highScoringLabeledRejectCount).toBe(1);
  });
  it("does not infer evidence or scores for an empty batch", () => {
    expect(screeningBatchDiagnostics([], "whole_pool")).toMatchObject({ scored: 0, highScoreFraction: null, reviewRequired: false });
    expect(pairedPolicyCalibration([])).toEqual({ status: "pending", pairCount: 0, baselineLoss: null, proposedLoss: null });
  });
});
