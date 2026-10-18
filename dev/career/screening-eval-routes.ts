import * as Ajv from "ajv";
import { BadRequestException, ConflictException, ForbiddenException, HttpException } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { AuthService } from "../../src/auth/auth.service";
import { AgentService } from "../../src/career-agent/agent.service";
import { CareerRepository } from "../../src/career-agent/career.repository";
import { PostgresService } from "../../src/postgres/postgres.service";
import { screeningAssessmentSchemaForSources, screeningMetrics, screeningPrompt, screeningRubricHash } from "../../src/career-agent/job-screening";
import { candidateCapabilityPrompt, candidateCapabilitySchema, parseScreeningEvidence, screeningEvidencePrompt, screeningEvidenceSchema,
  type ScreeningPolicy, type ScreeningSources, type ScreeningStage } from "../../src/career-agent/screening-workflow";
import { governanceGuidance } from "../../src/career-agent/screening-governance.dto";

const uuid = { type: "string", format: "uuid" };
const source = { type: "string", maxLength: 1_000_000 };
const acceptedGuidance = [...Object.keys(governanceGuidance), ...screeningMetrics.flatMap(metric => Object.values(governanceGuidance).map(rule => `Dimension: ${metric}. ${rule}`))];
const validate = new Ajv({ allErrors: true }).compile({
  type: "object", additionalProperties: false,
  required: ["requestId", "connectionId", "model", "reasoningEffort", "stage", "sources"],
  properties: {
    requestId: uuid, connectionId: uuid,
    model: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" },
    reasoningEffort: { type: ["string", "null"], maxLength: 32, pattern: "^[A-Za-z0-9_-]+$" },
    stage: { enum: ["evidence", "capability", "fit"] },
    sources: { type: "object", additionalProperties: false, required: ["candidate_cv", "job_description", "additional_context"], properties: {
      candidate_cv: { ...source, minLength: 1 }, job_description: source, additional_context: source,
      hidden_context: source, hiring_manager: source,
    } },
    evidence: { type: "object" },
    policy: { type: "object", additionalProperties: false, properties: {
      version: { type: "string", minLength: 1, maxLength: 200 },
      weights: { type: "object", additionalProperties: false, required: screeningMetrics,
        properties: Object.fromEntries(screeningMetrics.map(metric => [metric, { type: "number", minimum: 1, maximum: 100 }])) },
      guidance: { enum: acceptedGuidance },
    } },
  },
});
interface EvalInput {
  requestId: string; connectionId: string; model: string; reasoningEffort: string | null; stage: ScreeningStage;
  sources: ScreeningSources; evidence?: unknown; policy?: Partial<ScreeningPolicy>;
}

/** Development harness only. Synthetic eval sources never update candidate or employer records. */
export function installScreeningEvalRoutes(app: NestExpressApplication, services: {
  agent: AgentService; auth: AuthService; career: CareerRepository; db: PostgresService;
}): void {
  async function selected(request: Request, response: Response) {
    if (process.env.LOCAL_ONLY !== "true" || process.env.NODE_ENV !== "development")
      throw new ForbiddenException("Device evaluations require the local development runtime.");
    if ((request.method !== "GET" || request.headers.origin) && request.headers.origin !== process.env.RECRUITERS_PUBLIC_ORIGIN)
      throw new ForbiddenException("The evaluation origin is not authorized.");
    const session = await services.auth.getSession(request, response);
    if (!session?.address || !session.permissions?.includes("USER")) throw new ForbiddenException("Sign in to run evaluations.");
    const owner = await services.career.owner(session.address);
    await services.career.requireAdvanced(owner);
    const [connection] = await services.db.query<{ id: string; provider: string; public_state: Record<string, unknown> }>(
      `SELECT c.id,c.provider,c.public_state FROM candidate_ai_connections c
       JOIN candidate_devices d ON d.id=c.device_id AND d.user_node_id=c.user_node_id AND d.status='active'
       WHERE c.user_node_id=$1 AND c.status='connected' AND c.provider IN ('codex','openai','anthropic')
       AND c.public_state->>'execution'='device' ORDER BY c.created_at DESC,c.id LIMIT 1`, [owner]);
    if (!connection || typeof connection.public_state.model !== "string" || !Object.hasOwn(connection.public_state, "reasoningEffort"))
      throw new ConflictException("Save your model and thinking-effort selection before running evaluations.");
    const effort = connection.public_state.reasoningEffort;
    if (effort !== null && typeof effort !== "string") throw new ConflictException("The saved thinking-effort selection is invalid.");
    return { owner: String(owner), connectionId: connection.id, provider: connection.provider, model: connection.public_state.model, reasoningEffort: effort as string | null };
  }
  function fail(response: Response, error: unknown) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const message = error instanceof HttpException ? error.message : "The live evaluation failed. No automatic paid retry was attempted.";
    const details = error instanceof HttpException ? error.getResponse() : null;
    const metadata = details && typeof details === "object" ? details as Record<string, unknown> : {};
    const code = typeof metadata.code === "string" &&
      ["waiting_for_device", "invalid_json_output", "incomplete_response", "stage_timeout", "provider_execution_failed"].includes(metadata.code)
      ? metadata.code : "screening_eval_failed";
    const stopReason = typeof metadata.stopReason === "string" &&
      ["max_tokens", "max_agent_steps", "cancelled", "error"].includes(metadata.stopReason) ? metadata.stopReason : undefined;
    response.status(status).json({ error: message, code, ...(stopReason ? { stopReason } : {}) });
  }
  app.getHttpAdapter().get("/local-fixtures/screening-eval/selection", async (request: Request, response: Response) => {
    try {
      const { owner: _owner, ...selection } = await selected(request, response);
      response.setHeader("Cache-Control", "no-store");
      response.json({ ...selection, execution: "device", source: "device_reported", rubricHash: screeningRubricHash });
    } catch (error) { fail(response, error); }
  });
  app.getHttpAdapter().post("/local-fixtures/screening-eval/stage", async (request: Request, response: Response) => {
    try {
      if (!validate(request.body) || Buffer.byteLength(JSON.stringify(request.body)) > 4 * 1024 * 1024)
        throw new BadRequestException("Use a bounded structured evaluation input; raw prompts and schemas are not accepted.");
      const input = request.body as EvalInput;
      let context: unknown;
      try { context = JSON.parse(input.sources.additional_context || "{}"); }
      catch { throw new BadRequestException("Additional context must contain a JSON object, matching the production screening input."); }
      if (!context || typeof context !== "object" || Array.isArray(context))
        throw new BadRequestException("Additional context must contain a JSON object, matching the production screening input.");
      const selection = await selected(request, response);
      if (selection.connectionId !== input.connectionId || selection.model !== input.model || selection.reasoningEffort !== input.reasoningEffort)
        throw new ConflictException("The selected model or account changed. Freeze a new evaluation run with the current selection.");
      const requestedGuidance = input.policy?.guidance;
      const guidance = requestedGuidance && Object.hasOwn(governanceGuidance, requestedGuidance)
        ? governanceGuidance[requestedGuidance as keyof typeof governanceGuidance] : requestedGuidance;
      const overrides = { weights: input.policy?.weights, guidance };
      const effectivePolicy: ScreeningPolicy = overrides.weights || overrides.guidance
        ? { ...overrides, version: `eval-${createHash("sha256").update(JSON.stringify({ rubric: screeningRubricHash, ...overrides })).digest("hex")}` }
        : { version: screeningRubricHash };
      const evidence = input.stage === "evidence" ? undefined : parseScreeningEvidence(JSON.stringify(input.evidence), input.sources);
      const prompt = input.stage === "evidence" ? screeningEvidencePrompt(input.sources, effectivePolicy, { delivery: "structured" })
        : input.stage === "capability" ? candidateCapabilityPrompt({ candidate_cv: input.sources.candidate_cv, hidden_context: input.sources.hidden_context }, evidence!, effectivePolicy, { delivery: "structured" })
          : screeningPrompt(input.sources.candidate_cv, input.sources.job_description, input.sources.additional_context, {
            evidence: evidence!, policy: effectivePolicy, hiddenContext: input.sources.hidden_context, hiringManager: input.sources.hiring_manager, delivery: "structured",
          });
      const schema = input.stage === "evidence" ? screeningEvidenceSchema : input.stage === "capability" ? candidateCapabilitySchema : screeningAssessmentSchemaForSources(input.sources);
      const receipt = await services.agent.evaluateScreeningStage({ owner: selection.owner, id: input.requestId,
        connectionId: input.connectionId, model: input.model, reasoningEffort: input.reasoningEffort, stage: input.stage, prompt, schema });
      response.setHeader("Cache-Control", "no-store");
      response.json({ ...receipt, provider: selection.provider, execution: "device", source: "device_reported", effectivePolicy, evaluationOnly: true });
    } catch (error) { fail(response, error); }
  });
}
