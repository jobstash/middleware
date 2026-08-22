import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { AgencyPlanEvidence } from "src/access-workspaces/agency-billing.contract";
import { PostgresService } from "./postgres.service";

type Executor = PostgresService | EntityManager;

const rows = async <T>(
  executor: Executor,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await (
    executor as unknown as {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    }
  ).query(sql, parameters);
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : (result as T[]);
};

export interface AgencyBillingWorkspace {
  id: string;
  ownerUserId: string;
  status: "active" | "cancelled" | "expired";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  entitlementEnabled: boolean;
}

export interface ApplyAgencyBillingEventInput {
  eventId: string;
  eventType: string;
  workspaceId?: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripeStatus: string;
  entitlementEnabled: boolean;
  workspaceStatus: "active" | "cancelled";
  planEvidence: AgencyPlanEvidence;
}

@Injectable()
export class AccessWorkspaceBillingRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getForOwner(
    workspaceId: string,
    ownerUserId: string,
  ): Promise<AgencyBillingWorkspace | null> {
    const [workspace] = await rows<AgencyBillingWorkspace>(
      this.postgres,
      `
        SELECT id::text AS id, owner_user_id AS "ownerUserId", status,
          stripe_customer_id AS "stripeCustomerId",
          stripe_subscription_id AS "stripeSubscriptionId",
          entitlement_enabled AS "entitlementEnabled"
        FROM access_workspaces
        WHERE id = $1::uuid AND owner_user_id = $2
          AND plan_code = 'agency' AND monthly_price_cents = 29900
          AND stripe_quantity = 1
      `,
      [workspaceId, ownerUserId],
    );
    return workspace ?? null;
  }

  async findBySubscription(
    stripeSubscriptionId: string,
  ): Promise<AgencyBillingWorkspace | null> {
    const [workspace] = await rows<AgencyBillingWorkspace>(
      this.postgres,
      `
        SELECT id::text AS id, owner_user_id AS "ownerUserId", status,
          stripe_customer_id AS "stripeCustomerId",
          stripe_subscription_id AS "stripeSubscriptionId",
          entitlement_enabled AS "entitlementEnabled"
        FROM access_workspaces
        WHERE stripe_subscription_id = $1
          AND plan_code = 'agency' AND monthly_price_cents = 29900
          AND stripe_quantity = 1
      `,
      [stripeSubscriptionId],
    );
    return workspace ?? null;
  }

  async applyEvent(input: ApplyAgencyBillingEventInput): Promise<{
    applied: boolean;
    workspaceId: string;
    entitlementEnabled: boolean;
  }> {
    return this.postgres.transaction(async manager => {
      await rows(
        manager,
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`agency-billing-event:${input.eventId}`],
      );
      await rows(
        manager,
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`agency-billing-subscription:${input.stripeSubscriptionId}`],
      );
      const [replay] = await rows<{
        workspaceId: string;
        entitlementEnabled: boolean;
      }>(
        manager,
        `
          SELECT event.workspace_id::text AS "workspaceId",
            COALESCE(
              (event.after_snapshot ->> 'entitlementEnabled')::boolean,
              false
            ) AS "entitlementEnabled"
          FROM access_workspace_billing_events event
          WHERE event.stripe_event_id = $1
        `,
        [input.eventId],
      );
      if (replay) return { applied: false, ...replay };

      const [workspace] = await rows<AgencyBillingWorkspace>(
        manager,
        `
          SELECT id::text AS id, owner_user_id AS "ownerUserId", status,
            stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            entitlement_enabled AS "entitlementEnabled"
          FROM access_workspaces
          WHERE (
              $1::uuid IS NOT NULL AND id = $1::uuid
            ) OR (
              $1::uuid IS NULL AND stripe_subscription_id = $2
            )
          ORDER BY id
          LIMIT 1
          FOR UPDATE
        `,
        [input.workspaceId ?? null, input.stripeSubscriptionId],
      );
      if (!workspace) throw new Error("Agency workspace was not found");
      const staleSubscription =
        workspace.stripeSubscriptionId &&
        workspace.stripeSubscriptionId !== input.stripeSubscriptionId &&
        !(
          workspace.entitlementEnabled === false &&
          ["cancelled", "expired"].includes(workspace.status)
        );
      if (staleSubscription) {
        const unchangedSnapshot = {
          status: workspace.status,
          stripeCustomerId: workspace.stripeCustomerId,
          stripeSubscriptionId: workspace.stripeSubscriptionId,
          stripeStatus: input.stripeStatus,
          entitlementEnabled: workspace.entitlementEnabled,
          ignoredStaleSubscriptionId: input.stripeSubscriptionId,
        };
        await rows(
          manager,
          `
            INSERT INTO access_workspace_billing_events (
              stripe_event_id, event_type, workspace_id,
              stripe_subscription_id, before_snapshot, after_snapshot,
              plan_evidence
            ) VALUES (
              $1, $2, $3::uuid, $4, $5::jsonb, $5::jsonb, $6::jsonb
            )
          `,
          [
            input.eventId,
            input.eventType,
            workspace.id,
            input.stripeSubscriptionId,
            JSON.stringify(unchangedSnapshot),
            JSON.stringify(input.planEvidence),
          ],
        );
        return {
          applied: false,
          workspaceId: workspace.id,
          entitlementEnabled: workspace.entitlementEnabled,
        };
      }

      const beforeSnapshot = {
        status: workspace.status,
        stripeCustomerId: workspace.stripeCustomerId,
        stripeSubscriptionId: workspace.stripeSubscriptionId,
        entitlementEnabled: workspace.entitlementEnabled,
      };
      const [after] = await rows<{
        workspaceId: string;
        status: string;
        stripeCustomerId: string | null;
        stripeSubscriptionId: string;
        entitlementEnabled: boolean;
      }>(
        manager,
        `
          UPDATE access_workspaces
          SET stripe_customer_id = COALESCE($2, stripe_customer_id),
            stripe_subscription_id = $3,
            status = $4,
            entitlement_enabled = $5,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING id::text AS "workspaceId", status,
            stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId",
            entitlement_enabled AS "entitlementEnabled"
        `,
        [
          workspace.id,
          input.stripeCustomerId,
          input.stripeSubscriptionId,
          input.workspaceStatus,
          input.entitlementEnabled,
        ],
      );
      if (!after) throw new Error("Agency entitlement update failed");
      const afterSnapshot = {
        status: after.status,
        stripeCustomerId: after.stripeCustomerId,
        stripeSubscriptionId: after.stripeSubscriptionId,
        stripeStatus: input.stripeStatus,
        entitlementEnabled: after.entitlementEnabled,
      };
      await rows(
        manager,
        `
          INSERT INTO access_workspace_billing_events (
            stripe_event_id, event_type, workspace_id,
            stripe_subscription_id, before_snapshot, after_snapshot,
            plan_evidence
          ) VALUES ($1, $2, $3::uuid, $4, $5::jsonb, $6::jsonb, $7::jsonb)
        `,
        [
          input.eventId,
          input.eventType,
          workspace.id,
          input.stripeSubscriptionId,
          JSON.stringify(beforeSnapshot),
          JSON.stringify(afterSnapshot),
          JSON.stringify(input.planEvidence),
        ],
      );
      return {
        applied: true,
        workspaceId: workspace.id,
        entitlementEnabled: after.entitlementEnabled,
      };
    });
  }
}
