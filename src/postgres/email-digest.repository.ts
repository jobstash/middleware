import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

type QueryExecutor = PostgresService | EntityManager;

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

export type EmailDigestStatus = "off" | "pending" | "subscribed";

export interface EmailDigestState {
  email: string | null;
  status: EmailDigestStatus;
  requestedAt: string | null;
  confirmedAt: string | null;
}

export interface EmailDigestRecipient {
  userNodeId: string;
  wallet: string;
  email: string;
}

@Injectable()
export class EmailDigestRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getState(wallet: string): Promise<EmailDigestState> {
    const [row] = await queryRows<{
      email: string | null;
      status: "pending" | "subscribed" | "unsubscribed" | null;
      requestedAt: string | null;
      confirmedAt: string | null;
    }>(
      this.postgres,
      `
        SELECT
          COALESCE(
            subscription_email.properties ->> 'email',
            contact_email.properties ->> 'email'
          ) AS email,
          subscription.status,
          subscription.requested_at::text AS "requestedAt",
          subscription.confirmed_at::text AS "confirmedAt"
        FROM graph_nodes account
        LEFT JOIN user_email_digest_subscriptions subscription
          ON subscription.user_node_id = account.id
        LEFT JOIN graph_nodes subscription_email
          ON subscription_email.id = subscription.email_node_id
         AND subscription_email.label = 'UserEmail'
        LEFT JOIN LATERAL (
          SELECT email.*
          FROM graph_relationships relationship
          JOIN graph_nodes email
            ON email.id = relationship.target_id
           AND email.label = 'UserEmail'
          WHERE relationship.source_id = account.id
            AND relationship.type = 'HAS_EMAIL'
          ORDER BY COALESCE(
            jsonb_boolean_value(email.properties, 'main'), false
          ) DESC, email.id
          LIMIT 1
        ) contact_email ON true
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        LIMIT 1
      `,
      [wallet],
    );
    return {
      email: row?.email ?? null,
      status:
        row?.status === "pending" || row?.status === "subscribed"
          ? row.status
          : "off",
      requestedAt: row?.requestedAt ?? null,
      confirmedAt: row?.confirmedAt ?? null,
    };
  }

  async requestConfirmation(
    wallet: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<{ email: string } | null> {
    return this.postgres.transaction(async manager => {
      const [identity] = await queryRows<{
        userNodeId: string;
        emailNodeId: string;
        email: string;
      }>(
        manager,
        `
          SELECT
            account.id::text AS "userNodeId",
            email.id::text AS "emailNodeId",
            email.properties ->> 'email' AS email
          FROM graph_nodes account
          JOIN LATERAL (
            SELECT verified_email.*
            FROM graph_relationships relationship
            JOIN graph_nodes verified_email
              ON verified_email.id = relationship.target_id
             AND verified_email.label = 'UserEmail'
            WHERE relationship.source_id = account.id
              AND relationship.type = 'HAS_EMAIL'
              AND NULLIF(verified_email.properties ->> 'email', '') IS NOT NULL
            ORDER BY COALESCE(
              jsonb_boolean_value(verified_email.properties, 'main'), false
            ) DESC, verified_email.id
            LIMIT 1
          ) email ON true
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
          FOR UPDATE OF account
        `,
        [wallet],
      );
      if (!identity) return null;

      await queryRows(
        manager,
        `
          INSERT INTO user_email_digest_subscriptions (
            user_node_id,
            email_node_id,
            status,
            confirmation_token_hash,
            confirmation_expires_at,
            unsubscribe_token_hash,
            requested_at,
            confirmed_at,
            unsubscribed_at,
            updated_at
          ) VALUES (
            $1, $2, 'pending', $3, $4, NULL, now(), NULL, NULL, now()
          )
          ON CONFLICT (user_node_id) DO UPDATE SET
            email_node_id = EXCLUDED.email_node_id,
            status = 'pending',
            confirmation_token_hash = EXCLUDED.confirmation_token_hash,
            confirmation_expires_at = EXCLUDED.confirmation_expires_at,
            unsubscribe_token_hash = NULL,
            requested_at = now(),
            confirmed_at = NULL,
            unsubscribed_at = NULL,
            updated_at = now()
        `,
        [identity.userNodeId, identity.emailNodeId, tokenHash, expiresAt],
      );
      await this.recordEvent(
        manager,
        identity.userNodeId,
        identity.emailNodeId,
        "confirmation_requested",
      );
      return { email: identity.email };
    });
  }

  async cancelPending(tokenHash: string): Promise<void> {
    await queryRows(
      this.postgres,
      `
        UPDATE user_email_digest_subscriptions
        SET status = 'unsubscribed',
            confirmation_token_hash = NULL,
            confirmation_expires_at = NULL,
            unsubscribed_at = now(),
            updated_at = now()
        WHERE status = 'pending'
          AND confirmation_token_hash = $1
      `,
      [tokenHash],
    );
  }

  async confirm(tokenHash: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [row] = await queryRows<{
        userNodeId: string;
        emailNodeId: string;
      }>(
        manager,
        `
          UPDATE user_email_digest_subscriptions
          SET status = 'subscribed',
              confirmation_token_hash = NULL,
              confirmation_expires_at = NULL,
              confirmed_at = now(),
              unsubscribed_at = NULL,
              updated_at = now()
          WHERE status = 'pending'
            AND confirmation_token_hash = $1
            AND confirmation_expires_at > now()
          RETURNING
            user_node_id::text AS "userNodeId",
            email_node_id::text AS "emailNodeId"
        `,
        [tokenHash],
      );
      if (!row) return false;
      await this.recordEvent(
        manager,
        row.userNodeId,
        row.emailNodeId,
        "confirmed",
      );
      return true;
    });
  }

  async unsubscribeWallet(wallet: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [row] = await queryRows<{
        userNodeId: string;
        emailNodeId: string;
      }>(
        manager,
        `
          UPDATE user_email_digest_subscriptions subscription
          SET status = 'unsubscribed',
              confirmation_token_hash = NULL,
              confirmation_expires_at = NULL,
              unsubscribe_token_hash = NULL,
              unsubscribed_at = now(),
              updated_at = now()
          FROM graph_nodes account
          WHERE subscription.user_node_id = account.id
            AND account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND subscription.status IN ('pending', 'subscribed')
          RETURNING
            subscription.user_node_id::text AS "userNodeId",
            subscription.email_node_id::text AS "emailNodeId"
        `,
        [wallet],
      );
      if (!row) return false;
      await this.recordEvent(
        manager,
        row.userNodeId,
        row.emailNodeId,
        "unsubscribed",
      );
      return true;
    });
  }

  async unsubscribeToken(tokenHash: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [row] = await queryRows<{
        userNodeId: string;
        emailNodeId: string;
      }>(
        manager,
        `
          UPDATE user_email_digest_subscriptions
          SET status = 'unsubscribed',
              unsubscribe_token_hash = NULL,
              unsubscribed_at = now(),
              updated_at = now()
          WHERE status = 'subscribed'
            AND unsubscribe_token_hash = $1
          RETURNING
            user_node_id::text AS "userNodeId",
            email_node_id::text AS "emailNodeId"
        `,
        [tokenHash],
      );
      if (!row) return false;
      await this.recordEvent(
        manager,
        row.userNodeId,
        row.emailNodeId,
        "unsubscribed",
      );
      return true;
    });
  }

  async getRecipients(): Promise<EmailDigestRecipient[]> {
    return queryRows(
      this.postgres,
      `
        SELECT
          account.id::text AS "userNodeId",
          account.properties ->> 'wallet' AS wallet,
          email.properties ->> 'email' AS email
        FROM user_email_digest_subscriptions subscription
        JOIN graph_nodes account
          ON account.id = subscription.user_node_id
         AND account.label = 'User'
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id
         AND relationship.target_id = subscription.email_node_id
         AND relationship.type = 'HAS_EMAIL'
        JOIN graph_nodes email
          ON email.id = relationship.target_id
         AND email.label = 'UserEmail'
        WHERE subscription.status = 'subscribed'
          AND NULLIF(email.properties ->> 'email', '') IS NOT NULL
        ORDER BY subscription.confirmed_at, account.id
      `,
    );
  }

  async claimWeek(userNodeId: string): Promise<boolean> {
    const rows = await queryRows<{ userNodeId: string }>(
      this.postgres,
      `
        UPDATE user_email_digest_subscriptions
        SET last_digest_week = date_trunc('week', now())::date,
            updated_at = now()
        WHERE user_node_id = $1
          AND status = 'subscribed'
          AND last_digest_week IS DISTINCT FROM date_trunc('week', now())::date
        RETURNING user_node_id::text AS "userNodeId"
      `,
      [userNodeId],
    );
    return rows.length > 0;
  }

  async setUnsubscribeToken(
    userNodeId: string,
    tokenHash: string,
  ): Promise<void> {
    await queryRows(
      this.postgres,
      `
        UPDATE user_email_digest_subscriptions
        SET unsubscribe_token_hash = $2, updated_at = now()
        WHERE user_node_id = $1
          AND status = 'subscribed'
      `,
      [userNodeId, tokenHash],
    );
  }

  async markSent(userNodeId: string): Promise<void> {
    await this.postgres.transaction(async manager => {
      const [row] = await queryRows<{ emailNodeId: string }>(
        manager,
        `
          UPDATE user_email_digest_subscriptions
          SET last_sent_at = now(), updated_at = now()
          WHERE user_node_id = $1
            AND status = 'subscribed'
          RETURNING email_node_id::text AS "emailNodeId"
        `,
        [userNodeId],
      );
      if (row) {
        await this.recordEvent(
          manager,
          userNodeId,
          row.emailNodeId,
          "digest_sent",
        );
      }
    });
  }

  async releaseWeek(userNodeId: string): Promise<void> {
    await queryRows(
      this.postgres,
      `
        UPDATE user_email_digest_subscriptions
        SET last_digest_week = NULL, updated_at = now()
        WHERE user_node_id = $1
          AND last_digest_week = date_trunc('week', now())::date
      `,
      [userNodeId],
    );
  }

  private async recordEvent(
    executor: QueryExecutor,
    userNodeId: string,
    emailNodeId: string,
    eventType:
      "confirmation_requested" | "confirmed" | "unsubscribed" | "digest_sent",
  ): Promise<void> {
    await queryRows(
      executor,
      `
        INSERT INTO user_email_digest_consent_events (
          user_node_id, email_node_id, event_type
        ) VALUES ($1, $2, $3)
      `,
      [userNodeId, emailNodeId, eventType],
    );
  }
}
