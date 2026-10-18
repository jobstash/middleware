export type CalibrationOutcome = "interview" | "reject";
export interface CalibrationPair {
  baseline: number;
  proposed: number;
  outcome: CalibrationOutcome;
}

function requireScore(score: number): void {
  if (!Number.isFinite(score) || score < 0 || score > 100)
    throw new Error("Calibration scores must be finite and between 0 and 100");
}

// Evidence of hiring suitability, not a probability of eventual employment.
// The caller is responsible for authenticated labels and source-matched heldouts.
export function pairedPolicyCalibration(pairs: readonly CalibrationPair[]): {
  status: "pending" | "improved" | "not_improved";
  pairCount: number;
  baselineLoss: number | null;
  proposedLoss: number | null;
} {
  let baseline = 0;
  let proposed = 0;
  const outcomes = new Set<CalibrationOutcome>();
  for (const pair of pairs) {
    requireScore(pair.baseline);
    requireScore(pair.proposed);
    if (pair.outcome !== "interview" && pair.outcome !== "reject")
      throw new Error("Calibration requires a verified interview or reject outcome");
    const target = pair.outcome === "interview" ? 1 : 0;
    baseline += (pair.baseline / 100 - target) ** 2;
    proposed += (pair.proposed / 100 - target) ** 2;
    outcomes.add(pair.outcome);
  }
  const baselineLoss = pairs.length ? baseline / pairs.length : null;
  const proposedLoss = pairs.length ? proposed / pairs.length : null;
  return {
    status: pairs.length < 4 || outcomes.size < 2 ? "pending"
      : proposedLoss! < baselineLoss! ? "improved" : "not_improved",
    pairCount: pairs.length,
    baselineLoss,
    proposedLoss,
  };
}

export interface CalibrationObservation {
  score: number | null;
  expectedOutcome?: CalibrationOutcome;
  evidenceCoverage?: number;
}

export interface ScreeningBatchDiagnostics {
  population: "eligible_shortlist" | "whole_pool" | "labeled_eval";
  count: number;
  scored: number;
  unknown: number;
  histogram: { min: number; max: number; count: number }[];
  highScoreFraction: number | null;
  extremeScoreFraction: number | null;
  labeledRejectCount: number;
  highScoringLabeledRejectCount: number;
  unsupportedHighCount: number;
  reviewRequired: boolean;
  reviewReasons: string[];
  interpretation: string;
}

export function screeningBatchDiagnostics(
  observations: readonly CalibrationObservation[],
  population: "eligible_shortlist" | "whole_pool" | "labeled_eval",
): ScreeningBatchDiagnostics {
  const histogram = [0, 0, 0, 0, 0];
  let scored = 0, high = 0, extreme = 0, unsupportedHigh = 0;
  let rejects = 0, inflatedRejects = 0;
  for (const observation of observations) {
    if (observation.evidenceCoverage !== undefined) requireScore(observation.evidenceCoverage);
    if (observation.score === null) continue;
    requireScore(observation.score);
    scored++;
    histogram[Math.min(4, Math.floor(observation.score / 20))]++;
    if (observation.score >= 80) high++;
    if (observation.score >= 90) {
      extreme++;
      if (observation.evidenceCoverage !== undefined && observation.evidenceCoverage < 100) unsupportedHigh++;
    }
    if (observation.expectedOutcome === "reject") {
      rejects++;
      if (observation.score >= 80) inflatedRejects++;
    }
  }
  const reviewReasons: string[] = [];
  if (scored >= 8 && Math.max(...histogram) / scored >= 0.8)
    reviewReasons.push("score_concentration");
  if (unsupportedHigh) reviewReasons.push("incomplete_evidence_90_plus");
  if (inflatedRejects) reviewReasons.push("high_scores_on_labeled_rejects");
  return {
    population, count: observations.length, scored, unknown: observations.length - scored,
    histogram: histogram.map((count, i) => ({ min: i * 20, max: i === 4 ? 100 : i * 20 + 19.999, count })),
    highScoreFraction: scored ? high / scored : null,
    extremeScoreFraction: scored ? extreme / scored : null,
    labeledRejectCount: rejects, highScoringLabeledRejectCount: inflatedRejects,
    unsupportedHighCount: unsupportedHigh, reviewRequired: reviewReasons.length > 0, reviewReasons,
    interpretation: population === "eligible_shortlist"
      ? "Selection-conditioned shortlist: concentration is a review signal, not population inflation or a quota violation."
      : "Review concentration against labeled evidence and sampling; no target distribution, score adjustment or automatic failure.",
  };
}
