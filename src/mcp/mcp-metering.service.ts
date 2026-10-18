import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";

// Produced only by verified subscription policy, never from a tool argument.
export interface McpAllowance {
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  limit: number;
  unit: "calls" | "records";
}
export type McpAllowanceReader = (
  db: EntityManager,
  owner: string,
) => Promise<McpAllowance>;
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(k => JSON.stringify(k) + ":" + stable(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
@Injectable()
export class McpMeteringService {
  constructor(private readonly db: PostgresService) {}
  async execute(
    input: {
      owner: string;
      requestId: string;
      tool: string;
      arguments: Record<string, unknown>;
      maxRecords: number;
    },
    allowance: McpAllowanceReader,
    work: () => Promise<{
      data: unknown;
      records: number;
      // Database writes only: saved with the receipt after the final access checks.
      // Preparation and any network work must happen before this callback.
      commit?: (db: EntityManager) => Promise<void>;
    }>,
  ) {
    if (
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.requestId) ||
      !Number.isInteger(input.maxRecords) ||
      input.maxRecords < 1 ||
      input.maxRecords > 100
    )
      throw new ConflictException("Invalid metered request");
    const inputHash = createHash("sha256")
      .update(
        stable({
          tool: input.tool,
          arguments: input.arguments,
          maxRecords: input.maxRecords,
        }),
      )
      .digest("hex");
    const claim = randomUUID();
    const reserved = await this.db.transaction(async db => {
      const plan = await allowance(db, input.owner);
      this.check(plan);
      // The owner lock also prevents the same request being claimed in two billing periods.
      await db.query("SELECT id FROM graph_nodes WHERE id=$1 FOR UPDATE", [
        input.owner,
      ]);
      const [previous] = await db.query(
        "SELECT * FROM mcp_usage_receipts WHERE user_node_id=$1 AND request_id=$2",
        [input.owner, input.requestId],
      );
      if (previous && previous.input_hash !== inputHash)
        throw new ConflictException(
          "This request ID was already used for different arguments",
        );
      if (previous?.state === "completed") return { cached: previous.response };
      if (
        previous?.state === "pending" &&
        new Date(previous.expires_at) > new Date()
      )
        throw new ConflictException(
          "This request is already running; retry with the same request ID",
        );
      // Release abandoned claims. A late worker cannot save against its expired claim.
      const stale = await db.query(
        "SELECT * FROM mcp_usage_receipts WHERE user_node_id=$1 AND state='pending' AND expires_at<=now() FOR UPDATE",
        [input.owner],
      );
      for (const row of stale) {
        await db.query(
          "UPDATE mcp_usage_periods SET reserved=reserved-$2 WHERE id=$1",
          [row.period_id, row.reserved],
        );
        await db.query(
          "UPDATE mcp_usage_receipts SET state='failed',reserved=0 WHERE user_node_id=$1 AND request_id=$2",
          [input.owner, row.request_id],
        );
      }
      await db.query(
        `INSERT INTO mcp_usage_periods(id,user_node_id,subscription_id,period_start,period_end,unit,quota) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(user_node_id,subscription_id,period_start) DO UPDATE SET quota=EXCLUDED.quota,period_end=EXCLUDED.period_end`,
        [
          randomUUID(),
          input.owner,
          plan.subscriptionId,
          plan.periodStart,
          plan.periodEnd,
          plan.unit,
          plan.limit,
        ],
      );
      const [period] = await db.query(
        "SELECT * FROM mcp_usage_periods WHERE user_node_id=$1 AND subscription_id=$2 AND period_start=$3 FOR UPDATE",
        [input.owner, plan.subscriptionId, plan.periodStart],
      );
      if (period.unit !== plan.unit)
        throw new ServiceUnavailableException(
          "Usage unit cannot change within a billing period",
        );
      const units = plan.unit === "calls" ? 1 : input.maxRecords;
      if (Number(period.used) + Number(period.reserved) + units > plan.limit)
        throw new HttpException(
          "Your data allowance is exhausted for this period",
          429,
        );
      await db.query(
        "UPDATE mcp_usage_periods SET reserved=reserved+$2 WHERE id=$1",
        [period.id, units],
      );
      await db.query(
        `INSERT INTO mcp_usage_receipts(user_node_id,request_id,period_id,tool,input_hash,state,claim_id,reserved,expires_at)
    VALUES($1,$2,$3,$4,$5,'pending',$6,$7,now()+interval '60 seconds') ON CONFLICT(user_node_id,request_id) DO UPDATE SET period_id=EXCLUDED.period_id,state='pending',claim_id=EXCLUDED.claim_id,reserved=EXCLUDED.reserved,expires_at=EXCLUDED.expires_at`,
        [
          input.owner,
          input.requestId,
          period.id,
          input.tool,
          inputHash,
          claim,
          units,
        ],
      );
      return { period: period.id, plan, units };
    });
    if ("cached" in reserved) return reserved.cached;
    try {
      const output = await work();
      if (
        !Number.isInteger(output.records) ||
        output.records < 0 ||
        output.records > input.maxRecords ||
        Buffer.byteLength(JSON.stringify(output.data)) > 1000000
      )
        throw new ServiceUnavailableException("Invalid data response");
      return await this.db.transaction(async db => {
        const current = await allowance(db, input.owner);
        this.check(current);
        if (
          current.subscriptionId !== reserved.plan.subscriptionId ||
          current.periodStart !== reserved.plan.periodStart ||
          current.unit !== reserved.plan.unit
        )
          throw new ConflictException(
            "Your subscription period changed. Please retry.",
          );
        await db.query("SELECT id FROM graph_nodes WHERE id=$1 FOR UPDATE", [
          input.owner,
        ]);
        const [receipt] = await db.query(
          "SELECT * FROM mcp_usage_receipts WHERE user_node_id=$1 AND request_id=$2 AND claim_id=$3 AND state='pending' AND expires_at>now() FOR UPDATE",
          [input.owner, input.requestId, claim],
        );
        if (!receipt)
          throw new ConflictException(
            "The request expired; retry with the same request ID",
          );
        const units = current.unit === "calls" ? 1 : output.records;
        const [period] = await db.query(
          "SELECT used FROM mcp_usage_periods WHERE id=$1 FOR UPDATE",
          [reserved.period],
        );
        if (Number(period.used) + units > current.limit)
          throw new HttpException(
            "Your data allowance is exhausted for this period",
            429,
          );
        await output.commit?.(db);
        const response = {
          data: output.data,
          usage: {
            requestId: input.requestId,
            units,
            unit: current.unit,
            records: output.records,
          },
        };
        await db.query(
          "UPDATE mcp_usage_periods SET reserved=reserved-$2,used=used+$3 WHERE id=$1",
          [reserved.period, reserved.units, units],
        );
        await db.query(
          "UPDATE mcp_usage_receipts SET state='completed',reserved=0,units=$4,records=$5,response=$6,completed_at=now() WHERE user_node_id=$1 AND request_id=$2 AND claim_id=$3",
          [
            input.owner,
            input.requestId,
            claim,
            units,
            output.records,
            JSON.stringify(response),
          ],
        );
        return response;
      });
    } catch (error) {
      await this.db.transaction(async db => {
        await db.query("SELECT id FROM graph_nodes WHERE id=$1 FOR UPDATE", [
          input.owner,
        ]);
        const [receipt] = await db.query(
          "SELECT * FROM mcp_usage_receipts WHERE user_node_id=$1 AND request_id=$2 AND claim_id=$3 AND state='pending' FOR UPDATE",
          [input.owner, input.requestId, claim],
        );
        if (receipt) {
          await db.query(
            "UPDATE mcp_usage_periods SET reserved=reserved-$2 WHERE id=$1",
            [receipt.period_id, receipt.reserved],
          );
          await db.query(
            "UPDATE mcp_usage_receipts SET state='failed',reserved=0 WHERE user_node_id=$1 AND request_id=$2 AND claim_id=$3",
            [input.owner, input.requestId, claim],
          );
        }
      });
      throw error;
    }
  }
  private check(plan: McpAllowance) {
    if (
      !plan ||
      new Date(plan.periodEnd) <= new Date() ||
      new Date(plan.periodStart) > new Date()
    )
      throw new ForbiddenException("An active data subscription is required");
    if (
      !Number.isSafeInteger(plan.limit) ||
      plan.limit < 0 ||
      !["calls", "records"].includes(plan.unit) ||
      !plan.subscriptionId ||
      !Number.isFinite(Date.parse(plan.periodStart)) ||
      !Number.isFinite(Date.parse(plan.periodEnd))
    )
      throw new ServiceUnavailableException("Data allowance is not configured");
  }
}
