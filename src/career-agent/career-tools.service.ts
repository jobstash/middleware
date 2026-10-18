import { ForbiddenException, Injectable } from "@nestjs/common";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { ScreeningService } from "./screening.service";
import { CandidateCapabilityService } from "./candidate-capabilities.service";
import { CandidateInvocationContext } from "./candidate-context";
import { deviceSourceScopeSql } from "./device-execution.protocol";

@Injectable()
export class CareerToolService {
  constructor(
    private readonly career: CareerRepository,
    private readonly db: PostgresService,
    private readonly capabilities: CandidateCapabilityService,
    private readonly screening: ScreeningService,
  ) {}
  async mcp(
    worker: string,
    id: string,
    message: {
      jsonrpc: string;
      id?: string | number;
      method: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    },
  ): Promise<unknown> {
    const [job] = await this.db.query<{
      wallet: string;
      user_node_id: string;
      screening: boolean;
      research: boolean;
    }>(
      `SELECT u.properties->>'wallet' AS wallet,r.user_node_id::text,(s.object_kind IS NOT DISTINCT FROM 'mcp_research') AS research,(r.request_kind IS NOT DISTINCT FROM 'screening' OR s.object_kind IS NOT DISTINCT FROM 'screening_job' OR EXISTS(SELECT 1 FROM candidate_screening_stage_requests screening WHERE screening.request_id=r.id)) AS screening
       FROM candidate_agent_requests r JOIN graph_nodes u ON u.id=r.user_node_id
       JOIN candidate_agent_sessions s ON s.id=r.session_id AND s.user_node_id=r.user_node_id
       JOIN candidate_ai_connections c ON c.id=s.connection_id AND c.user_node_id=r.user_node_id AND c.status='connected'
       JOIN candidate_devices d ON d.id=r.device_id AND d.user_node_id=r.user_node_id AND d.status='active'
       WHERE r.id=$1 AND r.worker_id=$2 AND r.status='running' AND r.heartbeat_at>now()-interval '45 seconds'
         AND c.public_state->>'execution'='device' AND c.device_id=r.device_id AND c.generation=r.connection_generation
         AND c.execution_lease=r.id AND c.execution_lease_until>clock_timestamp()
         AND ${deviceSourceScopeSql("r")}`,
      [id, worker],
    );
    if (!job) throw new ForbiddenException("Inactive request");
    const context: CandidateInvocationContext = { kind: "worker", owner: job.user_node_id, wallet: job.wallet, workerId: worker, agentRequestId: id };
    if (job.research) {
      await this.career.requireAdvanced(job.user_node_id);
      const [research] = await this.db.query<{ grant_id: string }>(
        "SELECT grant_id FROM mcp_research_requests WHERE request_id=$1 AND user_node_id=$2",
        [id, job.user_node_id],
      );
      if (!research) throw new ForbiddenException("Research authorization is unavailable");
      await this.career.authorizeCandidateGrant(research.grant_id, job.user_node_id, undefined, ["data:read"]);
    } else {
      await this.career.authorizeCandidate(context, true);
    }
    const reply = (result: unknown): unknown => ({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        resultType: "complete",
        ...(result as Record<string, unknown>),
      },
    });
    if (message.method === "server/discover")
      return reply({
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: {} },
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "jobstash",
            version: "1.0.0",
          },
        },
      });
    if (message.method === "initialize")
      return reply({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "jobstash", version: "1.0.0" },
      });
    if (message.method === "notifications/initialized") return null;
    if (job.research) {
      if (message.method === "tools/list") return reply({ tools: [] });
      throw new ForbiddenException(
        "Research may only use the records supplied to this request",
      );
    }
    if (job.screening) {
      if (message.method === "tools/list")
        return reply({
          tools: [
            {
              name: "job_screening_save",
              description:
                "Persist the raw artifact for this request's current screening stage. Stage, inputs and ownership are bound server-side; do not wrap arguments in an envelope. Retry corrected exact excerpts if rejected. A saved intermediate stage completes this request, not the whole job. No other tools are permitted.",
              inputSchema: await this.screening.schema(job.user_node_id, id, worker),
            },
          ],
        });
      if (
        message.method === "tools/call" &&
        message.params?.name === "job_screening_save"
      ) {
        try {
          const saved = await this.screening.persist(
            worker,
            id,
            message.params.arguments,
          );
          return reply({
            content: [{ type: "text", text: JSON.stringify(saved) }],
          });
        } catch (error) {
          console.error(
            "Screening persistence rejected",
            error instanceof Error ? `${error.name}: ${error.message.split(":")[0].slice(0, 200)}` : "Error",
          );
          return reply({
            isError: true,
            content: [
              {
                type: "text",
                text:
                  error instanceof Error
                    ? error.message
                    : "Unable to save assessment",
              },
            ],
          });
        }
      }
      throw new ForbiddenException(
        "Only private assessment persistence is allowed for this request",
      );
    }
    if (message.method === "tools/list") {
      const tools = await this.capabilities.catalog(context);
      return reply({ tools: tools.map(({ name, description, inputSchema, mutation }) => ({ name, description, inputSchema, annotations: { readOnlyHint: !mutation } })) });
    }
    if (message.method !== "tools/call") return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Tool not allowed" } };
    try {
      const { data } = await this.capabilities.invoke(context, message.params?.name ?? "", message.params?.arguments ?? {});
      return reply({ content: [{ type: "text", text: JSON.stringify(data) }] });
    } catch (error) {
      return reply({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed" }] });
    }
  }
}
