import { PostgresService } from "./postgres.service";
import { UserRepository } from "./user.repository";
import { UserService } from "src/user/user.service";
import { ConfigService } from "@nestjs/config";
import { ProfileService } from "src/auth/profile/profile.service";
import { PrivyService } from "src/auth/privy/privy.service";
import { PermissionService } from "src/user/permission.service";
import { Subscription } from "src/shared/interfaces/org";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("UserRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: UserRepository;
  let service: UserService;
  let profileService: {
    getUserProfile: jest.Mock;
    getUserVerifications: jest.Mock;
    getUserWorkHistory: jest.Mock;
  };
  let permissionService: {
    getPermissionsForWallet: jest.Mock;
    syncUserPermissions: jest.Mock;
  };
  let privyService: { deletePrivyUser: jest.Mock };
  let userOneId: string;
  let organizationId: string;
  let jobId: string;
  let now: number;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-user-integration-test",
    });
    await postgres.onModuleInit();
    repository = new UserRepository(postgres);
    profileService = {
      getUserProfile: jest.fn(),
      getUserVerifications: jest.fn(),
      getUserWorkHistory: jest.fn(),
    };
    permissionService = {
      getPermissionsForWallet: jest.fn().mockResolvedValue([]),
      syncUserPermissions: jest.fn().mockResolvedValue(undefined),
    };
    privyService = { deletePrivyUser: jest.fn().mockResolvedValue(undefined) };
    service = new UserService(
      repository,
      { get: jest.fn() } as unknown as ConfigService,
      profileService as unknown as ProfileService,
      privyService as unknown as PrivyService,
      permissionService as unknown as PermissionService,
    );
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    now = Date.now();
    userOneId = await createNode("User", "user:one", {
      id: "user-one-id",
      wallet: "0xUserOne",
      privyId: "privy-one",
      name: "User One",
      available: true,
      cryptoNative: true,
      cryptoAdjacent: false,
      createdTimestamp: now,
    });
    await createNode("User", "user:two", {
      id: "user-two-id",
      wallet: "0xUserTwo",
      privyId: "privy-two",
      name: "User Two",
      available: false,
      cryptoNative: false,
      cryptoAdjacent: true,
      createdTimestamp: now,
    });
    organizationId = await createNode("Organization", "org:acme", {
      id: "organization-id",
      orgId: "acme-org",
      name: "Acme",
      normalizedName: "acme",
    });
    jobId = await createNode("StructuredJobpost", "job:one", {
      id: "job-id",
      shortUUID: "job-short",
      title: "Engineer",
    });
    await seedJobProjection();
    profileService.getUserProfile.mockReset();
    profileService.getUserVerifications.mockReset();
    profileService.getUserWorkHistory.mockReset();
    permissionService.getPermissionsForWallet.mockClear();
    permissionService.syncUserPermissions.mockClear();
    privyService.deletePrivyUser.mockClear();
  });

  it("finds users and resolves organization ownership paths", async () => {
    const github = await createNode("GithubUser", "github:one", {
      id: "github-id",
      nodeId: "github-node",
      login: "user-one",
      avatarUrl: "https://example.com/avatar.png",
    });
    const folder = await createNode("JobpostFolder", "folder:one", {
      id: "folder-id",
      slug: "folder-one",
    });
    await createRelationship(userOneId, github, "HAS_GITHUB_USER");
    await createRelationship(userOneId, folder, "CREATED_FOLDER");
    await repository.addOrganizationSeat(
      "acme-org",
      "0xUserOne",
      "owner",
      "seat-one",
    );

    await expect(
      repository.findUserByWallet("0xUserOne"),
    ).resolves.toMatchObject({
      id: "user-one-id",
    });
    await expect(
      repository.findUserByGithubNodeId("github-node"),
    ).resolves.toMatchObject({ wallet: "0xUserOne" });
    await expect(repository.findOwnerWallet("acme-org")).resolves.toBe(
      "0xUserOne",
    );
    await expect(
      repository.findOrganizationIdForMember("0xUserOne"),
    ).resolves.toBe("acme-org");
    await expect(
      repository.findOrganizationIdForJob("job-short"),
    ).resolves.toBe("acme-org");
    await expect(
      repository.ownsJobFolder("0xUserOne", "folder-id"),
    ).resolves.toBe(true);
  });

  it("enforces scoped email ownership through verification and removal", async () => {
    const normalized = "personexample.com";
    await expect(
      repository.addUserEmail("0xUserOne", "person@example.com", normalized),
    ).resolves.toMatchObject({ id: "user-one-id" });
    await expect(repository.emailExists(normalized)).resolves.toBe(true);
    await expect(
      repository.addUserEmail("0xUserTwo", "person@example.com", normalized),
    ).resolves.toBeUndefined();
    await expect(repository.findWalletByEmail(normalized)).resolves.toBe(
      "0xUserOne",
    );

    await expect(
      repository.verifyEmail(normalized, "person@example.com"),
    ).resolves.toMatchObject({ wallet: "0xUserOne" });
    await expect(
      repository.setMainEmail("0xUserOne", normalized),
    ).resolves.toMatchObject({ id: "user-one-id" });
    await expect(repository.getUserEmails("0xUserOne")).resolves.toEqual([
      { email: "person@example.com", main: true },
    ]);
    await expect(
      repository.setMainEmail("0xUserTwo", normalized),
    ).resolves.toBeUndefined();
    await expect(
      repository.removeUserEmail("0xUserOne", normalized),
    ).resolves.toMatchObject({ id: "user-one-id" });
    await expect(repository.emailExists(normalized)).resolves.toBe(false);
  });

  it("syncs linked wallets and resolves Privy identities", async () => {
    await repository.syncLinkedWallets("0xUserOne", ["0xLinkedOne"]);
    await expect(
      repository.findWalletByLinkedWallet("0xlinkedone"),
    ).resolves.toBe("0xUserOne");
    await expect(repository.findPrivyId("0xUserOne")).resolves.toBe(
      "privy-one",
    );
    await expect(repository.findWalletByPrivyId("privy-one")).resolves.toBe(
      "0xUserOne",
    );

    await repository.syncLinkedWallets("0xUserOne", []);
    await expect(
      repository.findWalletByLinkedWallet("0xlinkedone"),
    ).resolves.toBeUndefined();
    await expect(
      repository.createUser({
        id: "user-three-id",
        wallet: "0xUserThree",
        privyId: "privy-three",
        available: false,
      }),
    ).resolves.toMatchObject({ wallet: "0xUserThree" });
  });

  it("creates, transfers, and removes organization seats", async () => {
    await expect(
      repository.addOrganizationSeat(
        "acme-org",
        "0xUserOne",
        "owner",
        "seat-one",
      ),
    ).resolves.toBe(true);
    await expect(repository.countOrganizationUsers("acme-org")).resolves.toBe(
      1,
    );
    await expect(
      repository.hasOrganizationSeat("0xUserOne", "acme-org", true),
    ).resolves.toBe(true);
    await expect(repository.organizationHasOwner("acme-org")).resolves.toBe(
      true,
    );

    const subscription = await createNode(
      "OrgSubscription",
      "subscription:one",
      {
        id: "subscription-id",
        status: "active",
      },
    );
    await createRelationship(organizationId, subscription, "HAS_SUBSCRIPTION");
    await expect(
      repository.getActiveSubscriptionOrganizationIds("0xUserOne"),
    ).resolves.toEqual(["acme-org"]);

    await expect(
      repository.transferOrganizationSeat("acme-org", "0xUserOne", "0xUserTwo"),
    ).resolves.toEqual({ seatType: "owner" });
    await expect(
      repository.hasOrganizationSeat("0xUserTwo", "acme-org", true),
    ).resolves.toBe(true);
    await expect(
      repository.removeOrganizationSeat("acme-org", "0xUserTwo"),
    ).resolves.toBe(true);
    await expect(repository.countOrganizationUsers("acme-org")).resolves.toBe(
      0,
    );
  });

  it("creates and scopes talent lists with rich available users", async () => {
    await seedRichProfile();
    await expect(
      repository.createTalentList(
        "acme-org",
        "Candidates",
        "Strong candidates",
      ),
    ).resolves.toMatchObject({
      status: "created",
      properties: { normalizedName: "candidates" },
    });
    await expect(
      repository.createTalentList("acme-org", "Candidates", "Duplicate"),
    ).resolves.toEqual({ status: "conflict" });
    await expect(repository.getTalentLists("acme-org")).resolves.toHaveLength(
      1,
    );

    await expect(
      repository.replaceTalentListUsers("acme-org", "candidates", [
        "0xUserOne",
        "0xUserTwo",
      ]),
    ).resolves.toBe(true);
    const list = await repository.getTalentList("acme-org", "candidates");
    expect(list?.normalizedName).toBe("candidates");
    const users = list?.users as Record<string, unknown>[];
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      wallet: "0xUserOne",
      githubAvatar: "https://example.com/avatar.png",
      jobCategoryInterests: [{ classification: "ENGINEERING", frequency: 1 }],
      tags: [{ tag: "TypeScript", frequency: 1 }],
      lastAppliedTimestamp: now,
    });
    expect(users[0].location).toMatchObject({
      city: "Amsterdam",
      country: "Netherlands",
    });
    expect(users[0].skills).toEqual([
      expect.objectContaining({ normalizedName: "typescript" }),
    ]);
    expect(users[0].linkedAccounts).toMatchObject({
      github: "user-one",
      email: "person@example.com",
      wallets: [],
    });

    await expect(
      repository.updateTalentList(
        "acme-org",
        "candidates",
        "Priority Candidates",
        "Priority list",
      ),
    ).resolves.toMatchObject({
      status: "updated",
      properties: { normalizedName: "priority-candidates" },
    });
    await expect(
      repository.deleteTalentList("acme-org", "priority-candidates"),
    ).resolves.toBe(true);
  });

  it("returns available profiles, scoped notes, and verification exclusions", async () => {
    await seedRichProfile();
    await expect(
      repository.setRecruiterNote("0xUserOne", "Strong fit", "acme-org"),
    ).resolves.toBe(true);
    let users = await repository.getAvailableUsers("acme-org");
    expect(users).toEqual([
      expect.objectContaining({ wallet: "0xUserOne", note: "Strong fit" }),
    ]);
    await createRelationship(userOneId, organizationId, "VERIFIED_FOR_ORG");
    users = await repository.getAvailableUsers("acme-org");
    expect(users).toEqual([]);
    await expect(repository.getAllProfiles()).resolves.toHaveLength(2);
    await expect(repository.getCryptoNative("0xUserOne")).resolves.toBe(true);
  });

  it("deletes a user and its owned profile nodes", async () => {
    const location = await createNode("UserLocation", "location:owned", {
      id: "location-id",
      city: "Amsterdam",
      country: "Netherlands",
    });
    await createRelationship(userOneId, location, "HAS_LOCATION");
    await expect(repository.deleteUser("0xUserOne")).resolves.toBe(true);
    await expect(
      repository.findUserByWallet("0xUserOne"),
    ).resolves.toBeUndefined();
    const [row] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_nodes WHERE id = $1",
      [location],
    );
    expect(Number(row.count)).toBe(0);
  });

  it("has the user identity and availability indexes", async () => {
    const names = [
      "graph_nodes_user_wallet_idx",
      "graph_nodes_user_email_normalized_unique_idx",
      "graph_nodes_linked_wallet_address_idx",
      "graph_nodes_user_privy_id_idx",
      "graph_nodes_available_users_idx",
    ];
    const rows = await postgres.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])",
      [names],
    );
    expect(rows.map(row => row.indexname).sort()).toEqual(names.sort());
  });

  it("serves user identity and scoped email methods from PostgreSQL", async () => {
    await expect(service.findByWallet("0xUserOne")).resolves.toMatchObject({});
    await expect(service.findOrgIdByJobShortUUID("job-short")).resolves.toBe(
      "acme-org",
    );
    expect(service.normalizeEmail("Person+tag@example.com")).toBe(
      "persontagexample.com",
    );
    await expect(
      service.addUserEmail("0xUserOne", "person@example.com"),
    ).resolves.toMatchObject({ success: true });
    await service.verifyUserEmail("person@example.com");
    await expect(
      service.updateUserMainEmail("0xUserOne", "person@example.com"),
    ).resolves.toMatchObject({ success: true });
    await expect(service.getUserEmails("0xUserOne")).resolves.toEqual([
      { email: "person@example.com", main: true },
    ]);
    await expect(
      service.removeUserEmail("0xUserOne", "person@example.com"),
    ).resolves.toMatchObject({ success: true });
    expect(profileService.getUserWorkHistory).toHaveBeenCalledWith("0xUserOne");
  });

  it("serves talent lists and available-user profiles", async () => {
    await seedRichProfile();
    await expect(
      service.createTalentList("acme-org", {
        name: "Candidates",
        description: "Strong candidates",
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { normalizedName: "candidates" },
    });
    await expect(
      service.updateOrgTalentList("acme-org", "candidates", {
        wallets: ["0xUserOne", "0xUserTwo"],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        users: [expect.objectContaining({ wallet: "0xUserOne" })],
      },
    });
    await expect(
      service.getUsersAvailableForWork(
        { city: "amster", country: "nether", page: null, limit: null },
        null,
      ),
    ).resolves.toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          wallet: "0xUserOne",
          availableForWork: true,
          skills: [expect.objectContaining({ normalizedName: "typescript" })],
        }),
      ],
    });
  });

  it("applies organization-seat authorization and permission syncing", async () => {
    profileService.getUserVerifications.mockResolvedValue({
      success: true,
      message: "verified",
      data: [{ id: "acme-org", credential: "email" }],
    });
    const subscription = {
      totalSeats: 2,
      isActive: () => true,
    } as unknown as Subscription;
    await expect(
      service.addOrgUser("acme-org", "0xUserOne", subscription),
    ).resolves.toMatchObject({ success: true });
    await expect(service.isOrgOwner("0xUserOne", "acme-org")).resolves.toBe(
      true,
    );
    expect(permissionService.syncUserPermissions).toHaveBeenCalled();
    await service.transferOrgSeat("acme-org", "0xUserOne", "0xUserTwo");
    await expect(service.isOrgOwner("0xUserTwo", "acme-org")).resolves.toBe(
      true,
    );
  });

  it("deletes Privy users and PostgreSQL profile state", async () => {
    await expect(service.deletePrivyUser("0xUserOne")).resolves.toEqual({
      success: true,
      message: "User account deleted successfully",
    });
    expect(privyService.deletePrivyUser).toHaveBeenCalledWith("privy-one");
    await expect(service.findByWallet("0xUserOne")).resolves.toBeUndefined();
  });

  async function seedJobProjection(): Promise<void> {
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          organization_name, title, online, blocked, published_timestamp,
          filter_labels, payload, detail_payload
        ) VALUES (
          $1, 'job-id', 'job-short', 'acme-org', 'Acme', 'Engineer', true,
          false, $2, $3::jsonb, $4::jsonb, $4::jsonb
        )
      `,
      [
        jobId,
        now,
        JSON.stringify({
          classifications: { engineering: "ENGINEERING" },
          tags: { typescript: "TypeScript" },
        }),
        JSON.stringify({
          id: "job-id",
          shortUUID: "job-short",
          title: "Engineer",
        }),
      ],
    );
  }

  async function seedRichProfile(): Promise<void> {
    const github = await createNode("GithubUser", "github:profile", {
      id: "github-profile-id",
      nodeId: "github-profile-node",
      avatarUrl: "https://example.com/avatar.png",
    });
    const location = await createNode("UserLocation", "location:profile", {
      id: "location-profile-id",
      city: "Amsterdam",
      country: "Netherlands",
    });
    const account = await createNode("LinkedAccount", "account:profile", {
      id: "account-id",
      github: "user-one",
      email: "person@example.com",
    });
    const tag = await createNode("Tag", "tag:typescript", {
      id: "tag-id",
      name: "TypeScript",
      normalizedName: "typescript",
      createdTimestamp: now,
    });
    await createRelationship(userOneId, github, "HAS_GITHUB_USER");
    await createRelationship(userOneId, location, "HAS_LOCATION");
    await createRelationship(userOneId, account, "HAS_LINKED_ACCOUNT");
    await createRelationship(userOneId, tag, "HAS_SKILL", { canTeach: true });
    await createRelationship(userOneId, jobId, "APPLIED_TO", {
      createdTimestamp: now,
    });
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
