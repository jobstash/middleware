import { PostgresService } from "src/postgres/postgres.service";
import { ScreeningService } from "./screening.service";
import { candidateCapabilityFixture, screeningEvidenceFixture } from "./screening.fixture";
import { ScreeningStage } from "./screening-workflow";
import { leaseDeviceRequestFixture } from "./device-execution.fixture";

type StageJob = { id: string; request_id: string; current_stage: ScreeningStage; additional_context: string; candidate_cv: string; job_text: string; model: string; reasoning_effort: string | null; user_node_id: string; connection_id: string };

/** Drives real isolated stage requests; only provider inference is replaced with grounded fixtures. */
export async function persistScreeningJobFixture(
  db: PostgresService,
  screening: ScreeningService,
  runId: string,
  fit: (job: StageJob) => unknown,
  afterSave?: (job: StageJob, worker: string, receipt: unknown) => Promise<void>,
) {
  let jobId: string | undefined;
  const requests = new Set<string>();
  for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
    await db.transaction(manager => screening.enqueue(manager));
    const [job] = await db.query<StageJob>(`SELECT j.id,j.request_id,j.current_stage,j.additional_context,r.candidate_cv,j.job_text,j.model,j.reasoning_effort,r.user_node_id,r.connection_id
      FROM candidate_screening_jobs j JOIN candidate_screening_runs r ON r.id=j.run_id
      JOIN candidate_screening_stage_requests stage ON stage.request_id=j.request_id AND stage.job_id=j.id AND stage.stage=j.current_stage
      WHERE j.run_id=$1 AND j.status='running' AND ($2::uuid IS NULL OR j.id=$2) ORDER BY j.ordinal LIMIT 1`, [runId, jobId ?? null]);
    if (!job || requests.has(job.request_id)) throw new Error("Screening stage did not advance to a fresh request");
    jobId = job.id;
    requests.add(job.request_id);
    const worker = await leaseDeviceRequestFixture(db, job.request_id);
    await screening.schema(String(job.user_node_id), job.request_id, worker);
    const artifact = job.current_stage === "evidence" ? screeningEvidenceFixture(job.candidate_cv, job.job_text)
      : job.current_stage === "capability" ? candidateCapabilityFixture(job.candidate_cv) : fit(job);
    const receipt = await screening.persist(worker, job.request_id, artifact);
    await afterSave?.(job, worker, receipt);
    await db.transaction(async manager => {
      await manager.query("INSERT INTO candidate_agent_events(request_id,event) VALUES($1,$2)", [job.request_id, JSON.stringify({ type: "completed" })]);
      await manager.query("UPDATE candidate_agent_requests SET status='completed',finished_at=now() WHERE id=$1 AND status='running' AND worker_id=$2", [job.request_id, worker]);
      await manager.query("UPDATE candidate_ai_connections SET execution_lease=NULL,execution_lease_until=NULL WHERE id=$1 AND execution_lease=$2", [job.connection_id, job.request_id]);
    });
    if (job.current_stage === "fit") {
      await db.transaction(manager => screening.enqueue(manager));
      return receipt;
    }
  }
  throw new Error("Screening did not finish its fit stage");
}
