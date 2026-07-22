import { ConfigService } from "@nestjs/config";
import { GithubUserService } from "src/auth/github/github-user.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import { PostgresService } from "./postgres.service";
import { ProfileRepository } from "./profile.repository";
import { UserRepository } from "./user.repository";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("ProfileRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: ProfileRepository;
  let users: UserRepository;
  let service: ProfileService;
  let scorer: {
    getUserWorkHistories: jest.Mock;
    getEcosystemActivationsForWallets: jest.Mock;
  };
  let userId: string;
  let organizationId: string;
  let githubUserId: string;
  let githubOrganizationId: string;
  let repositoryId: string;
  let tagId: string;
  let jobId: string;
  let now: number;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-profile-integration-test",
    });
    await postgres.onModuleInit();
    repository = new ProfileRepository(postgres);
    users = new UserRepository(postgres);
    scorer = {
      getUserWorkHistories: jest.fn(),
      getEcosystemActivationsForWallets: jest.fn().mockResolvedValue({
        success: true,
        message: "ok",
        data: [],
      }),
    };
    service = new ProfileService(
      repository,
      users,
      scorer as unknown as ScorerService,
      { get: jest.fn().mockReturnValue(1) } as unknown as ConfigService,
      {
        removeGithubInfoFromUser: jest.fn().mockResolvedValue({
          success: true,
          message: "ok",
        }),
        addGithubInfoToUser: jest.fn().mockResolvedValue({
          success: true,
          message: "ok",
        }),
      } as unknown as GithubUserService,
    );
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    scorer.getUserWorkHistories.mockReset();
    scorer.getEcosystemActivationsForWallets.mockReset().mockResolvedValue({
      success: true,
      message: "ok",
      data: [],
    });
    now = Date.now();
    await seedGraph();
  });

  it("reads repositories and updates scoped contribution metadata", async () => {
    await expect(repository.getUserRepos("0xProfileUser")).resolves.toEqual([
      expect.objectContaining({
        id: "repo-id",
        name: "acme/repository",
        contribution: "Initial contribution",
        org: expect.objectContaining({
          name: "Acme",
          url: "https://acme.example",
        }),
        tags: [
          expect.objectContaining({
            normalizedName: "typescript",
            canTeach: true,
          }),
        ],
      }),
    ]);
    await expect(
      repository.updateRepoContribution(
        "0xProfileUser",
        "repo-id",
        "Led migrations",
      ),
    ).resolves.toBe(true);
    await expect(repository.getUserRepos("0xProfileUser")).resolves.toEqual([
      expect.objectContaining({ contribution: "Led migrations" }),
    ]);
    await expect(
      repository.updateRepoContribution("0xOther", "repo-id", "Nope"),
    ).resolves.toBe(false);
  });

  it("replaces repository tags and user teaching metadata", async () => {
    const rustId = await createNode("Tag", "tag:rust", {
      id: "rust-id",
      name: "Rust",
      normalizedName: "rust",
      createdTimestamp: now,
    });
    await expect(
      repository.updateRepoTags("0xProfileUser", "repo-id", [
        { normalizedName: "rust", canTeach: false },
      ]),
    ).resolves.toBe(true);
    const [row] = await postgres.query<{
      found: boolean;
      removedOldUsage: boolean;
    }>(
      `
        SELECT
          EXISTS (
            SELECT 1 FROM graph_relationships
            WHERE source_id = $1 AND target_id = $2 AND type = 'HAS_SKILL'
          ) AS found,
          NOT EXISTS (
            SELECT 1
            FROM graph_relationships used_tag
            JOIN graph_relationships used_on
              ON used_on.source_id = used_tag.target_id
             AND used_on.target_id = $3
             AND used_on.type = 'USED_ON'
            WHERE used_tag.source_id = $4
              AND used_tag.target_id = $5
              AND used_tag.type = 'USED_TAG'
          ) AS "removedOldUsage"
      `,
      [userId, rustId, repositoryId, githubUserId, tagId],
    );
    expect(row.found).toBe(true);
    expect(row.removedOldUsage).toBe(true);
    await expect(repository.getUserRepos("0xProfileUser")).resolves.toEqual([
      expect.objectContaining({
        tags: [expect.objectContaining({ normalizedName: "rust" })],
      }),
    ]);
  });

  it("upserts one review per user and organization", async () => {
    await repository.upsertReview("0xProfileUser", "acme-org", {
      salary: 120000,
      currency: "USD",
      offersTokenAllocation: true,
    });
    await repository.upsertReview("0xProfileUser", "acme-org", {
      title: "Great team",
      location: "Remote",
      timezone: "UTC",
      pros: "People",
      cons: "Meetings",
    });
    const reviewed = await repository.getReviewedOrganizations("0xProfileUser");
    expect(reviewed).toEqual([
      expect.objectContaining({
        compensation: expect.objectContaining({ salary: 120000 }),
        review: expect.objectContaining({ title: "Great team" }),
        org: expect.objectContaining({ orgId: "acme-org" }),
      }),
    ]);
    const review = reviewed[0].review as Record<string, unknown>;
    await expect(
      repository.findReview(String(review.id)),
    ).resolves.toMatchObject({
      title: "Great team",
    });
  });

  it("resolves, persists, and reads organization verifications", async () => {
    await expect(
      repository.findVerificationOrganizationsByNames("0xProfileUser", [
        "Acme",
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ id: "acme-org", name: "Acme" }),
    ]);
    await expect(
      repository.findVerificationOrganizationsByEmails("0xProfileUser", [
        "person@acme.example",
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ id: "acme-org", name: "Acme" }),
    ]);
    await repository.replaceVerifications("0xProfileUser", [
      {
        id: "acme-org",
        credential: "email",
        account: "person@acme.example",
      },
    ]);
    await expect(repository.getVerifications("0xProfileUser")).resolves.toEqual(
      [
        expect.objectContaining({
          id: "acme-org",
          credential: "email",
          account: "person@acme.example",
        }),
      ],
    );
  });

  it("adds an idempotent JobStash verification without replacing other organizations", async () => {
    const jobstashId = await createNode("Organization", "org:jobstash", {
      id: "jobstash-organization-id",
      orgId: "345",
      name: "JobStash",
      normalizedName: "jobstash",
    });
    const linkedAccountId = await createNode(
      "LinkedAccount",
      "linked:profile",
      {
        id: "linked-profile-id",
        email: "analyst@example.com",
      },
    );
    await createRelationship(userId, linkedAccountId, "HAS_LINKED_ACCOUNT");
    await repository.replaceVerifications("0xProfileUser", [
      {
        id: "acme-org",
        credential: "email",
        account: "person@acme.example",
      },
    ]);

    await expect(
      repository.ensureOrganizationVerification("0xProfileUser", "jobstash"),
    ).resolves.toBe(true);
    await expect(
      repository.ensureOrganizationVerification("0xProfileUser", "jobstash"),
    ).resolves.toBe(true);

    await expect(repository.getVerifications("0xProfileUser")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "acme-org" }),
        expect.objectContaining({
          id: "345",
          credential: "email",
          account: "analyst@example.com",
        }),
      ]),
    );
    await expect(
      repository.getVerificationStatus("0xProfileUser"),
    ).resolves.toMatchObject({ status: "VERIFIED" });
    const [relationshipCount] = await postgres.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM graph_relationships
        WHERE source_id = $1 AND target_id = $2
          AND type = 'VERIFIED_FOR_ORG'
      `,
      [userId, jobstashId],
    );
    expect(relationshipCount.count).toBe("1");
  });

  it("stores verification status and owned profile metadata", async () => {
    await expect(
      repository.setVerificationStatus("0xProfileUser", "VERIFIED", now),
    ).resolves.toBe(true);
    await expect(
      repository.getVerificationStatus("0xProfileUser"),
    ).resolves.toMatchObject({ status: "VERIFIED", verifiedTimestamp: now });
    await repository.updateLinkedAccount("0xProfileUser", {
      github: "profile-user",
      email: "person@acme.example",
    });
    await repository.updateLocation("0xProfileUser", {
      city: "Amsterdam",
      country: "Netherlands",
    });
    await repository.updateAvailability("0xProfileUser", true);
    await repository.replaceShowcases("0xProfileUser", [
      { label: "Portfolio", url: "https://portfolio.example" },
    ]);
    await repository.replaceSkills("0xProfileUser", [
      { id: "tag-id", normalizedName: "typescript", canTeach: false },
    ]);
    await expect(repository.getShowcases("0xProfileUser")).resolves.toEqual([
      expect.objectContaining({ label: "Portfolio" }),
    ]);
    await expect(repository.getSkills("0xProfileUser")).resolves.toEqual([
      expect.objectContaining({
        normalizedName: "typescript",
        canTeach: false,
      }),
    ]);
    await expect(users.getProfile("0xProfileUser")).resolves.toMatchObject({
      availableForWork: true,
      linkedAccounts: expect.objectContaining({ github: "profile-user" }),
      location: expect.objectContaining({ city: "Amsterdam" }),
    });
  });

  it("uses compact cache locks and replaces work-history subgraphs", async () => {
    await expect(
      repository.setCacheLocks(["0xProfileUser"], now + 1000),
    ).resolves.toBe(now + 1000);
    await expect(repository.getCacheLock("0xProfileUser")).resolves.toBe(
      now + 1000,
    );
    await expect(
      repository.replaceWorkHistory(
        "0xProfileUser",
        true,
        true,
        [
          {
            login: "acme",
            name: "Acme",
            logoUrl: null,
            description: null,
            url: "https://acme.example",
            firstContributedAt: now - 1000,
            lastContributedAt: now,
            commitsCount: 10,
            tenure: 1000,
            cryptoNative: true,
            createdAt: now,
            updatedAt: null,
            repositories: [
              {
                name: "repository",
                url: "https://github.com/acme/repository",
                description: null,
                cryptoNative: true,
                firstContributedAt: now - 1000,
                lastContributedAt: now,
                commitsCount: 10,
                skills: ["TypeScript"],
                tenure: 1000,
                stars: 5,
                createdAt: now,
                updatedAt: null,
              },
            ],
          },
        ],
        [{ name: "Adjacent", stars: 10 }],
      ),
    ).resolves.toBe(true);
    await expect(repository.getWorkHistory("0xProfileUser")).resolves.toEqual([
      expect.objectContaining({
        name: "Acme",
        repositories: [expect.objectContaining({ name: "repository" })],
      }),
    ]);
    await expect(repository.getAdjacentRepos("0xProfileUser")).resolves.toEqual(
      [expect.objectContaining({ name: "Adjacent" })],
    );
    await repository.replaceWorkHistory("0xProfileUser", false, false, [], []);
    await expect(repository.getWorkHistory("0xProfileUser")).resolves.toEqual(
      [],
    );
    const [counts] = await postgres.query<{
      historyCount: string;
      repositoryCount: string;
      adjacentCount: string;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE label = 'UserWorkHistory')::text AS "historyCount",
          count(*) FILTER (WHERE label = 'UserWorkHistoryRepo')::text AS "repositoryCount",
          count(*) FILTER (WHERE label = 'UserAdjacentRepo')::text AS "adjacentCount"
        FROM graph_nodes
      `,
    );
    expect(counts).toEqual({
      historyCount: "0",
      repositoryCount: "0",
      adjacentCount: "0",
    });
  });

  it("refreshes GitHub repository relationships without deleting current repos", async () => {
    await expect(
      repository.replaceGithubRepositories("0xProfileUser", [
        {
          login: "acme",
          repositories: [
            { name: "repository", description: "Updated" },
            { name: "second", description: "Second repo" },
          ],
        },
      ]),
    ).resolves.toBe(true);
    const repos = await repository.getUserRepos("0xProfileUser");
    expect(repos.map(repo => repo.name).sort()).toEqual([
      "acme/repository",
      "acme/second",
    ]);
    expect(repos).toContainEqual(
      expect.objectContaining({
        name: "acme/repository",
        description: "Updated",
      }),
    );
  });

  it("logs, verifies, and removes job interactions", async () => {
    await expect(
      repository.setJobInteraction("0xProfileUser", "job-short", "APPLIED_TO"),
    ).resolves.toBe(true);
    await expect(
      repository.hasJobInteraction("0xProfileUser", "job-short", "APPLIED_TO"),
    ).resolves.toBe(true);
    await repository.setJobInteraction(
      "0xProfileUser",
      "job-short",
      "BOOKMARKED",
    );
    await expect(
      repository.removeJobInteraction(
        "0xProfileUser",
        "job-short",
        "BOOKMARKED",
      ),
    ).resolves.toBe(true);
    await expect(
      repository.hasJobInteraction("0xProfileUser", "job-short", "BOOKMARKED"),
    ).resolves.toBe(false);
    await expect(
      repository.blockOrganizationJobs("0xProfileUser", "acme-org"),
    ).resolves.toBe(true);
    await expect(
      repository.logSearch("0xProfileUser", "typescript"),
    ).resolves.toBe(true);
  });

  it("has the compact cache and graph traversal indexes", async () => {
    const names = [
      "user_cache_locks_expiry_idx",
      "graph_relationships_source_type_target_idx",
      "graph_relationships_target_type_source_idx",
      "graph_nodes_user_wallet_idx",
    ];
    const rows = await postgres.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])",
      [names],
    );
    expect(rows.map(row => row.indexname).sort()).toEqual(names.sort());
  });

  it("serves and mutates profiles through ProfileService", async () => {
    await expect(
      service.getUserProfile("0xProfileUser"),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        wallet: "0xProfileUser",
        name: "Profile User",
        availableForWork: false,
      }),
    });
    await expect(
      service.updateUserLinkedAccounts("0xProfileUser", {
        discord: null,
        telegram: null,
        twitter: null,
        email: "person@acme.example",
        farcaster: null,
        github: null,
        google: null,
        apple: null,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.updateUserLocationInfo("0xProfileUser", {
        city: "Amsterdam",
        country: "Netherlands",
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.updateUserAvailability("0xProfileUser", true),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.updateUserShowCase("0xProfileUser", {
        showcase: [{ label: "Portfolio", url: "https://portfolio.example" }],
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.updateUserSkills("0xProfileUser", {
        skills: [{ id: "tag-id", name: "TypeScript", canTeach: false }],
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.getUserProfile("0xProfileUser"),
    ).resolves.toMatchObject({
      data: expect.objectContaining({
        availableForWork: true,
        location: { city: "Amsterdam", country: "Netherlands" },
        linkedAccounts: expect.objectContaining({
          email: "person@acme.example",
        }),
      }),
    });
    await expect(
      service.getUserShowCase("0xProfileUser"),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ label: "Portfolio" })],
    });
    await expect(service.getUserSkills("0xProfileUser")).resolves.toMatchObject(
      {
        data: [
          expect.objectContaining({
            normalizedName: "typescript",
            canTeach: false,
          }),
        ],
      },
    );
  });

  it("uses cached verifications to authorize service reviews", async () => {
    await repository.replaceVerifications("0xProfileUser", [
      {
        id: "acme-org",
        credential: "email",
        account: "person@acme.example",
      },
    ]);
    await repository.setCacheLocks(["0xProfileUser"], now + 60_000);
    await expect(
      service.getUserVerifications("0xProfileUser"),
    ).resolves.toMatchObject({
      success: true,
      data: [expect.objectContaining({ id: "acme-org" })],
    });
    await expect(
      service.reviewOrgSalary("0xProfileUser", {
        orgId: "acme-org",
        salary: 130000,
        currency: "USD",
        offersTokenAllocation: true,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.rateOrg("0xProfileUser", {
        orgId: "acme-org",
        onboarding: 4,
        careerGrowth: 5,
        benefits: 4,
        workLifeBalance: 3,
        diversityInclusion: 5,
        management: 4,
        product: 5,
        compensation: 4,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.reviewOrg("0xProfileUser", {
        orgId: "acme-org",
        title: "Strong team",
        location: "REMOTE",
        timezone: "GMT",
        pros: "People",
        cons: "Meetings",
      }),
    ).resolves.toMatchObject({ success: true });
    const organizations = await service.getUserOrgs("0xProfileUser");
    expect(organizations).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          compensation: expect.objectContaining({ salary: 130000 }),
          review: expect.objectContaining({ title: "Strong team" }),
        }),
      ],
    });
  });

  it("refetches and persists email verifications through ProfileService", async () => {
    await repository.updateLinkedAccount("0xProfileUser", {
      github: null,
      email: "person@acme.example",
      google: null,
    });
    scorer.getUserWorkHistories.mockResolvedValueOnce([
      {
        username: null,
        wallets: [],
        cryptoNative: false,
        workHistory: [],
        adjacentRepos: [],
      },
    ]);
    await expect(
      service.getUserVerifications("0xProfileUser", true),
    ).resolves.toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          id: "acme-org",
          credential: "email",
          account: "person@acme.example",
        }),
      ],
    });
    await expect(repository.getVerifications("0xProfileUser")).resolves.toEqual(
      [
        expect.objectContaining({
          id: "acme-org",
          credential: "email",
          account: "person@acme.example",
        }),
      ],
    );
  });

  it("performs scoped repository edits through ProfileService", async () => {
    await expect(
      service.getUserRepos("0xProfileUser", { page: 1, limit: 10 }),
    ).resolves.toMatchObject({
      total: 1,
      data: [expect.objectContaining({ id: "repo-id" })],
    });
    await expect(
      service.updateRepoContribution("0xProfileUser", {
        id: "repo-id",
        contribution: "Owned the PostgreSQL migration",
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.updateRepoContribution("0xOther", {
        id: "repo-id",
        contribution: "Unauthorized",
      }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      service.updateRepoTagsUsed("0xProfileUser", {
        id: "repo-id",
        tagsUsed: [
          {
            id: "tag-id",
            name: "TypeScript",
            normalizedName: "typescript",
            canTeach: false,
          },
        ],
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it("refreshes and reuses PostgreSQL work-history caches", async () => {
    await repository.updateLinkedAccount("0xProfileUser", {
      github: "profile-user",
      email: null,
      google: null,
    });
    const history = {
      username: "profile-user",
      wallets: [],
      cryptoNative: true,
      workHistory: [
        {
          login: "acme",
          name: "Acme",
          logoUrl: null,
          description: null,
          url: "https://acme.example",
          firstContributedAt: now - 1000,
          lastContributedAt: now,
          commitsCount: 10,
          tenure: 1000,
          cryptoNative: true,
          repositories: [
            {
              name: "repository",
              url: "https://github.com/acme/repository",
              description: null,
              cryptoNative: true,
              firstContributedAt: now - 1000,
              lastContributedAt: now,
              commitsCount: 10,
              skills: ["TypeScript"],
              tenure: 1000,
              stars: 5,
              createdAt: now,
              updatedAt: null,
            },
          ],
          createdAt: now,
          updatedAt: null,
        },
      ],
      adjacentRepos: [{ name: "Adjacent", stars: 7 }],
    };
    scorer.getUserWorkHistories.mockResolvedValueOnce([history]);
    await expect(
      service.getUserWorkHistory("0xProfileUser", true),
    ).resolves.toEqual(history);
    await expect(
      service.getUserWorkHistory("0xProfileUser"),
    ).resolves.toMatchObject({
      username: "profile-user",
      cryptoNative: true,
      workHistory: [expect.objectContaining({ name: "Acme" })],
      adjacentRepos: [expect.objectContaining({ name: "Adjacent" })],
    });
    expect(scorer.getUserWorkHistories).toHaveBeenCalledTimes(1);
  });

  it("routes job and search interactions through PostgreSQL", async () => {
    await expect(
      service.logApplyInteraction("0xProfileUser", "job-short"),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.verifyApplyInteraction("0xProfileUser", "job-short"),
    ).resolves.toBe(true);
    await expect(
      service.logBookmarkInteraction("0xProfileUser", "job-short"),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.verifyBookmarkInteraction("0xProfileUser", "job-short"),
    ).resolves.toBe(true);
    await expect(
      service.removeBookmarkInteraction("0xProfileUser", "job-short"),
    ).resolves.toMatchObject({ success: true });
    await service.logViewDetailsInteraction("0xProfileUser", "job-short");
    await service.logSearchInteraction("0xProfileUser", "typescript");
    await service.logSearchInteraction("0xProfileUser", "typescript");
    await expect(
      repository.hasJobInteraction(
        "0xProfileUser",
        "job-short",
        "VIEWED_DETAILS",
      ),
    ).resolves.toBe(true);
    const [searchCount] = await postgres.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM graph_nodes
        WHERE label = 'SearchHistory'
          AND properties ->> 'query' = 'typescript'
      `,
    );
    expect(searchCount.count).toBe("1");
  });

  async function seedGraph(): Promise<void> {
    userId = await createNode("User", "user:profile", {
      id: "profile-user-id",
      wallet: "0xProfileUser",
      privyId: "privy-profile",
      name: "Profile User",
      available: false,
      cryptoNative: false,
      cryptoAdjacent: false,
    });
    organizationId = await createNode("Organization", "org:acme", {
      id: "organization-id",
      orgId: "acme-org",
      name: "Acme",
      normalizedName: "acme",
      description: "Acme builds developer infrastructure.",
      location: "Remote",
      summary: "Developer infrastructure",
      logoUrl: "https://acme.example/logo.png",
    });
    const website = await createNode("Website", "website:acme", {
      id: "website-id",
      url: "https://acme.example",
    });
    githubUserId = await createNode("GithubUser", "github:user", {
      id: "github-user-id",
      nodeId: "github-node",
      login: "profile-user",
      avatarUrl: "https://example.com/avatar.png",
    });
    githubOrganizationId = await createNode(
      "GithubOrganization",
      "github:organization",
      { id: "github-organization-id", login: "acme" },
    );
    repositoryId = await createNode("GithubRepository", "github:repository", {
      id: "repo-id",
      name: "repository",
      nameWithOwner: "acme/repository",
      description: "Repository",
      updatedTimestamp: now,
    });
    tagId = await createNode("Tag", "tag:typescript", {
      id: "tag-id",
      name: "TypeScript",
      normalizedName: "typescript",
      createdTimestamp: now,
    });
    jobId = await createNode("StructuredJobpost", "job:one", {
      id: "job-id",
      shortUUID: "job-short",
      title: "Engineer",
    });
    await createRelationship(organizationId, website, "HAS_WEBSITE");
    await createRelationship(userId, githubUserId, "HAS_GITHUB_USER");
    await createRelationship(
      organizationId,
      githubOrganizationId,
      "HAS_GITHUB",
    );
    await createRelationship(
      githubOrganizationId,
      repositoryId,
      "HAS_REPOSITORY",
    );
    await createRelationship(githubUserId, repositoryId, "CONTRIBUTED_TO", {
      summary: "Initial contribution",
    });
    await createRelationship(userId, tagId, "HAS_SKILL", { canTeach: true });
    await createRelationship(githubUserId, tagId, "USED_TAG");
    await createRelationship(tagId, repositoryId, "USED_ON");
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          title, online, blocked, published_timestamp, filter_labels, payload,
          detail_payload
        ) VALUES (
          $1, 'job-id', 'job-short', 'acme-org', 'Engineer', true, false, $2,
          '{}'::jsonb, $3::jsonb, $3::jsonb
        )
      `,
      [
        jobId,
        now,
        JSON.stringify({
          id: "job-id",
          shortUUID: "job-short",
          title: "Engineer",
        }),
      ],
    );
  }

  async function createNode(
    label: string,
    key: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS id
      `,
      [label, key, JSON.stringify(properties)],
    );
    return row.id;
  }

  async function createRelationship(
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', $4::jsonb)
        ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
          properties = EXCLUDED.properties
      `,
      [sourceId, targetId, type, JSON.stringify(properties)],
    );
  }
});
