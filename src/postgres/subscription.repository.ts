import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { addMonths } from "date-fns";
import { EntityManager } from "typeorm";
import { GraphRepository, GraphNodeRecord } from "./graph.repository";
import { PostgresService } from "./postgres.service";

type QueryExecutor = PostgresService | EntityManager;

export type SubscriptionServiceWrite = {
  label:
    | "JobstashBundle"
    | "VeriAddon"
    | "JobPromotions"
    | "StashAlert"
    | "ExtraSeats";
  properties: Record<string, unknown>;
};

export type SubscriptionQuotaWrite = {
  veri: number;
  jobPromotions: number;
  createdTimestamp: number;
  expiryTimestamp: number;
};

export type SubscriptionPaymentWrite = {
  amount: number;
  action: string;
  internalRefCode: string;
  externalRefCode: string;
  createdTimestamp: number;
  expiryTimestamp: number;
};

export type SubscriptionServiceChange = SubscriptionServiceWrite & {
  direction: "upgrade" | "downgrade";
  cycleStart: number;
  cycleEnd: number;
};

type NodeProperties = Record<string, unknown>;

const queryRows = async <T>(
  executor: QueryExecutor,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await (
    executor as unknown as {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    }
  ).query(sql, parameters);
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }
  return result as T[];
};

const latestServiceProperty = (label: string, property: string): string => `
  (
    SELECT service.properties -> '${property}'
    FROM graph_relationships service_relationship
    JOIN graph_nodes service ON service.id = service_relationship.target_id
    WHERE service_relationship.source_id = subscription.id
      AND service_relationship.type = 'HAS_SERVICE'
      AND service.label = '${label}'
    ORDER BY COALESCE(
      jsonb_numeric_value(service.properties, 'expiryTimestamp'), 0
    ) DESC, COALESCE(
      jsonb_numeric_value(service.properties, 'createdTimestamp'), 0
    ) DESC, service.id DESC
    LIMIT 1
  )
`;

const subscriptionPayload = (nowParameter: string): string => `
  subscription.properties || jsonb_build_object(
    'status', CASE
      WHEN COALESCE(
        jsonb_numeric_value(subscription.properties, 'expiryTimestamp'), 0
      ) > ${nowParameter}
        AND subscription.properties ->> 'status' = 'active'
      THEN 'active'
      ELSE 'inactive'
    END,
    'tier', ${latestServiceProperty("JobstashBundle", "name")},
    'stashPool', ${latestServiceProperty("JobstashBundle", "stashPool")},
    'atsIntegration', ${latestServiceProperty(
      "JobstashBundle",
      "atsIntegration",
    )},
    'veri', ${latestServiceProperty("VeriAddon", "name")},
    'jobPromotions', ${latestServiceProperty("JobPromotions", "value")},
    'stashAlert', ${latestServiceProperty("StashAlert", "active")},
    'extraSeats', ${latestServiceProperty("ExtraSeats", "value")},
    'quota', COALESCE((
      SELECT jsonb_agg(
        quota.properties || jsonb_build_object(
          'usage', COALESCE((
            SELECT jsonb_agg(
              usage.properties
              ORDER BY COALESCE(
                jsonb_numeric_value(usage.properties, 'createdTimestamp'), 0
              ), usage.id
            )
            FROM graph_relationships usage_relationship
            JOIN graph_nodes usage ON usage.id = usage_relationship.target_id
            WHERE usage_relationship.source_id = quota.id
              AND usage_relationship.type = 'HAS_USAGE'
              AND usage.label = 'QuotaUsage'
          ), '[]'::jsonb)
        )
        ORDER BY COALESCE(
          jsonb_numeric_value(quota.properties, 'createdTimestamp'), 0
        ), quota.id
      )
      FROM graph_relationships quota_relationship
      JOIN graph_nodes quota ON quota.id = quota_relationship.target_id
      WHERE quota_relationship.source_id = subscription.id
        AND quota_relationship.type = 'HAS_QUOTA'
        AND quota.label = 'Quota'
    ), '[]'::jsonb)
  )
`;

@Injectable()
export class SubscriptionRepository {
  constructor(
    private readonly postgres: PostgresService,
    private readonly graph: GraphRepository,
  ) {}

  async recordQuotaUsage(input: {
    wallet: string;
    subscriptionId: string;
    quotaId: string;
    service: string;
    amount: number;
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [context] = await queryRows<{
        userNodeId: string;
        quotaNodeId: string;
      }>(
        manager,
        `
          SELECT account.id::text AS "userNodeId",
            quota.id::text AS "quotaNodeId"
          FROM graph_nodes account
          CROSS JOIN graph_nodes subscription
          JOIN graph_relationships quota_relationship
            ON quota_relationship.source_id = subscription.id
           AND quota_relationship.type = 'HAS_QUOTA'
          JOIN graph_nodes quota ON quota.id = quota_relationship.target_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND subscription.label = 'OrgSubscription'
            AND subscription.properties ->> 'id' = $2
            AND subscription.properties ->> 'status' = 'active'
            AND quota.label = 'Quota'
            AND quota.properties ->> 'id' = $3
          FOR UPDATE OF quota
        `,
        [input.wallet, input.subscriptionId, input.quotaId],
      );
      if (!context) return false;
      const usage = await this.graph.createNode(
        "QuotaUsage",
        {
          id: randomUUID(),
          service: input.service,
          amount: input.amount,
          createdTimestamp: Date.now(),
        },
        undefined,
        manager,
      );
      await this.graph.upsertRelationship({
        sourceNodeId: context.userNodeId,
        targetNodeId: usage.nodeId,
        type: "USED_QUOTA",
        executor: manager,
      });
      await this.graph.upsertRelationship({
        sourceNodeId: context.quotaNodeId,
        targetNodeId: usage.nodeId,
        type: "HAS_USAGE",
        executor: manager,
      });
      return true;
    });
  }

  async createPendingPayment(input: {
    wallet: string;
    orgId: string;
    amount: number;
    action: string;
    reference: string;
    link: string;
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.graph.findNode<NodeProperties>(
        "User",
        { wallet: input.wallet },
        manager,
      );
      const organization = await this.graph.findNode<NodeProperties>(
        "Organization",
        { orgId: input.orgId },
        manager,
      );
      if (!account || !organization) return false;
      const payment =
        (await this.graph.findNode<NodeProperties>(
          "PendingPayment",
          { link: input.link },
          manager,
        )) ??
        (await this.graph.createNode(
          "PendingPayment",
          {
            id: randomUUID(),
            reference: input.reference,
            type: "subscription",
            amount: input.amount,
            currency: "USD",
            action: input.action,
            link: input.link,
            createdTimestamp: Date.now(),
          },
          undefined,
          manager,
        ));
      await this.graph.upsertRelationship({
        sourceNodeId: account.nodeId,
        targetNodeId: payment.nodeId,
        type: "HAS_PENDING_PAYMENT",
        executor: manager,
      });
      await this.graph.upsertRelationship({
        sourceNodeId: organization.nodeId,
        targetNodeId: payment.nodeId,
        type: "HAS_PENDING_PAYMENT",
        executor: manager,
      });
      return true;
    });
  }

  async getPendingPayment(
    wallet: string,
    orgId: string,
  ): Promise<GraphNodeRecord<NodeProperties> | undefined> {
    const [payment] = await queryRows<GraphNodeRecord<NodeProperties>>(
      this.postgres,
      `
        SELECT payment.id::text AS "nodeId", payment.properties
        FROM graph_nodes account
        JOIN graph_relationships account_payment
          ON account_payment.source_id = account.id
         AND account_payment.type = 'HAS_PENDING_PAYMENT'
        JOIN graph_nodes payment ON payment.id = account_payment.target_id
        JOIN graph_relationships organization_payment
          ON organization_payment.target_id = payment.id
         AND organization_payment.type = 'HAS_PENDING_PAYMENT'
        JOIN graph_nodes organization
          ON organization.id = organization_payment.source_id
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
          AND payment.label = 'PendingPayment'
          AND organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $2
        ORDER BY COALESCE(
          jsonb_numeric_value(payment.properties, 'createdTimestamp'), 0
        ) DESC, payment.id DESC
        LIMIT 1
      `,
      [wallet, orgId],
    );
    return payment;
  }

  async createSubscription(input: {
    wallet: string;
    orgId: string;
    externalId?: string | null;
    duration: "monthly" | "yearly";
    createdTimestamp: number;
    expiryTimestamp: number;
    services: SubscriptionServiceWrite[];
    quota: SubscriptionQuotaWrite;
    payment?: SubscriptionPaymentWrite;
    pendingPaymentNodeId?: string;
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const organization = await this.graph.findNode<NodeProperties>(
        "Organization",
        { orgId: input.orgId },
        manager,
      );
      const account = input.payment
        ? await this.graph.findNode<NodeProperties>(
            "User",
            { wallet: input.wallet },
            manager,
          )
        : undefined;
      if (!organization || (input.payment && !account)) return false;
      const subscription = await this.graph.createNode(
        "OrgSubscription",
        {
          id: randomUUID(),
          externalId: input.externalId ?? null,
          status: "active",
          veriPayg: false,
          duration: input.duration,
          createdTimestamp: input.createdTimestamp,
          expiryTimestamp: input.expiryTimestamp,
        },
        undefined,
        manager,
      );
      await this.graph.upsertRelationship({
        sourceNodeId: organization.nodeId,
        targetNodeId: subscription.nodeId,
        type: "HAS_SUBSCRIPTION",
        executor: manager,
      });
      await this.createServiceNodes(
        manager,
        subscription.nodeId,
        input.services,
      );
      const quota = await this.createQuota(
        manager,
        subscription.nodeId,
        input.quota,
      );
      if (input.payment && account) {
        await this.createPayment(
          manager,
          subscription.nodeId,
          account.nodeId,
          input.payment,
        );
      }
      if (input.pendingPaymentNodeId) {
        await queryRows(
          manager,
          `
            DELETE FROM graph_nodes
            WHERE id = $1 AND label = 'PendingPayment'
          `,
          [input.pendingPaymentNodeId],
        );
      }
      return Boolean(quota);
    });
  }

  async getSubscriptionByOrgId(
    orgId: string,
  ): Promise<NodeProperties | undefined> {
    const [row] = await queryRows<{ subscription: NodeProperties }>(
      this.postgres,
      `
        SELECT ${subscriptionPayload("$2::bigint")} AS subscription
        FROM graph_nodes organization
        JOIN graph_relationships organization_subscription
          ON organization_subscription.source_id = organization.id
         AND organization_subscription.type = 'HAS_SUBSCRIPTION'
        JOIN graph_nodes subscription
          ON subscription.id = organization_subscription.target_id
         AND subscription.label = 'OrgSubscription'
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
        ORDER BY
          CASE WHEN COALESCE(
            jsonb_numeric_value(subscription.properties, 'expiryTimestamp'), 0
          ) > $2
            AND subscription.properties ->> 'status' = 'active'
          THEN 1 ELSE 0 END DESC,
          COALESCE(
            jsonb_numeric_value(subscription.properties, 'expiryTimestamp'), 0
          ) DESC,
          COALESCE(
            jsonb_numeric_value(subscription.properties, 'createdTimestamp'), 0
          ) DESC,
          subscription.id DESC
        LIMIT 1
      `,
      [orgId, Date.now()],
    );
    return row?.subscription;
  }

  async getSubscriptionByExternalId(
    externalId: string,
  ): Promise<NodeProperties | undefined> {
    const [row] = await queryRows<{ subscription: NodeProperties }>(
      this.postgres,
      `
        SELECT ${subscriptionPayload("$2::bigint")} AS subscription
        FROM graph_nodes subscription
        WHERE subscription.label = 'OrgSubscription'
          AND subscription.properties ->> 'externalId' = $1
        ORDER BY COALESCE(
          jsonb_numeric_value(subscription.properties, 'expiryTimestamp'), 0
        ) DESC, COALESCE(
          jsonb_numeric_value(subscription.properties, 'createdTimestamp'), 0
        ) DESC, subscription.id DESC
        LIMIT 1
      `,
      [externalId, Date.now()],
    );
    return row?.subscription;
  }

  async getSubscriptionMembers(orgId: string): Promise<NodeProperties[]> {
    const rows = await queryRows<{ member: NodeProperties }>(
      this.postgres,
      `
        SELECT DISTINCT ON (seat.id, account.id)
          jsonb_build_object(
            'id', seat.properties -> 'id',
            'wallet', account.properties -> 'wallet',
            'credential', verification.properties -> 'credential',
            'account', verification.properties -> 'account',
            'name', account.properties -> 'name',
            'role', seat.properties -> 'seatType',
            'dateJoined', seat.properties -> 'createdTimestamp'
          ) AS member
        FROM graph_nodes organization
        JOIN graph_relationships organization_seat
          ON organization_seat.source_id = organization.id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_nodes seat ON seat.id = organization_seat.target_id
        JOIN graph_relationships occupancy
          ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
        JOIN graph_nodes account ON account.id = occupancy.source_id
        JOIN graph_relationships verification
          ON verification.source_id = account.id
         AND verification.target_id = organization.id
         AND verification.type = 'VERIFIED_FOR_ORG'
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND EXISTS (
            SELECT 1 FROM graph_relationships subscription_relationship
            JOIN graph_nodes subscription
              ON subscription.id = subscription_relationship.target_id
             AND subscription.label = 'OrgSubscription'
            WHERE subscription_relationship.source_id = organization.id
              AND subscription_relationship.type = 'HAS_SUBSCRIPTION'
          )
        ORDER BY seat.id, account.id
      `,
      [orgId],
    );
    return rows.map(row => row.member);
  }

  async getOwnerByExternalId(
    externalId: string,
  ): Promise<{ orgId: string; wallet: string } | undefined> {
    return this.getOwner(
      `subscription.properties ->> 'externalId' = $1`,
      [externalId],
      true,
    );
  }

  async getOwnerByOrgId(
    orgId: string,
  ): Promise<{ orgId: string; wallet: string } | undefined> {
    return this.getOwner(`organization.properties ->> 'orgId' = $1`, [orgId]);
  }

  async renewSubscription(input: {
    subscriptionId: string;
    wallet: string;
    orgId: string;
    expiryTimestamp: number;
    payment: SubscriptionPaymentWrite;
    quota: SubscriptionQuotaWrite;
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const subscription = await this.graph.findNode<NodeProperties>(
        "OrgSubscription",
        { id: input.subscriptionId },
        manager,
      );
      const account = await this.graph.findNode<NodeProperties>(
        "User",
        { wallet: input.wallet },
        manager,
      );
      const organization = await this.graph.findNode<NodeProperties>(
        "Organization",
        { orgId: input.orgId },
        manager,
      );
      if (!subscription || !account || !organization) return false;
      await queryRows(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb, updated_at = now()
          WHERE id = $1
        `,
        [
          subscription.nodeId,
          JSON.stringify({
            status: "active",
            expiryTimestamp: input.expiryTimestamp,
          }),
        ],
      );
      await queryRows(
        manager,
        `
          UPDATE graph_nodes service
          SET properties = service.properties || jsonb_build_object(
            'expiryTimestamp', $2::bigint
          ), updated_at = now()
          FROM graph_relationships relationship
          WHERE relationship.source_id = $1
            AND relationship.target_id = service.id
            AND relationship.type = 'HAS_SERVICE'
        `,
        [subscription.nodeId, input.expiryTimestamp],
      );
      await this.graph.upsertRelationship({
        sourceNodeId: organization.nodeId,
        targetNodeId: subscription.nodeId,
        type: "HAS_SUBSCRIPTION",
        executor: manager,
      });
      await this.createPayment(
        manager,
        subscription.nodeId,
        account.nodeId,
        input.payment,
      );
      await this.createQuota(manager, subscription.nodeId, input.quota);
      return true;
    });
  }

  async setPaygState(externalId: string, paygState: boolean): Promise<boolean> {
    const rows = await this.graph.updateNodes<NodeProperties>(
      "OrgSubscription",
      { externalId },
      { veriPayg: paygState },
    );
    return rows.length > 0;
  }

  async changeSubscription(input: {
    subscriptionId: string;
    externalId: string;
    wallet: string;
    changedTimestamp: number;
    changes: SubscriptionServiceChange[];
    payment: SubscriptionPaymentWrite;
    quota: SubscriptionQuotaWrite;
  }): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const subscription = await this.graph.findNode<NodeProperties>(
        "OrgSubscription",
        { id: input.subscriptionId },
        manager,
      );
      const account = await this.graph.findNode<NodeProperties>(
        "User",
        { wallet: input.wallet },
        manager,
      );
      if (!subscription || !account) return false;
      await queryRows(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb, updated_at = now()
          WHERE id = $1
        `,
        [
          subscription.nodeId,
          JSON.stringify({ status: "active", externalId: input.externalId }),
        ],
      );
      for (const change of input.changes) {
        await this.applyServiceChange(
          manager,
          subscription.nodeId,
          change,
          input.changedTimestamp,
        );
      }
      await this.createPayment(
        manager,
        subscription.nodeId,
        account.nodeId,
        input.payment,
      );
      await this.createQuota(manager, subscription.nodeId, input.quota);
      return true;
    });
  }

  async cancelSubscription(externalId: string): Promise<boolean> {
    const rows = await this.graph.updateNodes<NodeProperties>(
      "OrgSubscription",
      { externalId },
      { status: "inactive" },
    );
    return rows.length > 0;
  }

  async resetSubscriptionState(orgId: string): Promise<string[] | null> {
    return this.postgres.transaction(async manager => {
      const [organization] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT id::text AS "nodeId"
          FROM graph_nodes
          WHERE label = 'Organization'
            AND properties ->> 'orgId' = $1
          LIMIT 1
        `,
        [orgId],
      );
      if (!organization) return null;
      const users = await queryRows<{ wallet: string }>(
        manager,
        `
          SELECT DISTINCT account.properties ->> 'wallet' AS wallet
          FROM graph_relationships organization_seat
          JOIN graph_nodes seat ON seat.id = organization_seat.target_id
          JOIN graph_relationships occupancy
            ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
          JOIN graph_nodes account ON account.id = occupancy.source_id
          WHERE organization_seat.source_id = $1
            AND organization_seat.type = 'HAS_USER_SEAT'
            AND account.label = 'User'
            AND account.properties ->> 'wallet' IS NOT NULL
        `,
        [organization.nodeId],
      );
      await queryRows(
        manager,
        `
          WITH subscription_nodes AS (
            SELECT target_id AS id
            FROM graph_relationships
            WHERE source_id = $1 AND type = 'HAS_SUBSCRIPTION'
          ), child_nodes AS (
            SELECT relationship.target_id AS id
            FROM subscription_nodes
            JOIN graph_relationships relationship
              ON relationship.source_id = subscription_nodes.id
             AND relationship.type = ANY(
               ARRAY['HAS_QUOTA', 'HAS_PAYMENT', 'HAS_SERVICE']::text[]
             )
          ), seat_nodes AS (
            SELECT target_id AS id
            FROM graph_relationships
            WHERE source_id = $1 AND type = 'HAS_USER_SEAT'
          ), member_nodes AS (
            SELECT occupancy.source_id AS id
            FROM seat_nodes
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat_nodes.id
             AND occupancy.type = 'OCCUPIES'
          ), user_owned_nodes AS (
            SELECT relationship.target_id AS id
            FROM member_nodes
            JOIN graph_relationships relationship
              ON relationship.source_id = member_nodes.id
             AND relationship.type = ANY(
               ARRAY[
                 'HAS_PENDING_PAYMENT',
                 'MADE_SUBSCRIPTION_PAYMENT',
                 'USED_QUOTA'
               ]::text[]
             )
          ), deletion AS (
            SELECT id FROM subscription_nodes
            UNION SELECT id FROM child_nodes
            UNION SELECT id FROM seat_nodes
            UNION SELECT id FROM user_owned_nodes
          )
          DELETE FROM graph_nodes node
          USING deletion
          WHERE node.id = deletion.id
        `,
        [organization.nodeId],
      );
      return users.map(user => user.wallet);
    });
  }

  async getRenewalSubscriptions(): Promise<
    { subscription: NodeProperties; ownerWallet: string; orgId: string }[]
  > {
    return queryRows(
      this.postgres,
      `
        SELECT ${subscriptionPayload("$1::bigint")} AS subscription,
          account.properties ->> 'wallet' AS "ownerWallet",
          organization.properties ->> 'orgId' AS "orgId"
        FROM graph_nodes organization
        JOIN graph_relationships organization_subscription
          ON organization_subscription.source_id = organization.id
         AND organization_subscription.type = 'HAS_SUBSCRIPTION'
        JOIN graph_nodes subscription
          ON subscription.id = organization_subscription.target_id
         AND subscription.label = 'OrgSubscription'
        JOIN graph_relationships organization_seat
          ON organization_seat.source_id = organization.id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_nodes seat
          ON seat.id = organization_seat.target_id
         AND seat.properties ->> 'seatType' = 'owner'
        JOIN graph_relationships occupancy
          ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
        JOIN graph_nodes account
          ON account.id = occupancy.source_id AND account.label = 'User'
        WHERE organization.label = 'Organization'
        ORDER BY organization.id, subscription.id, account.id
      `,
      [Date.now()],
    );
  }

  async getPayments(orgId: string): Promise<NodeProperties[]> {
    const rows = await queryRows<{ properties: NodeProperties }>(
      this.postgres,
      `
        SELECT payment.properties
        FROM graph_nodes organization
        JOIN graph_relationships organization_subscription
          ON organization_subscription.source_id = organization.id
         AND organization_subscription.type = 'HAS_SUBSCRIPTION'
        JOIN graph_nodes subscription
          ON subscription.id = organization_subscription.target_id
        JOIN graph_relationships subscription_payment
          ON subscription_payment.source_id = subscription.id
         AND subscription_payment.type = 'HAS_PAYMENT'
        JOIN graph_nodes payment
          ON payment.id = subscription_payment.target_id
         AND payment.label = 'Payment'
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
        ORDER BY COALESCE(
          jsonb_numeric_value(payment.properties, 'createdTimestamp'), 0
        ) DESC, payment.id DESC
      `,
      [orgId],
    );
    return rows.map(row => row.properties);
  }

  private async getOwner(
    predicate: string,
    parameters: unknown[],
    requireSubscription = false,
  ): Promise<{ orgId: string; wallet: string } | undefined> {
    const [owner] = await queryRows<{ orgId: string; wallet: string }>(
      this.postgres,
      `
        SELECT organization.properties ->> 'orgId' AS "orgId",
          account.properties ->> 'wallet' AS wallet
        FROM graph_nodes organization
        ${
          requireSubscription
            ? `JOIN graph_relationships organization_subscription
                 ON organization_subscription.source_id = organization.id
                AND organization_subscription.type = 'HAS_SUBSCRIPTION'
               JOIN graph_nodes subscription
                 ON subscription.id = organization_subscription.target_id
                AND subscription.label = 'OrgSubscription'`
            : "LEFT JOIN graph_relationships organization_subscription ON false LEFT JOIN graph_nodes subscription ON false"
        }
        JOIN graph_relationships organization_seat
          ON organization_seat.source_id = organization.id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_nodes seat
          ON seat.id = organization_seat.target_id
         AND seat.properties ->> 'seatType' = 'owner'
        JOIN graph_relationships occupancy
          ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
        JOIN graph_nodes account
          ON account.id = occupancy.source_id AND account.label = 'User'
        WHERE organization.label = 'Organization' AND ${predicate}
        ORDER BY organization.id, seat.id, account.id
        LIMIT 1
      `,
      parameters,
    );
    return owner;
  }

  private async createServiceNodes(
    manager: EntityManager,
    subscriptionNodeId: string,
    services: SubscriptionServiceWrite[],
  ): Promise<void> {
    for (const service of services) {
      const node = await this.graph.createNode(
        service.label,
        { id: randomUUID(), ...service.properties },
        undefined,
        manager,
      );
      await this.graph.upsertRelationship({
        sourceNodeId: subscriptionNodeId,
        targetNodeId: node.nodeId,
        type: "HAS_SERVICE",
        executor: manager,
      });
    }
  }

  private async createQuota(
    manager: EntityManager,
    subscriptionNodeId: string,
    quota: SubscriptionQuotaWrite,
  ): Promise<GraphNodeRecord<NodeProperties>> {
    const node = await this.graph.createNode(
      "Quota",
      { id: randomUUID(), ...quota },
      undefined,
      manager,
    );
    await this.graph.upsertRelationship({
      sourceNodeId: subscriptionNodeId,
      targetNodeId: node.nodeId,
      type: "HAS_QUOTA",
      executor: manager,
    });
    return node;
  }

  private async createPayment(
    manager: EntityManager,
    subscriptionNodeId: string,
    accountNodeId: string,
    payment: SubscriptionPaymentWrite,
  ): Promise<GraphNodeRecord<NodeProperties>> {
    const node = await this.graph.createNode(
      "Payment",
      {
        id: randomUUID(),
        amount: payment.amount,
        currency: "USD",
        status: "confirmed",
        type: "subscription",
        ...payment,
      },
      undefined,
      manager,
    );
    await this.graph.upsertRelationship({
      sourceNodeId: subscriptionNodeId,
      targetNodeId: node.nodeId,
      type: "HAS_PAYMENT",
      executor: manager,
    });
    await this.graph.upsertRelationship({
      sourceNodeId: accountNodeId,
      targetNodeId: node.nodeId,
      type: "MADE_SUBSCRIPTION_PAYMENT",
      executor: manager,
    });
    return node;
  }

  private async applyServiceChange(
    manager: EntityManager,
    subscriptionNodeId: string,
    change: SubscriptionServiceChange,
    changedTimestamp: number,
  ): Promise<void> {
    let createdTimestamp = change.cycleStart;
    let expiryTimestamp = change.cycleEnd;
    if (change.direction === "downgrade") {
      const [latest] = await queryRows<{ expiryTimestamp: string }>(
        manager,
        `
          SELECT COALESCE(
            jsonb_numeric_value(service.properties, 'expiryTimestamp'), $3
          )::text AS "expiryTimestamp"
          FROM graph_relationships relationship
          JOIN graph_nodes service ON service.id = relationship.target_id
          WHERE relationship.source_id = $1
            AND relationship.type = 'HAS_SERVICE'
            AND service.label = $2
          ORDER BY COALESCE(
            jsonb_numeric_value(service.properties, 'expiryTimestamp'), 0
          ) DESC, service.id DESC
          LIMIT 1
          FOR UPDATE OF service
        `,
        [subscriptionNodeId, change.label, change.cycleStart],
      );
      createdTimestamp = latest
        ? Number(latest.expiryTimestamp)
        : change.cycleStart;
      expiryTimestamp = addMonths(createdTimestamp, 1).getTime();
    } else {
      await queryRows(
        manager,
        `
          UPDATE graph_nodes service
          SET properties = service.properties || jsonb_build_object(
            'expiryTimestamp', $3::bigint
          ), updated_at = now()
          FROM graph_relationships relationship
          WHERE relationship.source_id = $1
            AND relationship.target_id = service.id
            AND relationship.type = 'HAS_SERVICE'
            AND service.label = $2
        `,
        [subscriptionNodeId, change.label, changedTimestamp],
      );
    }
    await this.createServiceNodes(manager, subscriptionNodeId, [
      {
        label: change.label,
        properties: {
          ...change.properties,
          createdTimestamp,
          expiryTimestamp,
        },
      },
    ]);
  }
}
