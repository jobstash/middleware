import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PostgresService } from "./postgres.service";

type QueryExecutor = PostgresService | EntityManager;

type NodeRecord = {
  nodeId: string;
  properties: Record<string, unknown>;
};

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

@Injectable()
export class ProfileRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getUserRepos(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ repo: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', repository.properties -> 'id',
          'name', repository.properties -> 'nameWithOwner',
          'description', repository.properties -> 'description',
          'timestamp', COALESCE(
            jsonb_numeric_value(repository.properties, 'updatedTimestamp'),
            jsonb_numeric_value(repository.properties, 'updatedAt')
          ),
          'org', COALESCE((
            SELECT jsonb_build_object(
              'name', organization.properties ->> 'name',
              'url', COALESCE((
                SELECT website.properties ->> 'url'
                FROM graph_relationships website_relationship
                JOIN graph_nodes website
                  ON website.id = website_relationship.target_id
                WHERE website_relationship.source_id = organization.id
                  AND website_relationship.type = 'HAS_WEBSITE'
                LIMIT 1
              ), ''),
              'logo', COALESCE(
                organization.properties -> 'logo',
                organization.properties -> 'logoUrl'
              )
            )
            FROM graph_relationships github_repository
            JOIN graph_nodes github_organization
              ON github_organization.id = github_repository.source_id
             AND github_organization.label = 'GithubOrganization'
            JOIN graph_relationships organization_github
              ON organization_github.target_id = github_organization.id
             AND organization_github.type = 'HAS_GITHUB'
            JOIN graph_nodes organization
              ON organization.id = organization_github.source_id
             AND organization.label = 'Organization'
            WHERE github_repository.target_id = repository.id
              AND github_repository.type = 'HAS_REPOSITORY'
            LIMIT 1
          ), jsonb_build_object('name', '', 'url', '', 'logo', NULL)),
          'tags', COALESCE((
            SELECT jsonb_agg(DISTINCT tag.properties || jsonb_build_object(
              'canTeach', COALESCE(
                jsonb_boolean_value(skill.properties, 'canTeach'), false
              )
            ))
            FROM graph_relationships used_tag
            JOIN graph_nodes tag
              ON tag.id = used_tag.target_id AND tag.label = 'Tag'
            JOIN graph_relationships used_on
              ON used_on.source_id = tag.id
             AND used_on.target_id = repository.id
             AND used_on.type = 'USED_ON'
            JOIN graph_relationships skill
              ON skill.source_id = account.id
             AND skill.target_id = tag.id
             AND skill.type = 'HAS_SKILL'
            WHERE used_tag.source_id = github.id
              AND used_tag.type = 'USED_TAG'
          ), '[]'::jsonb),
          'contribution', contribution.properties -> 'summary'
        ) AS repo
        FROM graph_nodes account
        JOIN graph_relationships account_github
          ON account_github.source_id = account.id
         AND account_github.type = 'HAS_GITHUB_USER'
        JOIN graph_nodes github
          ON github.id = account_github.target_id AND github.label = 'GithubUser'
        JOIN graph_relationships contribution
          ON contribution.source_id = github.id
         AND contribution.type = 'CONTRIBUTED_TO'
        JOIN graph_nodes repository
          ON repository.id = contribution.target_id
         AND repository.label = 'GithubRepository'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY COALESCE(
          jsonb_numeric_value(repository.properties, 'updatedTimestamp'), 0
        ) DESC, repository.id
      `,
      [wallet],
    );
    return rows.map(row => row.repo);
  }

  async getReviewedOrganizations(
    wallet: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'compensation', jsonb_build_object(
            'salary', review.properties -> 'salary',
            'currency', review.properties -> 'currency',
            'offersTokenAllocation', review.properties -> 'offersTokenAllocation'
          ),
          'rating', jsonb_build_object(
            'onboarding', review.properties -> 'onboarding',
            'careerGrowth', review.properties -> 'careerGrowth',
            'benefits', review.properties -> 'benefits',
            'workLifeBalance', review.properties -> 'workLifeBalance',
            'diversityInclusion', review.properties -> 'diversityInclusion',
            'management', review.properties -> 'management',
            'product', review.properties -> 'product',
            'compensation', review.properties -> 'compensation'
          ),
          'review', jsonb_build_object(
            'id', review.properties -> 'id',
            'title', review.properties -> 'title',
            'location', review.properties -> 'location',
            'timezone', review.properties -> 'timezone',
            'pros', review.properties -> 'pros',
            'cons', review.properties -> 'cons'
          ),
          'reviewedTimestamp', review.properties -> 'reviewedTimestamp',
          'org', organization.properties || jsonb_build_object(
            'docs', graph_first_related_text(organization.id, 'HAS_DOCSITE', 'url'),
            'github', graph_first_related_text(organization.id, 'HAS_GITHUB', 'login'),
            'website', graph_first_related_text(organization.id, 'HAS_WEBSITE', 'url'),
            'discord', graph_first_related_text(organization.id, 'HAS_DISCORD', 'invite'),
            'telegram', graph_first_related_text(organization.id, 'HAS_TELEGRAM', 'username'),
            'twitter', graph_first_related_text(organization.id, 'HAS_TWITTER', 'username')
          )
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships account_review
          ON account_review.source_id = account.id
         AND account_review.type = 'LEFT_REVIEW'
        JOIN graph_nodes review
          ON review.id = account_review.target_id AND review.label = 'OrgReview'
        JOIN graph_relationships organization_review
          ON organization_review.target_id = review.id
         AND organization_review.type = 'HAS_REVIEW'
        JOIN graph_nodes organization
          ON organization.id = organization_review.source_id
         AND organization.label = 'Organization'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY review.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async findVerificationOrganizationsByNames(
    wallet: string,
    names: string[],
  ): Promise<Record<string, unknown>[]> {
    if (!names.length) return [];
    return this.getVerificationOrganizations(
      wallet,
      `organization.properties ->> 'name' = ANY($2::text[])`,
      [names],
    );
  }

  async findVerificationOrganizationsByEmails(
    wallet: string,
    emails: string[],
  ): Promise<Record<string, unknown>[]> {
    const domains = [
      ...new Set(
        emails.map(email => email.split("@")[1]?.toLowerCase()).filter(Boolean),
      ),
    ];
    if (!domains.length) return [];
    const organizations = await this.getVerificationOrganizations(
      wallet,
      `EXISTS (
        SELECT 1
        FROM graph_relationships website_relationship
        JOIN graph_nodes website ON website.id = website_relationship.target_id
        CROSS JOIN unnest($2::text[]) AS requested_domain(domain)
        WHERE website_relationship.source_id = organization.id
          AND website_relationship.type = 'HAS_WEBSITE'
          AND regexp_replace(
            lower(website.properties ->> 'url'),
            '^https?://(www[.])?([^/:]+).*$','\\2'
          ) LIKE '%' || requested_domain.domain || '%'
      )`,
      [domains],
    );
    return organizations.map(organization => {
      const url = String(organization.url ?? "");
      let hostname = url.toLowerCase();
      try {
        hostname = new URL(url).hostname.toLowerCase();
      } catch {
        // Keep the raw value for parity with permissive historical URL data.
      }
      const account = emails.find(email => {
        const domain = email.split("@")[1]?.toLowerCase();
        return domain ? hostname.includes(domain) : false;
      });
      return { ...organization, account: account ?? "" };
    });
  }

  async findOrganizationIdsByEmails(emails: string[]): Promise<string[]> {
    const organizations = await this.findVerificationOrganizationsByEmails(
      "",
      emails,
    );
    return organizations.map(value => String(value.id));
  }

  async replaceVerifications(
    wallet: string,
    organizations: {
      id: string;
      credential: string;
      account: string;
    }[],
  ): Promise<void> {
    await this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return;
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE source_id = $1 AND type = 'VERIFIED_FOR_ORG'",
        [account.nodeId],
      );
      for (const verification of organizations) {
        const organization = await this.findNode(
          "Organization",
          { orgId: verification.id },
          manager,
        );
        if (!organization) continue;
        await this.insertRelationship(
          manager,
          account.nodeId,
          organization.nodeId,
          "VERIFIED_FOR_ORG",
          {
            credential: verification.credential,
            account: verification.account,
            verifiedTimestamp: Date.now(),
          },
        );
      }
    });
  }

  async ensureOrganizationVerification(
    wallet: string,
    normalizedOrganizationName: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      const organization = await this.findNode(
        "Organization",
        { normalizedName: normalizedOrganizationName },
        manager,
      );
      if (!account || !organization) return false;

      const [identity] = await queryRows<{ email: string | null }>(
        manager,
        `
          SELECT COALESCE(
            (
              SELECT NULLIF(linked.properties ->> 'email', '')
              FROM graph_relationships relationship
              JOIN graph_nodes linked ON linked.id = relationship.target_id
              WHERE relationship.source_id = $1
                AND relationship.type = 'HAS_LINKED_ACCOUNT'
                AND linked.label = 'LinkedAccount'
              ORDER BY linked.id
              LIMIT 1
            ),
            (
              SELECT NULLIF(email.properties ->> 'email', '')
              FROM graph_relationships relationship
              JOIN graph_nodes email ON email.id = relationship.target_id
              WHERE relationship.source_id = $1
                AND relationship.type = 'HAS_EMAIL'
                AND email.label IN ('UserEmail', 'UserUnverifiedEmail')
              ORDER BY COALESCE(
                jsonb_boolean_value(email.properties, 'main'), false
              ) DESC, email.id
              LIMIT 1
            )
          ) AS email
        `,
        [account.nodeId],
      );
      const email = identity?.email ?? null;
      const verifiedTimestamp = Date.now();

      await this.insertRelationship(
        manager,
        account.nodeId,
        organization.nodeId,
        "VERIFIED_FOR_ORG",
        {
          credential: email ? "email" : "membership",
          account: email ?? wallet,
          verifiedTimestamp,
          verificationSource: "threat_intel_access",
        },
      );
      await this.upsertOwnedNode(
        manager,
        account.nodeId,
        "HAS_VERIFICATION_STATUS",
        "UserVerificationStatus",
        { status: "VERIFIED", verifiedTimestamp },
      );
      return true;
    });
  }

  async getVerifications(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', organization.properties -> 'orgId',
          'name', organization.properties -> 'name',
          'slug', organization.properties -> 'normalizedName',
          'url', to_jsonb(graph_first_related_text(organization.id, 'HAS_WEBSITE', 'url')),
          'logo', COALESCE(
            organization.properties -> 'logoUrl', organization.properties -> 'logo'
          ),
          'hasOwner', EXISTS (
            SELECT 1
            FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isOwner', EXISTS (
            SELECT 1
            FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isMember', EXISTS (
            SELECT 1
            FROM graph_relationships organization_seat
            JOIN graph_relationships occupancy
              ON occupancy.target_id = organization_seat.target_id
             AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
          ),
          'credential', verification.properties -> 'credential',
          'account', verification.properties -> 'account'
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships verification
          ON verification.source_id = account.id
         AND verification.type = 'VERIFIED_FOR_ORG'
        JOIN graph_nodes organization
          ON organization.id = verification.target_id
         AND organization.label = 'Organization'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY organization.properties ->> 'name', organization.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async setVerificationStatus(
    wallet: string,
    status: string,
    timestamp?: number | null,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await this.upsertOwnedNode(
        manager,
        account.nodeId,
        "HAS_VERIFICATION_STATUS",
        "UserVerificationStatus",
        {
          status,
          verifiedTimestamp: timestamp ?? null,
        },
      );
      return true;
    });
  }

  async getVerificationStatus(
    wallet: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.getFirstOwnedNode(
      wallet,
      "HAS_VERIFICATION_STATUS",
      "UserVerificationStatus",
    );
  }

  async getShowcases(wallet: string): Promise<Record<string, unknown>[]> {
    return this.getOwnedNodes(wallet, "HAS_SHOWCASE", "UserShowCase");
  }

  async getSkills(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT tag.properties || jsonb_build_object(
          'canTeach', COALESCE(
            jsonb_boolean_value(relationship.properties, 'canTeach'), false
          )
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id AND relationship.type = 'HAS_SKILL'
        JOIN graph_nodes tag
          ON tag.id = relationship.target_id AND tag.label = 'Tag'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY tag.properties ->> 'name', tag.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async updateLinkedAccount(
    wallet: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    return this.updateOwnedNode(
      wallet,
      "HAS_LINKED_ACCOUNT",
      "LinkedAccount",
      properties,
    );
  }

  async updateLocation(
    wallet: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    return this.updateOwnedNode(
      wallet,
      "HAS_LOCATION",
      "UserLocation",
      properties,
    );
  }

  async updateAvailability(
    wallet: string,
    available: boolean,
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        UPDATE graph_nodes
        SET properties = properties || $2::jsonb, updated_at = now()
        WHERE label = 'User'
          AND lower(properties ->> 'wallet') = lower($1)
        RETURNING id::text AS id
      `,
      [wallet, JSON.stringify({ available, updatedTimestamp: Date.now() })],
    );
    return rows.length > 0;
  }

  async replaceShowcases(
    wallet: string,
    showcases: Record<string, unknown>[],
  ): Promise<boolean> {
    return this.replaceOwnedNodes(
      wallet,
      "HAS_SHOWCASE",
      "UserShowCase",
      showcases.map(showcase => ({ id: randomUUID(), ...showcase })),
    );
  }

  async replaceSkills(
    wallet: string,
    skills: { id: string; normalizedName: string; canTeach: boolean }[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE source_id = $1 AND type = 'HAS_SKILL'",
        [account.nodeId],
      );
      for (const skill of skills) {
        const tag = await this.findNode(
          "Tag",
          { id: skill.id, normalizedName: skill.normalizedName },
          manager,
        );
        if (!tag) continue;
        await this.insertRelationship(
          manager,
          account.nodeId,
          tag.nodeId,
          "HAS_SKILL",
          { canTeach: skill.canTeach },
        );
      }
      return true;
    });
  }

  async upsertReview(
    wallet: string,
    orgId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      const organization = await this.findNode(
        "Organization",
        { orgId },
        manager,
      );
      if (!account || !organization) return false;
      const [existing] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT review.id::text AS "nodeId"
          FROM graph_relationships account_review
          JOIN graph_nodes review ON review.id = account_review.target_id
          JOIN graph_relationships organization_review
            ON organization_review.target_id = review.id
           AND organization_review.type = 'HAS_REVIEW'
          WHERE account_review.source_id = $1
            AND account_review.type = 'LEFT_REVIEW'
            AND organization_review.source_id = $2
          LIMIT 1
        `,
        [account.nodeId, organization.nodeId],
      );
      const properties = { ...patch, reviewedTimestamp: Date.now() };
      if (existing) {
        await queryRows(
          manager,
          "UPDATE graph_nodes SET properties = properties || $2::jsonb, updated_at = now() WHERE id = $1",
          [existing.nodeId, JSON.stringify(properties)],
        );
      } else {
        const review = await this.insertNode(manager, "OrgReview", {
          id: randomUUID(),
          ...properties,
        });
        await this.insertRelationship(
          manager,
          account.nodeId,
          review,
          "LEFT_REVIEW",
        );
        await this.insertRelationship(
          manager,
          organization.nodeId,
          review,
          "HAS_REVIEW",
        );
      }
      return true;
    });
  }

  async findReview(id: string): Promise<Record<string, unknown> | undefined> {
    const [review] = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT review.properties
        FROM graph_nodes review
        JOIN graph_relationships organization_review
          ON organization_review.target_id = review.id
         AND organization_review.type = 'HAS_REVIEW'
        JOIN graph_nodes organization
          ON organization.id = organization_review.source_id
         AND organization.label = 'Organization'
        WHERE review.label = 'OrgReview'
          AND review.properties @> $1::jsonb
        ORDER BY review.id
        LIMIT 1
      `,
      [JSON.stringify({ id })],
    );
    return review?.properties;
  }

  async updateRepoContribution(
    wallet: string,
    repositoryId: string,
    summary: string,
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        UPDATE graph_relationships contribution
        SET properties = contribution.properties || jsonb_build_object(
          'summary', $3::text
        ), updated_at = now()
        FROM graph_nodes account, graph_relationships account_github,
          graph_nodes github, graph_nodes repository
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
          AND account_github.source_id = account.id
          AND account_github.type = 'HAS_GITHUB_USER'
          AND github.id = account_github.target_id
          AND contribution.source_id = github.id
          AND contribution.type = 'CONTRIBUTED_TO'
          AND repository.id = contribution.target_id
          AND repository.label = 'GithubRepository'
          AND repository.properties ->> 'id' = $2
        RETURNING contribution.id::text AS id
      `,
      [wallet, repositoryId, summary],
    );
    return rows.length > 0;
  }

  async updateRepoTags(
    wallet: string,
    repositoryId: string,
    tags: { normalizedName: string; canTeach: boolean }[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [context] = await queryRows<{
        accountId: string;
        githubId: string;
        repositoryNodeId: string;
      }>(
        manager,
        `
          SELECT account.id::text AS "accountId", github.id::text AS "githubId",
            repository.id::text AS "repositoryNodeId"
          FROM graph_nodes account
          JOIN graph_relationships account_github
            ON account_github.source_id = account.id
           AND account_github.type = 'HAS_GITHUB_USER'
          JOIN graph_nodes github ON github.id = account_github.target_id
          JOIN graph_relationships contribution
            ON contribution.source_id = github.id
           AND contribution.type = 'CONTRIBUTED_TO'
          JOIN graph_nodes repository ON repository.id = contribution.target_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND repository.properties ->> 'id' = $2
          LIMIT 1
        `,
        [wallet, repositoryId],
      );
      if (!context) return false;
      await queryRows(
        manager,
        `
          WITH old_tags AS MATERIALIZED (
            SELECT DISTINCT used_tag.target_id AS tag_id
            FROM graph_relationships used_tag
            JOIN graph_relationships used_on
              ON used_on.source_id = used_tag.target_id
             AND used_on.target_id = $2
             AND used_on.type = 'USED_ON'
            WHERE used_tag.source_id = $1
              AND used_tag.type = 'USED_TAG'
          )
          DELETE FROM graph_relationships relationship
          USING old_tags
          WHERE (
              relationship.source_id = $1
              AND relationship.target_id = old_tags.tag_id
              AND relationship.type = 'USED_TAG'
            ) OR (
              relationship.source_id = old_tags.tag_id
              AND relationship.target_id = $2
              AND relationship.type = 'USED_ON'
            )
        `,
        [context.githubId, context.repositoryNodeId],
      );
      const tagNodes = await queryRows<NodeRecord>(
        manager,
        `
          SELECT id::text AS "nodeId", properties
          FROM graph_nodes
          WHERE label = 'Tag'
            AND properties ->> 'normalizedName' = ANY($1::text[])
        `,
        [[...new Set(tags.map(tag => tag.normalizedName))]],
      );
      for (const tag of tagNodes) {
        const input = tags.find(
          value => value.normalizedName === tag.properties.normalizedName,
        );
        await this.insertRelationship(
          manager,
          context.accountId,
          tag.nodeId,
          "HAS_SKILL",
          { canTeach: input?.canTeach ?? false },
        );
        await this.insertRelationship(
          manager,
          context.githubId,
          tag.nodeId,
          "USED_TAG",
        );
        await this.insertRelationship(
          manager,
          tag.nodeId,
          context.repositoryNodeId,
          "USED_ON",
        );
      }
      return true;
    });
  }

  async getCacheLock(wallet: string): Promise<number | null> {
    const [row] = await queryRows<{ expiresAt: string }>(
      this.postgres,
      `
        SELECT lock.expires_at::text AS "expiresAt"
        FROM user_cache_locks lock
        JOIN graph_nodes account ON account.id = lock.user_node_id
        WHERE lower(account.properties ->> 'wallet') = lower($1)
      `,
      [wallet],
    );
    return row ? Number(row.expiresAt) : null;
  }

  async setCacheLocks(
    wallets: string[],
    expiresAt: number,
  ): Promise<number | null> {
    const rows = await queryRows<{ expiresAt: string }>(
      this.postgres,
      `
        INSERT INTO user_cache_locks (user_node_id, expires_at, updated_at)
        SELECT id, $2, now()
        FROM graph_nodes
        WHERE label = 'User'
          AND lower(properties ->> 'wallet') = ANY($1::text[])
        ON CONFLICT (user_node_id) DO UPDATE SET
          expires_at = EXCLUDED.expires_at,
          updated_at = now()
        RETURNING expires_at::text AS "expiresAt"
      `,
      [[...new Set(wallets.map(wallet => wallet.toLowerCase()))], expiresAt],
    );
    return rows[0] ? Number(rows[0].expiresAt) : null;
  }

  async replaceWorkHistory(
    wallet: string,
    cryptoNative: boolean,
    cryptoAdjacent: boolean,
    workHistory: Record<string, unknown>[],
    adjacentRepos: Record<string, unknown>[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await queryRows(
        manager,
        `
          DELETE FROM graph_nodes repository
          USING graph_relationships account_history,
            graph_relationships history_repository
          WHERE account_history.source_id = $1
            AND account_history.type = 'HAS_WORK_HISTORY'
            AND history_repository.source_id = account_history.target_id
            AND history_repository.type = 'WORKED_ON_REPO'
            AND repository.id = history_repository.target_id
            AND repository.label = 'UserWorkHistoryRepo'
        `,
        [account.nodeId],
      );
      await this.deleteOwnedNodes(manager, account.nodeId, [
        "HAS_WORK_HISTORY",
        "HAS_ADJACENT_REPO",
      ]);
      await queryRows(
        manager,
        `
          UPDATE graph_nodes SET properties = properties || $2::jsonb,
            updated_at = now() WHERE id = $1
        `,
        [account.nodeId, JSON.stringify({ cryptoNative, cryptoAdjacent })],
      );
      for (const history of workHistory) {
        const repositories = Array.isArray(history.repositories)
          ? (history.repositories as Record<string, unknown>[])
          : [];
        const historyNode = await this.insertNode(manager, "UserWorkHistory", {
          ...history,
          repositories: undefined,
          compositeKey: `${wallet}::${String(history.name ?? history.login ?? "")}`,
          createdAt: history.createdAt ?? Date.now(),
          updatedAt: history.updatedAt ?? null,
        });
        await this.insertRelationship(
          manager,
          account.nodeId,
          historyNode,
          "HAS_WORK_HISTORY",
        );
        for (const repository of repositories) {
          const repositoryNode = await this.insertNode(
            manager,
            "UserWorkHistoryRepo",
            {
              ...repository,
              compositeKey: `${wallet}::${String(history.name ?? history.login ?? "")}::${String(repository.url ?? repository.name ?? "")}`,
              createdAt: repository.createdAt ?? Date.now(),
              updatedAt: repository.updatedAt ?? null,
            },
          );
          await this.insertRelationship(
            manager,
            historyNode,
            repositoryNode,
            "WORKED_ON_REPO",
          );
        }
      }
      for (const adjacent of adjacentRepos) {
        const node = await this.insertNode(manager, "UserAdjacentRepo", {
          ...adjacent,
          createdAt: adjacent.createdAt ?? Date.now(),
          updatedAt: adjacent.updatedAt ?? null,
        });
        await this.insertRelationship(
          manager,
          account.nodeId,
          node,
          "HAS_ADJACENT_REPO",
        );
      }
      return true;
    });
  }

  async replaceGithubRepositories(
    wallet: string,
    organizations: {
      login: string;
      repositories: { name: string; description?: string | null }[];
    }[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [github] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT target_id::text AS "nodeId"
          FROM graph_relationships relationship
          JOIN graph_nodes account ON account.id = relationship.source_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND relationship.type = 'HAS_GITHUB_USER'
          LIMIT 1
        `,
        [wallet],
      );
      if (!github) return false;
      const names: string[] = [];
      for (const organization of organizations) {
        const githubOrganization = await this.findNode(
          "GithubOrganization",
          { login: organization.login },
          manager,
        );
        for (const repository of organization.repositories) {
          const nameWithOwner = `${organization.login}/${repository.name}`;
          names.push(nameWithOwner);
          let repo = await this.findNode(
            "GithubRepository",
            { nameWithOwner },
            manager,
          );
          if (!repo) {
            const nodeId = await this.insertNode(manager, "GithubRepository", {
              id: randomUUID(),
              name: repository.name,
              nameWithOwner,
              description: repository.description ?? null,
              createdTimestamp: Date.now(),
              updatedTimestamp: Date.now(),
            });
            repo = { nodeId, properties: { nameWithOwner } };
          } else {
            await queryRows(
              manager,
              `
                UPDATE graph_nodes
                SET properties = properties || jsonb_build_object(
                  'name', $2::text,
                  'nameWithOwner', $3::text,
                  'description', to_jsonb($4::text),
                  'updatedTimestamp', $5::bigint
                ), updated_at = now()
                WHERE id = $1
              `,
              [
                repo.nodeId,
                repository.name,
                nameWithOwner,
                repository.description ?? null,
                Date.now(),
              ],
            );
          }
          await this.insertRelationship(
            manager,
            github.nodeId,
            repo.nodeId,
            "CONTRIBUTED_TO",
          );
          if (githubOrganization) {
            await this.insertRelationship(
              manager,
              githubOrganization.nodeId,
              repo.nodeId,
              "HAS_REPOSITORY",
            );
          }
        }
      }
      await queryRows(
        manager,
        `
          DELETE FROM graph_relationships relationship
          USING graph_nodes repository
          WHERE relationship.source_id = $1
            AND relationship.target_id = repository.id
            AND relationship.type = 'CONTRIBUTED_TO'
            AND NOT (repository.properties ->> 'nameWithOwner' = ANY($2::text[]))
        `,
        [github.nodeId, names],
      );
      return true;
    });
  }

  async blockOrganizationJobs(wallet: string, orgId: string): Promise<boolean> {
    return this.setDirectRelationship(
      wallet,
      "Organization",
      { orgId },
      "BLOCKED_ORG_JOBS",
    );
  }

  async setJobInteraction(
    wallet: string,
    shortUuid: string,
    type: "APPLIED_TO" | "BOOKMARKED" | "VIEWED_DETAILS",
  ): Promise<boolean> {
    const account = await this.findNode("User", { wallet });
    const [job] = await queryRows<{ nodeId: string }>(
      this.postgres,
      `SELECT job_node_id::text AS "nodeId" FROM job_search_documents WHERE short_uuid = $1`,
      [shortUuid],
    );
    if (!account || !job) return false;
    await this.insertRelationship(
      this.postgres,
      account.nodeId,
      job.nodeId,
      type,
      { createdTimestamp: Date.now() },
    );
    return true;
  }

  async hasJobInteraction(
    wallet: string,
    shortUuid: string,
    type: "APPLIED_TO" | "BOOKMARKED" | "VIEWED_DETAILS",
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes account
          JOIN graph_relationships relationship
            ON relationship.source_id = account.id AND relationship.type = $3
          JOIN job_search_documents job
            ON job.job_node_id = relationship.target_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND job.short_uuid = $2
        ) AS found
      `,
      [wallet, shortUuid, type],
    );
    return row?.found ?? false;
  }

  async removeJobInteraction(
    wallet: string,
    shortUuid: string,
    type: "APPLIED_TO" | "BOOKMARKED" | "VIEWED_DETAILS",
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        DELETE FROM graph_relationships relationship
        USING graph_nodes account, job_search_documents job
        WHERE relationship.source_id = account.id
          AND relationship.target_id = job.job_node_id
          AND relationship.type = $3
          AND account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
          AND job.short_uuid = $2
        RETURNING relationship.id::text AS id
      `,
      [wallet, shortUuid, type],
    );
    return rows.length > 0;
  }

  async logSearch(wallet: string, query: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      const [existing] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT search.id::text AS "nodeId"
          FROM graph_relationships relationship
          JOIN graph_nodes search ON search.id = relationship.target_id
          WHERE relationship.source_id = $1
            AND relationship.type = 'DID_SEARCH'
            AND search.label = 'SearchHistory'
            AND search.properties ->> 'query' = $2
          ORDER BY search.id
          LIMIT 1
        `,
        [account.nodeId, query],
      );
      const search =
        existing?.nodeId ??
        (await this.insertNode(manager, "SearchHistory", {
          id: randomUUID(),
          query,
          createdTimestamp: Date.now(),
        }));
      await this.insertRelationship(
        manager,
        account.nodeId,
        search,
        "DID_SEARCH",
        { createdTimestamp: Date.now() },
      );
      return true;
    });
  }

  async getWorkHistory(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT history.properties || jsonb_build_object(
          'repositories', COALESCE((
            SELECT jsonb_agg(repository.properties ORDER BY repository.id)
            FROM graph_relationships relationship
            JOIN graph_nodes repository ON repository.id = relationship.target_id
            WHERE relationship.source_id = history.id
              AND relationship.type = 'WORKED_ON_REPO'
          ), '[]'::jsonb)
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id
         AND relationship.type = 'HAS_WORK_HISTORY'
        JOIN graph_nodes history ON history.id = relationship.target_id
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY history.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async getAdjacentRepos(wallet: string): Promise<Record<string, unknown>[]> {
    return this.getOwnedNodes(wallet, "HAS_ADJACENT_REPO", "UserAdjacentRepo");
  }

  private async getVerificationOrganizations(
    wallet: string,
    predicate: string,
    parameters: unknown[],
  ): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT organization.properties || jsonb_build_object(
          'id', organization.properties -> 'orgId',
          'url', to_jsonb(graph_first_related_text(organization.id, 'HAS_WEBSITE', 'url')),
          'logo', COALESCE(
            organization.properties -> 'logoUrl', organization.properties -> 'logo'
          ),
          'hasOwner', EXISTS (
            SELECT 1 FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isOwner', EXISTS (
            SELECT 1 FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isMember', EXISTS (
            SELECT 1 FROM graph_relationships organization_seat
            JOIN graph_relationships occupancy
              ON occupancy.target_id = organization_seat.target_id
             AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
          )
        ) AS value
        FROM graph_nodes organization
        LEFT JOIN graph_nodes account
          ON account.label = 'User'
         AND lower(account.properties ->> 'wallet') = lower($1)
        WHERE organization.label = 'Organization' AND ${predicate}
        ORDER BY organization.id
      `,
      [wallet, ...parameters],
    );
    return rows.map(row => row.value);
  }

  private async updateOwnedNode(
    wallet: string,
    relationshipType: string,
    label: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await this.upsertOwnedNode(
        manager,
        account.nodeId,
        relationshipType,
        label,
        properties,
      );
      return true;
    });
  }

  private async replaceOwnedNodes(
    wallet: string,
    relationshipType: string,
    label: string,
    nodes: Record<string, unknown>[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await this.deleteOwnedNodes(manager, account.nodeId, [relationshipType]);
      for (const properties of nodes) {
        const node = await this.insertNode(manager, label, properties);
        await this.insertRelationship(
          manager,
          account.nodeId,
          node,
          relationshipType,
        );
      }
      return true;
    });
  }

  private async deleteOwnedNodes(
    manager: EntityManager,
    accountNodeId: string,
    relationshipTypes: string[],
  ): Promise<void> {
    const rows = await queryRows<{ nodeId: string }>(
      manager,
      `
        SELECT target_id::text AS "nodeId"
        FROM graph_relationships
        WHERE source_id = $1 AND type = ANY($2::text[])
      `,
      [accountNodeId, relationshipTypes],
    );
    if (rows.length) {
      await queryRows(
        manager,
        "DELETE FROM graph_nodes WHERE id = ANY($1::bigint[])",
        [rows.map(row => row.nodeId)],
      );
    }
  }

  private async upsertOwnedNode(
    manager: EntityManager,
    accountNodeId: string,
    relationshipType: string,
    label: string,
    patch: Record<string, unknown>,
  ): Promise<string> {
    const [existing] = await queryRows<{ nodeId: string }>(
      manager,
      `
        SELECT target.id::text AS "nodeId"
        FROM graph_relationships relationship
        JOIN graph_nodes target ON target.id = relationship.target_id
        WHERE relationship.source_id = $1 AND relationship.type = $2
          AND target.label = $3
        ORDER BY target.id LIMIT 1
      `,
      [accountNodeId, relationshipType, label],
    );
    const values = {
      ...patch,
      ...(existing
        ? { updatedTimestamp: Date.now() }
        : { id: randomUUID(), createdTimestamp: Date.now() }),
    };
    if (existing) {
      await queryRows(
        manager,
        "UPDATE graph_nodes SET properties = properties || $2::jsonb, updated_at = now() WHERE id = $1",
        [existing.nodeId, JSON.stringify(values)],
      );
      return existing.nodeId;
    }
    const node = await this.insertNode(manager, label, values);
    await this.insertRelationship(
      manager,
      accountNodeId,
      node,
      relationshipType,
    );
    return node;
  }

  private async getFirstOwnedNode(
    wallet: string,
    relationshipType: string,
    label: string,
  ): Promise<Record<string, unknown> | undefined> {
    return (await this.getOwnedNodes(wallet, relationshipType, label))[0];
  }

  private async getOwnedNodes(
    wallet: string,
    relationshipType: string,
    label: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT target.properties
        FROM graph_nodes account
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id AND relationship.type = $2
        JOIN graph_nodes target
          ON target.id = relationship.target_id AND target.label = $3
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY target.id
      `,
      [wallet, relationshipType, label],
    );
    return rows.map(row => row.properties);
  }

  private async setDirectRelationship(
    wallet: string,
    targetLabel: string,
    targetWhere: Record<string, unknown>,
    type: string,
  ): Promise<boolean> {
    const account = await this.findNode("User", { wallet });
    const target = await this.findNode(targetLabel, targetWhere);
    if (!account || !target) return false;
    await this.insertRelationship(
      this.postgres,
      account.nodeId,
      target.nodeId,
      type,
      { createdTimestamp: Date.now() },
    );
    return true;
  }

  private async findNode(
    label: string,
    where: Record<string, unknown>,
    executor: QueryExecutor = this.postgres,
  ): Promise<NodeRecord | undefined> {
    const [row] = await queryRows<NodeRecord>(
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
    const cleanProperties = Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value !== undefined),
    );
    const id = String(cleanProperties.id ?? randomUUID());
    const [row] = await queryRows<{ nodeId: string }>(
      executor,
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS "nodeId"
      `,
      [
        label,
        `runtime:${label}:${id}`,
        JSON.stringify({ ...cleanProperties, id }),
      ],
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
