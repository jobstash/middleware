import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { slugify } from "src/shared/helpers";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

type QueryExecutor = PostgresService | EntityManager;

export interface ThreatAccessUserRow {
  wallet: string;
  name: string | null;
  email: string | null;
  github: string | null;
  hasAccess: boolean;
}

type GraphNode<T extends Record<string, unknown>> = {
  nodeId: string;
  properties: T;
};

const queryRows = async <T>(
  executor: QueryExecutor,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const executableSql = sql
    .replaceAll("graph_nodes user", "graph_nodes profile_user")
    .replace(/\buser\./g, "profile_user.");
  const result = await (
    executor as unknown as {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    }
  ).query(executableSql, parameters);
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

const richUserPayload = (orgParameter: string): string => `
  user.properties || jsonb_build_object(
    'wallet', user.properties -> 'wallet',
    'availableForWork', COALESCE(
      jsonb_boolean_value(user.properties, 'available'), false
    ),
    'cryptoNative', COALESCE(
      jsonb_boolean_value(user.properties, 'cryptoNative'), false
    ),
    'cryptoAdjacent', COALESCE(
      jsonb_boolean_value(user.properties, 'cryptoAdjacent'), false
    ),
    'githubAvatar', (
      SELECT github.properties -> 'avatarUrl'
      FROM graph_relationships relationship
      JOIN graph_nodes github ON github.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_GITHUB_USER'
        AND github.label = 'GithubUser'
      ORDER BY github.id
      LIMIT 1
    ),
    'alternateEmails', COALESCE((
      SELECT jsonb_agg(email.properties ->> 'email' ORDER BY email.id)
      FROM graph_relationships relationship
      JOIN graph_nodes email ON email.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_EMAIL'
        AND email.label = 'UserEmail'
    ), '[]'::jsonb),
    'location', COALESCE((
      SELECT location.properties
      FROM graph_relationships relationship
      JOIN graph_nodes location ON location.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_LOCATION'
        AND location.label = 'UserLocation'
      ORDER BY location.id
      LIMIT 1
    ), jsonb_build_object('city', NULL, 'country', NULL)),
    'linkedAccounts', COALESCE((
      SELECT account.properties
      FROM graph_relationships relationship
      JOIN graph_nodes account ON account.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_LINKED_ACCOUNT'
        AND account.label = 'LinkedAccount'
      ORDER BY account.id
      LIMIT 1
    ), '{}'::jsonb) || jsonb_build_object(
      'wallets', COALESCE((
        SELECT jsonb_agg(wallet.properties ->> 'address' ORDER BY wallet.id)
        FROM graph_relationships relationship
        JOIN graph_nodes wallet ON wallet.id = relationship.target_id
        WHERE relationship.source_id = user.id
          AND relationship.type = 'HAS_LINKED_WALLET'
          AND wallet.label = 'LinkedWallet'
      ), '[]'::jsonb)
    ),
    'skills', COALESCE((
      SELECT jsonb_agg(
        tag.properties || jsonb_build_object(
          'canTeach', COALESCE(
            jsonb_boolean_value(relationship.properties, 'canTeach'), false
          )
        ) ORDER BY tag.properties ->> 'name'
      )
      FROM graph_relationships relationship
      JOIN graph_nodes tag ON tag.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_SKILL'
        AND tag.label = 'Tag'
    ), '[]'::jsonb),
    'showcases', COALESCE((
      SELECT jsonb_agg(showcase.properties ORDER BY showcase.id)
      FROM graph_relationships relationship
      JOIN graph_nodes showcase ON showcase.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_SHOWCASE'
        AND showcase.label = 'UserShowCase'
    ), '[]'::jsonb),
    'workHistory', COALESCE((
      SELECT jsonb_agg(
        history.properties || jsonb_build_object(
          'repositories', COALESCE((
            SELECT jsonb_agg(repository.properties ORDER BY repository.id)
            FROM graph_relationships repository_relationship
            JOIN graph_nodes repository
              ON repository.id = repository_relationship.target_id
            WHERE repository_relationship.source_id = history.id
              AND repository_relationship.type = 'WORKED_ON_REPO'
              AND repository.label = 'UserWorkHistoryRepo'
          ), '[]'::jsonb)
        ) ORDER BY history.id
      )
      FROM graph_relationships relationship
      JOIN graph_nodes history ON history.id = relationship.target_id
      WHERE relationship.source_id = user.id
        AND relationship.type = 'HAS_WORK_HISTORY'
        AND history.label = 'UserWorkHistory'
    ), '[]'::jsonb),
    'attestations', jsonb_build_object('upvotes', NULL, 'downvotes', NULL),
    'note', (
      SELECT note.properties -> 'note'
      FROM graph_relationships user_note
      JOIN graph_nodes note ON note.id = user_note.target_id
      JOIN graph_relationships organization_note
        ON organization_note.target_id = note.id
       AND organization_note.type = 'HAS_TALENT_NOTE'
      JOIN graph_nodes organization
        ON organization.id = organization_note.source_id
      WHERE user_note.source_id = user.id
        AND user_note.type = 'HAS_RECRUITER_NOTE'
        AND organization.properties ->> 'orgId' = ${orgParameter}
      ORDER BY note.id
      LIMIT 1
    ),
    'jobCategoryInterests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'classification', frequency.label,
        'frequency', frequency.count
      ) ORDER BY frequency.count DESC, frequency.label)
      FROM (
        SELECT entry.value AS label, count(*)::int AS count
        FROM graph_relationships application
        JOIN job_search_documents job ON job.job_node_id = application.target_id
        CROSS JOIN LATERAL jsonb_each_text(
          COALESCE(job.filter_labels -> 'classifications', '{}'::jsonb)
        ) entry
        WHERE application.source_id = user.id
          AND application.type = 'APPLIED_TO'
        GROUP BY entry.value
      ) frequency
    ), '[]'::jsonb),
    'tags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tag', frequency.label,
        'frequency', frequency.count
      ) ORDER BY frequency.count DESC, frequency.label)
      FROM (
        SELECT entry.value AS label, count(*)::int AS count
        FROM graph_relationships application
        JOIN job_search_documents job ON job.job_node_id = application.target_id
        CROSS JOIN LATERAL jsonb_each_text(
          COALESCE(job.filter_labels -> 'tags', '{}'::jsonb)
        ) entry
        WHERE application.source_id = user.id
          AND application.type = 'APPLIED_TO'
        GROUP BY entry.value
      ) frequency
    ), '[]'::jsonb),
    'lastAppliedTimestamp', (
      SELECT max(jsonb_numeric_value(application.properties, 'createdTimestamp'))
      FROM graph_relationships application
      WHERE application.source_id = user.id
        AND application.type = 'APPLIED_TO'
    )
  )
`;

@Injectable()
export class UserRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findUserByWallet(
    wallet: string,
  ): Promise<Record<string, unknown> | undefined> {
    return (await this.findNode("User", { wallet }))?.properties;
  }

  async findUserByGithubNodeId(
    nodeId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const [row] = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT user.properties
        FROM graph_nodes user
        JOIN graph_relationships relationship
          ON relationship.source_id = user.id
         AND relationship.type = 'HAS_GITHUB_USER'
        JOIN graph_nodes github ON github.id = relationship.target_id
        WHERE user.label = 'User'
          AND github.label = 'GithubUser'
          AND github.properties ->> 'nodeId' = $1
        LIMIT 1
      `,
      [nodeId],
    );
    return row?.properties;
  }

  async findOwnerWallet(orgId: string): Promise<string | undefined> {
    const [row] = await queryRows<{ wallet: string }>(
      this.postgres,
      `
        SELECT user.properties ->> 'wallet' AS wallet
        FROM graph_nodes organization
        JOIN graph_relationships organization_seat
          ON organization_seat.source_id = organization.id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_nodes seat
          ON seat.id = organization_seat.target_id
         AND seat.label = 'OrgUserSeat'
        JOIN graph_relationships occupancy
          ON occupancy.target_id = seat.id
         AND occupancy.type = 'OCCUPIES'
        JOIN graph_nodes user
          ON user.id = occupancy.source_id
         AND user.label = 'User'
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND seat.properties ->> 'seatType' = 'owner'
        LIMIT 1
      `,
      [orgId],
    );
    return row?.wallet;
  }

  async findOrganizationIdForMember(wallet: string): Promise<string | null> {
    const [row] = await queryRows<{ orgId: string }>(
      this.postgres,
      `
        SELECT organization.properties ->> 'orgId' AS "orgId"
        FROM graph_nodes user
        JOIN graph_relationships occupancy
          ON occupancy.source_id = user.id AND occupancy.type = 'OCCUPIES'
        JOIN graph_relationships organization_seat
          ON organization_seat.target_id = occupancy.target_id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_nodes organization
          ON organization.id = organization_seat.source_id
        WHERE user.label = 'User'
          AND lower(user.properties ->> 'wallet') = lower($1)
          AND organization.label = 'Organization'
        ORDER BY organization.id
        LIMIT 1
      `,
      [wallet],
    );
    return row?.orgId ?? null;
  }

  async findOrganizationIdForJob(shortUuid: string): Promise<string | null> {
    const [row] = await queryRows<{ organizationId: string | null }>(
      this.postgres,
      `
        SELECT organization_id AS "organizationId"
        FROM job_search_documents
        WHERE short_uuid = $1
        LIMIT 1
      `,
      [shortUuid],
    );
    return row?.organizationId ?? null;
  }

  async getUserEmails(
    wallet: string,
  ): Promise<{ email: string; main: boolean }[]> {
    return queryRows(
      this.postgres,
      `
        SELECT email.properties ->> 'email' AS email,
          COALESCE(jsonb_boolean_value(email.properties, 'main'), false) AS main
        FROM graph_nodes user
        JOIN graph_relationships relationship
          ON relationship.source_id = user.id AND relationship.type = 'HAS_EMAIL'
        JOIN graph_nodes email ON email.id = relationship.target_id
        WHERE user.label = 'User'
          AND lower(user.properties ->> 'wallet') = lower($1)
          AND email.label IN ('UserEmail', 'UserUnverifiedEmail')
        ORDER BY main DESC, email.id
      `,
      [wallet],
    );
  }

  async emailExists(normalizedEmail: string): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1 FROM graph_nodes
          WHERE label IN ('UserEmail', 'UserUnverifiedEmail')
            AND properties ->> 'normalized' = $1
        ) AS found
      `,
      [normalizedEmail],
    );
    return row?.found ?? false;
  }

  async hasOrganizationSeat(
    wallet: string,
    orgId: string,
    ownerOnly = false,
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes user
          JOIN graph_relationships occupancy
            ON occupancy.source_id = user.id AND occupancy.type = 'OCCUPIES'
          JOIN graph_nodes seat ON seat.id = occupancy.target_id
          JOIN graph_relationships organization_seat
            ON organization_seat.target_id = seat.id
           AND organization_seat.type = 'HAS_USER_SEAT'
          JOIN graph_nodes organization
            ON organization.id = organization_seat.source_id
          WHERE user.label = 'User'
            AND lower(user.properties ->> 'wallet') = lower($1)
            AND organization.label = 'Organization'
            AND organization.properties ->> 'orgId' = $2
            AND (NOT $3::boolean OR seat.properties ->> 'seatType' = 'owner')
        ) AS found
      `,
      [wallet, orgId, ownerOnly],
    );
    return row?.found ?? false;
  }

  async organizationHasOwner(orgId: string): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes organization
          JOIN graph_relationships organization_seat
            ON organization_seat.source_id = organization.id
           AND organization_seat.type = 'HAS_USER_SEAT'
          JOIN graph_nodes seat ON seat.id = organization_seat.target_id
          JOIN graph_relationships occupancy
            ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
          WHERE organization.label = 'Organization'
            AND organization.properties ->> 'orgId' = $1
            AND seat.properties ->> 'seatType' = 'owner'
        ) AS found
      `,
      [orgId],
    );
    return row?.found ?? false;
  }

  async ownsJobFolder(wallet: string, folderId: string): Promise<boolean> {
    return this.hasDirectRelationship(
      "User",
      { wallet },
      "CREATED_FOLDER",
      "JobpostFolder",
      { id: folderId },
    );
  }

  async addUserEmail(
    wallet: string,
    email: string,
    normalizedEmail: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.postgres.transaction(async manager => {
      const user = await this.findNode("User", { wallet }, manager);
      if (!user) return undefined;
      const [existing] = await queryRows<{ id: string }>(
        manager,
        `
          SELECT id::text AS id FROM graph_nodes
          WHERE label IN ('UserEmail', 'UserUnverifiedEmail')
            AND properties ->> 'normalized' = $1
          FOR UPDATE
        `,
        [normalizedEmail],
      );
      if (existing) return undefined;
      const emailNode = await this.insertNode(manager, "UserUnverifiedEmail", {
        id: randomUUID(),
        email,
        normalized: normalizedEmail,
        main: false,
        createdTimestamp: Date.now(),
      });
      await this.insertRelationship(
        manager,
        user.nodeId,
        emailNode,
        "HAS_EMAIL",
      );
      return user.properties;
    });
  }

  async setMainEmail(
    wallet: string,
    normalizedEmail: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.postgres.transaction(async manager => {
      const user = await this.findNode("User", { wallet }, manager);
      if (!user) return undefined;
      const rows = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT email.id::text AS "nodeId"
          FROM graph_relationships relationship
          JOIN graph_nodes email ON email.id = relationship.target_id
          WHERE relationship.source_id = $1
            AND relationship.type = 'HAS_EMAIL'
            AND email.label = 'UserEmail'
            AND email.properties ->> 'normalized' = $2
        `,
        [user.nodeId, normalizedEmail],
      );
      if (!rows.length) return undefined;
      await queryRows(
        manager,
        `
          UPDATE graph_nodes email
          SET properties = jsonb_set(
            email.properties, '{main}',
            to_jsonb(email.id = $2::bigint), true
          ), updated_at = now()
          FROM graph_relationships relationship
          WHERE relationship.source_id = $1
            AND relationship.target_id = email.id
            AND relationship.type = 'HAS_EMAIL'
            AND email.label = 'UserEmail'
        `,
        [user.nodeId, rows[0].nodeId],
      );
      return user.properties;
    });
  }

  async removeUserEmail(
    wallet: string,
    normalizedEmail: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.postgres.transaction(async manager => {
      const user = await this.findNode("User", { wallet }, manager);
      if (!user) return undefined;
      const rows = await queryRows<{ id: string }>(
        manager,
        `
          DELETE FROM graph_nodes email
          USING graph_relationships relationship
          WHERE relationship.source_id = $1
            AND relationship.target_id = email.id
            AND relationship.type = 'HAS_EMAIL'
            AND email.label IN ('UserEmail', 'UserUnverifiedEmail')
            AND email.properties ->> 'normalized' = $2
          RETURNING email.id::text AS id
        `,
        [user.nodeId, normalizedEmail],
      );
      return rows.length ? user.properties : undefined;
    });
  }

  async findWalletByEmail(
    normalizedEmail: string,
  ): Promise<string | undefined> {
    const [row] = await queryRows<{ wallet: string }>(
      this.postgres,
      `
        SELECT user.properties ->> 'wallet' AS wallet
        FROM graph_nodes email
        JOIN graph_relationships relationship
          ON relationship.target_id = email.id AND relationship.type = 'HAS_EMAIL'
        JOIN graph_nodes user ON user.id = relationship.source_id
        WHERE email.label IN ('UserEmail', 'UserUnverifiedEmail')
          AND email.properties ->> 'normalized' = $1
          AND user.label = 'User'
        LIMIT 1
      `,
      [normalizedEmail],
    );
    return row?.wallet;
  }

  async findWalletByLinkedWallet(address: string): Promise<string | undefined> {
    const [row] = await queryRows<{ wallet: string }>(
      this.postgres,
      `
        SELECT user.properties ->> 'wallet' AS wallet
        FROM graph_nodes user
        JOIN graph_relationships relationship
          ON relationship.source_id = user.id
         AND relationship.type = 'HAS_LINKED_WALLET'
        JOIN graph_nodes wallet ON wallet.id = relationship.target_id
        WHERE user.label = 'User'
          AND wallet.label = 'LinkedWallet'
          AND lower(wallet.properties ->> 'address') = lower($1)
        LIMIT 1
      `,
      [address],
    );
    return row?.wallet;
  }

  async findPrivyId(wallet: string): Promise<string | undefined> {
    return (await this.findUserByWallet(wallet))?.privyId as string | undefined;
  }

  async findWalletByPrivyId(privyId: string): Promise<string | undefined> {
    const node = await this.findNode("User", { privyId });
    return node?.properties.wallet as string | undefined;
  }

  async verifyEmail(
    normalizedEmail: string,
    email: string,
  ): Promise<Record<string, unknown> | undefined> {
    const [row] = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        WITH verified AS (
          UPDATE graph_nodes email
          SET label = 'UserEmail',
              labels = ARRAY['UserEmail']::text[],
              properties = email.properties || jsonb_build_object(
                'email', $2::text,
                'normalized', $1,
                'verifiedTimestamp', (extract(epoch FROM clock_timestamp()) * 1000)::bigint
              ),
              updated_at = now()
          WHERE email.label = 'UserUnverifiedEmail'
            AND email.properties ->> 'normalized' = $1
          RETURNING email.id
        )
        SELECT user.properties
        FROM verified
        JOIN graph_relationships relationship
          ON relationship.target_id = verified.id
         AND relationship.type = 'HAS_EMAIL'
        JOIN graph_nodes user ON user.id = relationship.source_id
        LIMIT 1
      `,
      [normalizedEmail, email],
    );
    return row?.properties;
  }

  async syncLinkedWallets(wallet: string, addresses: string[]): Promise<void> {
    await this.postgres.transaction(async manager => {
      const user = await this.findNode("User", { wallet }, manager);
      if (!user) return;
      const normalized = [
        ...new Set(addresses.map(value => value.toLowerCase())),
      ];
      await queryRows(
        manager,
        `
          DELETE FROM graph_relationships relationship
          USING graph_nodes linked
          WHERE relationship.source_id = $1
            AND relationship.target_id = linked.id
            AND relationship.type = 'HAS_LINKED_WALLET'
            AND linked.label = 'LinkedWallet'
            AND NOT (lower(linked.properties ->> 'address') = ANY($2::text[]))
        `,
        [user.nodeId, normalized],
      );
      for (const address of addresses) {
        let linked = await this.findNode("LinkedWallet", { address }, manager);
        if (!linked) {
          const nodeId = await this.insertNode(manager, "LinkedWallet", {
            id: randomUUID(),
            address,
            createdTimestamp: Date.now(),
          });
          linked = { nodeId, properties: { address } };
        }
        await this.insertRelationship(
          manager,
          user.nodeId,
          linked.nodeId,
          "HAS_LINKED_WALLET",
        );
      }
    });
  }

  async createUser(
    properties: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const nodeId = await this.insertNode(this.postgres, "User", properties);
    const [row] = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      "SELECT properties FROM graph_nodes WHERE id = $1",
      [nodeId],
    );
    return row.properties;
  }

  async getActiveSubscriptionOrganizationIds(
    wallet: string,
  ): Promise<string[]> {
    const rows = await queryRows<{ orgId: string }>(
      this.postgres,
      `
        SELECT DISTINCT organization.properties ->> 'orgId' AS "orgId"
        FROM graph_nodes user
        JOIN graph_relationships occupancy
          ON occupancy.source_id = user.id AND occupancy.type = 'OCCUPIES'
        JOIN graph_nodes seat
          ON seat.id = occupancy.target_id AND seat.label = 'OrgUserSeat'
        JOIN graph_relationships organization_seat
          ON organization_seat.target_id = seat.id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_nodes organization ON organization.id = organization_seat.source_id
        JOIN graph_relationships organization_subscription
          ON organization_subscription.source_id = organization.id
         AND organization_subscription.type = 'HAS_SUBSCRIPTION'
        JOIN graph_nodes subscription
          ON subscription.id = organization_subscription.target_id
         AND subscription.label = 'OrgSubscription'
        WHERE user.label = 'User'
          AND lower(user.properties ->> 'wallet') = lower($1)
          AND seat.properties ->> 'seatType' = 'owner'
          AND subscription.properties ->> 'status' = 'active'
      `,
      [wallet],
    );
    return rows.map(row => row.orgId);
  }

  async deleteUser(wallet: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const user = await this.findNode("User", { wallet }, manager);
      if (!user) return false;
      await queryRows(
        manager,
        `
          WITH owned AS (
            SELECT relationship.target_id AS id
            FROM graph_relationships relationship
            JOIN graph_nodes target ON target.id = relationship.target_id
            WHERE relationship.source_id = $1
              AND relationship.type IN (
                'HAS_CONTACT_INFO', 'HAS_PREFERRED_CONTACT_INFO', 'HAS_SHOWCASE',
                'HAS_LOCATION', 'HAS_EMAIL', 'DID_SEARCH', 'HAS_CACHE_LOCK',
                'HAS_ADJACENT_REPO', 'HAS_LINKED_ACCOUNT', 'HAS_WORK_HISTORY'
              )
          ), nested AS (
            SELECT relationship.target_id AS id
            FROM graph_relationships relationship
            WHERE relationship.source_id IN (SELECT id FROM owned)
              AND relationship.type = 'WORKED_ON_REPO'
          )
          DELETE FROM graph_nodes
          WHERE id IN (SELECT id FROM owned UNION SELECT id FROM nested)
        `,
        [user.nodeId],
      );
      await queryRows(manager, "DELETE FROM graph_nodes WHERE id = $1", [
        user.nodeId,
      ]);
      return true;
    });
  }

  async countOrganizationUsers(orgId: string): Promise<number> {
    const [row] = await queryRows<{ count: string }>(
      this.postgres,
      `
        SELECT count(DISTINCT occupancy.source_id)::text AS count
        FROM graph_nodes organization
        JOIN graph_relationships organization_seat
          ON organization_seat.source_id = organization.id
         AND organization_seat.type = 'HAS_USER_SEAT'
        JOIN graph_relationships occupancy
          ON occupancy.target_id = organization_seat.target_id
         AND occupancy.type = 'OCCUPIES'
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
      `,
      [orgId],
    );
    return Number(row?.count ?? 0);
  }

  async addOrganizationSeat(
    orgId: string,
    wallet: string,
    seatType: "owner" | "member",
    seatId: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const organization = await this.findNode(
        "Organization",
        { orgId },
        manager,
      );
      const user = await this.findNode("User", { wallet }, manager);
      if (!organization || !user) return false;
      const existing = await this.hasOrganizationSeat(wallet, orgId);
      if (existing) return true;
      const seat = await this.insertNode(manager, "OrgUserSeat", {
        id: randomUUID(),
        seatId,
        seatType,
        createdTimestamp: Date.now(),
      });
      await this.insertRelationship(
        manager,
        organization.nodeId,
        seat,
        "HAS_USER_SEAT",
      );
      await this.insertRelationship(manager, user.nodeId, seat, "OCCUPIES");
      return true;
    });
  }

  async removeOrganizationSeat(
    orgId: string,
    wallet: string,
  ): Promise<boolean> {
    const rows = await queryRows<{ seatId: string }>(
      this.postgres,
      `
        DELETE FROM graph_relationships occupancy
        USING graph_nodes user, graph_nodes seat,
          graph_relationships organization_seat, graph_nodes organization
        WHERE occupancy.source_id = user.id
          AND occupancy.target_id = seat.id
          AND occupancy.type = 'OCCUPIES'
          AND user.label = 'User'
          AND lower(user.properties ->> 'wallet') = lower($1)
          AND organization_seat.target_id = seat.id
          AND organization_seat.source_id = organization.id
          AND organization_seat.type = 'HAS_USER_SEAT'
          AND organization.properties ->> 'orgId' = $2
        RETURNING seat.id::text AS "seatId"
      `,
      [wallet, orgId],
    );
    return rows.length > 0;
  }

  async transferOrganizationSeat(
    orgId: string,
    fromWallet: string,
    toWallet: string,
  ): Promise<{ seatType: string } | undefined> {
    return this.postgres.transaction(async manager => {
      const [row] = await queryRows<{ seatId: string; seatType: string }>(
        manager,
        `
          SELECT seat.id::text AS "seatId",
            seat.properties ->> 'seatType' AS "seatType"
          FROM graph_nodes organization
          JOIN graph_relationships organization_seat
            ON organization_seat.source_id = organization.id
           AND organization_seat.type = 'HAS_USER_SEAT'
          JOIN graph_nodes seat ON seat.id = organization_seat.target_id
          JOIN graph_relationships occupancy
            ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
          JOIN graph_nodes user ON user.id = occupancy.source_id
          WHERE organization.properties ->> 'orgId' = $1
            AND lower(user.properties ->> 'wallet') = lower($2)
          FOR UPDATE OF seat
        `,
        [orgId, fromWallet],
      );
      const toUser = await this.findNode("User", { wallet: toWallet }, manager);
      if (!row || !toUser) return undefined;
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE target_id = $1 AND type = 'OCCUPIES'",
        [row.seatId],
      );
      await this.insertRelationship(
        manager,
        toUser.nodeId,
        row.seatId,
        "OCCUPIES",
      );
      return { seatType: row.seatType };
    });
  }

  async getCryptoNative(wallet: string): Promise<boolean | undefined> {
    const [row] = await queryRows<{ value: boolean | null; present: boolean }>(
      this.postgres,
      `
        SELECT jsonb_boolean_value(properties, 'cryptoNative') AS value,
          properties ? 'cryptoNative' AS present
        FROM graph_nodes
        WHERE label = 'User'
          AND lower(properties ->> 'wallet') = lower($1)
        LIMIT 1
      `,
      [wallet],
    );
    return row?.present ? (row.value ?? false) : undefined;
  }

  async getTalentLists(orgId: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT list.properties
        FROM graph_nodes organization
        JOIN graph_relationships relationship
          ON relationship.source_id = organization.id
         AND relationship.type = 'HAS_TALENT_LIST'
        JOIN graph_nodes list ON list.id = relationship.target_id
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND list.label = 'TalentList'
        ORDER BY list.properties ->> 'name', list.id
      `,
      [orgId],
    );
    return rows.map(row => row.properties);
  }

  async createTalentList(
    orgId: string,
    name: string,
    description: string,
  ): Promise<{
    status: "created" | "conflict" | "not_found";
    properties?: Record<string, unknown>;
  }> {
    return this.postgres.transaction(async manager => {
      const organization = await this.findNode(
        "Organization",
        { orgId },
        manager,
      );
      if (!organization) return { status: "not_found" };
      const normalizedName = slugify(name);
      if (await this.findTalentListNode(orgId, normalizedName, manager)) {
        return { status: "conflict" };
      }
      const properties = {
        id: randomUUID(),
        name,
        description,
        normalizedName,
        createdTimestamp: Date.now(),
        updatedTimestamp: null,
      };
      const list = await this.insertNode(manager, "TalentList", properties);
      await this.insertRelationship(
        manager,
        organization.nodeId,
        list,
        "HAS_TALENT_LIST",
      );
      return { status: "created", properties };
    });
  }

  async getTalentList(
    orgId: string,
    normalizedName: string,
  ): Promise<Record<string, unknown> | undefined> {
    const list = await this.findTalentListNode(orgId, normalizedName);
    if (!list) return undefined;
    const users = await this.getRichUsers({
      orgId,
      talentListNodeId: list.nodeId,
      availableOnly: true,
    });
    return { ...list.properties, users };
  }

  async updateTalentList(
    orgId: string,
    normalizedName: string,
    name: string,
    description: string,
  ): Promise<{
    status: "updated" | "conflict" | "not_found";
    properties?: Record<string, unknown>;
  }> {
    return this.postgres.transaction(async manager => {
      const list = await this.findTalentListNode(
        orgId,
        normalizedName,
        manager,
      );
      if (!list) return { status: "not_found" };
      const nextNormalized = slugify(name);
      const duplicate = await this.findTalentListNode(
        orgId,
        nextNormalized,
        manager,
      );
      if (duplicate && duplicate.nodeId !== list.nodeId)
        return { status: "conflict" };
      const [row] = await queryRows<{ properties: Record<string, unknown> }>(
        manager,
        `
          UPDATE graph_nodes
          SET properties = properties || $2::jsonb, updated_at = now()
          WHERE id = $1
          RETURNING properties
        `,
        [
          list.nodeId,
          JSON.stringify({
            name,
            description,
            normalizedName: nextNormalized,
            updatedTimestamp: Date.now(),
          }),
        ],
      );
      return { status: "updated", properties: row.properties };
    });
  }

  async deleteTalentList(
    orgId: string,
    normalizedName: string,
  ): Promise<boolean> {
    const list = await this.findTalentListNode(orgId, normalizedName);
    if (!list) return false;
    await queryRows(this.postgres, "DELETE FROM graph_nodes WHERE id = $1", [
      list.nodeId,
    ]);
    return true;
  }

  async replaceTalentListUsers(
    orgId: string,
    normalizedName: string,
    wallets: string[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const list = await this.findTalentListNode(
        orgId,
        normalizedName,
        manager,
      );
      if (!list) return false;
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE source_id = $1 AND type = 'HAS_TALENT'",
        [list.nodeId],
      );
      await queryRows(
        manager,
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          )
          SELECT $1, user.id, 'HAS_TALENT', '', '{}'::jsonb
          FROM graph_nodes user
          WHERE user.label = 'User'
            AND lower(user.properties ->> 'wallet') = ANY($2::text[])
            AND COALESCE(jsonb_boolean_value(user.properties, 'available'), false)
          ON CONFLICT (source_id, target_id, type, relationship_key) DO NOTHING
        `,
        [
          list.nodeId,
          [...new Set(wallets.map(wallet => wallet.toLowerCase()))],
        ],
      );
      return true;
    });
  }

  async getAllProfiles(): Promise<Record<string, unknown>[]> {
    return this.getRichUsers({});
  }

  async searchThreatAccessUsers(
    query: string,
    permissionName: string,
    limit: number,
    grantedOnly: boolean,
  ): Promise<ThreatAccessUserRow[]> {
    const normalizedQuery = query.trim().toLowerCase();
    return queryRows<ThreatAccessUserRow>(
      this.postgres,
      `
        SELECT
          profile_user.properties ->> 'wallet' AS wallet,
          NULLIF(profile_user.properties ->> 'name', '') AS name,
          COALESCE(
            (
              SELECT NULLIF(account.properties ->> 'email', '')
              FROM graph_relationships relationship
              JOIN graph_nodes account ON account.id = relationship.target_id
              WHERE relationship.source_id = profile_user.id
                AND relationship.type = 'HAS_LINKED_ACCOUNT'
                AND account.label = 'LinkedAccount'
              ORDER BY account.id
              LIMIT 1
            ),
            (
              SELECT NULLIF(email.properties ->> 'email', '')
              FROM graph_relationships relationship
              JOIN graph_nodes email ON email.id = relationship.target_id
              WHERE relationship.source_id = profile_user.id
                AND relationship.type = 'HAS_EMAIL'
                AND email.label IN ('UserEmail', 'UserUnverifiedEmail')
              ORDER BY COALESCE(
                jsonb_boolean_value(email.properties, 'main'), false
              ) DESC, email.id
              LIMIT 1
            )
          ) AS email,
          COALESCE(
            (
              SELECT NULLIF(account.properties ->> 'github', '')
              FROM graph_relationships relationship
              JOIN graph_nodes account ON account.id = relationship.target_id
              WHERE relationship.source_id = profile_user.id
                AND relationship.type = 'HAS_LINKED_ACCOUNT'
                AND account.label = 'LinkedAccount'
              ORDER BY account.id
              LIMIT 1
            ),
            (
              SELECT NULLIF(github.properties ->> 'login', '')
              FROM graph_relationships relationship
              JOIN graph_nodes github ON github.id = relationship.target_id
              WHERE relationship.source_id = profile_user.id
                AND relationship.type = 'HAS_GITHUB_USER'
                AND github.label = 'GithubUser'
              ORDER BY github.id
              LIMIT 1
            )
          ) AS github,
          EXISTS (
            SELECT 1
            FROM graph_relationships relationship
            JOIN graph_nodes permission ON permission.id = relationship.target_id
            WHERE relationship.source_id = profile_user.id
              AND relationship.type = 'HAS_PERMISSION'
              AND permission.label = 'UserPermission'
              AND permission.properties ->> 'name' = $1
          ) AS "hasAccess"
        FROM graph_nodes profile_user
        WHERE profile_user.label = 'User'
          AND NULLIF(profile_user.properties ->> 'wallet', '') IS NOT NULL
          AND (
            NOT $3::boolean OR EXISTS (
              SELECT 1
              FROM graph_relationships relationship
              JOIN graph_nodes permission ON permission.id = relationship.target_id
              WHERE relationship.source_id = profile_user.id
                AND relationship.type = 'HAS_PERMISSION'
                AND permission.label = 'UserPermission'
                AND permission.properties ->> 'name' = $1
            )
          )
          AND (
            $2::text = ''
            OR position($2 in lower(profile_user.properties::text)) > 0
            OR EXISTS (
              SELECT 1
              FROM graph_relationships relationship
              JOIN graph_nodes identity ON identity.id = relationship.target_id
              WHERE relationship.source_id = profile_user.id
                AND relationship.type IN (
                  'HAS_LINKED_ACCOUNT', 'HAS_EMAIL', 'HAS_LINKED_WALLET',
                  'HAS_GITHUB_USER', 'HAS_CONTACT_INFO'
                )
                AND position($2 in lower(identity.properties::text)) > 0
            )
          )
        ORDER BY "hasAccess" DESC,
          lower(COALESCE(
            NULLIF(profile_user.properties ->> 'name', ''),
            NULLIF(profile_user.properties ->> 'wallet', '')
          )), profile_user.id
        LIMIT $4
      `,
      [permissionName, normalizedQuery, grantedOnly, limit],
    );
  }

  async getProfile(
    wallet: string,
  ): Promise<Record<string, unknown> | undefined> {
    return (await this.getRichUsers({ wallet }))[0];
  }

  async getAvailableUsers(
    orgId?: string | null,
  ): Promise<Record<string, unknown>[]> {
    return this.getRichUsers({ orgId: orgId ?? null, availableOnly: true });
  }

  async setRecruiterNote(
    wallet: string,
    note: string,
    orgId: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const user = await this.findNode("User", { wallet }, manager);
      const organization = await this.findNode(
        "Organization",
        { orgId },
        manager,
      );
      if (!user || !organization) return false;
      const [existing] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT note.id::text AS "nodeId"
          FROM graph_relationships user_note
          JOIN graph_nodes note ON note.id = user_note.target_id
          JOIN graph_relationships organization_note
            ON organization_note.target_id = note.id
           AND organization_note.type = 'HAS_TALENT_NOTE'
          WHERE user_note.source_id = $1
            AND user_note.type = 'HAS_RECRUITER_NOTE'
            AND organization_note.source_id = $2
          LIMIT 1
        `,
        [user.nodeId, organization.nodeId],
      );
      if (existing) {
        await queryRows(
          manager,
          `
            UPDATE graph_nodes
            SET properties = properties || $2::jsonb, updated_at = now()
            WHERE id = $1
          `,
          [
            existing.nodeId,
            JSON.stringify({ note, updatedTimestamp: Date.now() }),
          ],
        );
        return true;
      }
      const noteNode = await this.insertNode(manager, "RecruiterNote", {
        id: randomUUID(),
        note,
        createdTimestamp: Date.now(),
      });
      await this.insertRelationship(
        manager,
        user.nodeId,
        noteNode,
        "HAS_RECRUITER_NOTE",
      );
      await this.insertRelationship(
        manager,
        organization.nodeId,
        noteNode,
        "HAS_TALENT_NOTE",
      );
      return true;
    });
  }

  private async getRichUsers(options: {
    orgId?: string | null;
    availableOnly?: boolean;
    talentListNodeId?: string;
    wallet?: string;
  }): Promise<Record<string, unknown>[]> {
    const parameters: unknown[] = [options.orgId ?? null];
    const predicates = ["user.label = 'User'"];
    if (options.wallet) {
      parameters.push(options.wallet);
      predicates.push(
        `lower(user.properties ->> 'wallet') = lower($${parameters.length})`,
      );
    }
    if (options.availableOnly) {
      predicates.push(
        "COALESCE(jsonb_boolean_value(user.properties, 'available'), false)",
      );
      predicates.push(`
        ($1::text IS NULL OR NOT EXISTS (
          SELECT 1
          FROM graph_relationships verification
          JOIN graph_nodes organization ON organization.id = verification.target_id
          WHERE verification.source_id = user.id
            AND verification.type = 'VERIFIED_FOR_ORG'
            AND organization.properties ->> 'orgId' = $1
        ))
      `);
    }
    if (options.talentListNodeId) {
      parameters.push(options.talentListNodeId);
      predicates.push(`EXISTS (
        SELECT 1 FROM graph_relationships talent
        WHERE talent.source_id = $${parameters.length}
          AND talent.target_id = user.id
          AND talent.type = 'HAS_TALENT'
      )`);
    }
    const rows = await queryRows<{ profile: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT ${richUserPayload("$1")} AS profile
        FROM graph_nodes user
        WHERE ${predicates.join("\n          AND ")}
        ORDER BY user.id
      `,
      parameters,
    );
    return rows.map(row => row.profile);
  }

  private async findTalentListNode(
    orgId: string,
    normalizedName: string,
    executor: QueryExecutor = this.postgres,
  ): Promise<GraphNode<Record<string, unknown>> | undefined> {
    const [row] = await queryRows<GraphNode<Record<string, unknown>>>(
      executor,
      `
        SELECT list.id::text AS "nodeId", list.properties
        FROM graph_nodes organization
        JOIN graph_relationships relationship
          ON relationship.source_id = organization.id
         AND relationship.type = 'HAS_TALENT_LIST'
        JOIN graph_nodes list ON list.id = relationship.target_id
        WHERE organization.label = 'Organization'
          AND organization.properties ->> 'orgId' = $1
          AND list.label = 'TalentList'
          AND list.properties ->> 'normalizedName' = $2
        LIMIT 1
      `,
      [orgId, normalizedName],
    );
    return row;
  }

  private async hasDirectRelationship(
    sourceLabel: string,
    sourceWhere: Record<string, unknown>,
    relationshipType: string,
    targetLabel: string,
    targetWhere: Record<string, unknown>,
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes source
          JOIN graph_relationships relationship
            ON relationship.source_id = source.id AND relationship.type = $3
          JOIN graph_nodes target ON target.id = relationship.target_id
          WHERE source.label = $1 AND source.properties @> $2::jsonb
            AND target.label = $4 AND target.properties @> $5::jsonb
        ) AS found
      `,
      [
        sourceLabel,
        JSON.stringify(sourceWhere),
        relationshipType,
        targetLabel,
        JSON.stringify(targetWhere),
      ],
    );
    return row?.found ?? false;
  }

  private async findNode(
    label: string,
    where: Record<string, unknown>,
    executor: QueryExecutor = this.postgres,
  ): Promise<GraphNode<Record<string, unknown>> | undefined> {
    const [row] = await queryRows<GraphNode<Record<string, unknown>>>(
      executor,
      `
        SELECT id::text AS "nodeId", properties
        FROM graph_nodes
        WHERE label = $1 AND properties @> $2::jsonb
        ORDER BY id LIMIT 1
      `,
      [label, JSON.stringify(where)],
    );
    return row;
  }

  private async insertNode(
    executor: QueryExecutor,
    label: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const id = String(properties.id ?? randomUUID());
    const [row] = await queryRows<{ nodeId: string }>(
      executor,
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS "nodeId"
      `,
      [label, `runtime:${label}:${id}`, JSON.stringify({ ...properties, id })],
    );
    return row.nodeId;
  }

  private async insertRelationship(
    executor: QueryExecutor,
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    await queryRows(
      executor,
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', $4::jsonb)
        ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
          properties = graph_relationships.properties || EXCLUDED.properties,
          updated_at = now()
      `,
      [sourceId, targetId, type, JSON.stringify(properties)],
    );
  }
}
