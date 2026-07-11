import { JobGraphRepository } from "./job-graph.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("JobGraphRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: JobGraphRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 8,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-job-graph-integration-test",
    });
    await postgres.onModuleInit();
    repository = new JobGraphRepository(postgres);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
  });

  it("loads applicants and updates admin and organization lists in bulk", async () => {
    const organization = await createOrganization("org-1", "Acme");
    const applicant = await createNode("User", "user-1", {
      id: "user-1",
      wallet: "0xABC",
      available: true,
      cryptoNative: false,
      cryptoAdjacent: true,
    });
    const job = await createSearchJob("job-1", {
      organizationId: "org-1",
      tags: ["typescript"],
    });
    await relate(applicant, job, "APPLIED_TO", { createdTimestamp: 123 });
    await relate(applicant, job, "BOOKMARKED");
    const skill = await createNode("Tag", "tag-typescript", {
      id: "tag-typescript",
      name: "TypeScript",
      normalizedName: "typescript",
    });
    await relate(applicant, skill, "HAS_SKILL", { canTeach: "false" });
    await relate(job, skill, "HAS_TAG");

    const fresh = await repository.getApplicants({
      organizationId: "org-1",
      list: "new",
    });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({
      appliedTimestamp: 123,
      user: { wallet: "0xABC", matchingSkills: 1 },
      job: { shortUUID: "job-1", organization: { orgId: "org-1" } },
    });

    await expect(
      repository.updateApplicantLists({
        applicants: [{ wallet: "0xabc", job: "job-1" }],
        list: "shortlisted",
        field: "list",
        organizationId: "org-1",
      }),
    ).resolves.toBe(1);
    await expect(
      repository.getApplicants({
        organizationId: "org-1",
        list: "shortlisted",
      }),
    ).resolves.toHaveLength(1);

    const bookmarked = await repository.getUserJobPayloads(
      "0xabc",
      "BOOKMARKED",
    );
    expect(bookmarked).toHaveLength(1);
    expect(bookmarked[0]).toMatchObject({ shortUUID: "job-1" });
    expect(organization).toBeDefined();
  });

  it("creates, replaces, loads, and deletes job folders transactionally", async () => {
    await createOrganization("org-1", "Acme");
    await createNode("User", "user-1", {
      id: "user-1",
      wallet: "0xFolderOwner",
      available: true,
    });
    await createSearchJob("job-1", { organizationId: "org-1" });

    const id = await repository.saveJobFolder({
      wallet: "0xfolderowner",
      name: "My Jobs",
      isPublic: true,
      jobs: ["job-1"],
    });
    expect(id).toBeDefined();
    await expect(
      repository.getJobFolders({ wallet: "0xFolderOwner" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id,
        slug: "my-jobs",
        isPublic: true,
        jobs: [expect.objectContaining({ shortUUID: "job-1" })],
      }),
    ]);

    await repository.saveJobFolder({
      id,
      name: "Renamed",
      isPublic: false,
      jobs: [],
    });
    await expect(repository.getJobFolders({ id })).resolves.toEqual([
      expect.objectContaining({ slug: "renamed", isPublic: false, jobs: [] }),
    ]);
    await expect(repository.deleteJobFolder(id!)).resolves.toBe(true);
    await expect(repository.getJobFolders({ id })).resolves.toEqual([]);
  });

  it("refreshes a changed job projection inside the mutation transaction", async () => {
    const job = await createNode("StructuredJobpost", "job-refresh", {
      id: "job-refresh-id",
      shortUUID: "job-refresh",
      title: "Old title",
      access: "public",
      benefits: [],
      requirements: [],
      responsibilities: [],
      firstSeenTimestamp: Date.now(),
    });
    const online = await createNode("JobpostOnlineStatus", "online", {
      name: "online",
    });
    await relate(job, online, "HAS_STATUS");
    await postgres.query(
      "SELECT refresh_job_search_document_ids($1::bigint[])",
      [[job]],
    );

    await expect(
      repository.updateJobProperties(["job-refresh"], {
        title: "New title",
        salary: 120_000,
      }),
    ).resolves.toBe(1);
    const [document] = await postgres.query<{
      title: string;
      salary: string;
      payload: Record<string, unknown>;
    }>(
      `
        SELECT title, salary::text, payload
        FROM job_search_documents
        WHERE short_uuid = 'job-refresh'
      `,
    );
    expect(document).toMatchObject({
      title: "New title",
      salary: "120000",
      payload: { title: "New title", salary: 120_000 },
    });
  });

  it("ranks similar and suggested jobs from indexed projection arrays", async () => {
    await createOrganization("org-source", "Source");
    await createOrganization("org-other", "Other");
    const now = Date.now();
    await createSearchJob("source", {
      organizationId: "org-source",
      tags: ["typescript", "postgresql"],
      classifications: ["engineering"],
      publishedTimestamp: now,
    });
    await createSearchJob("candidate", {
      organizationId: "org-other",
      tags: ["typescript", "postgresql"],
      classifications: ["engineering"],
      publishedTimestamp: now - 1_000,
    });
    const typescript = await createNode("Tag", "tag-typescript", {
      id: "tag-typescript",
      name: "TypeScript",
      normalizedName: "typescript",
    });
    const sourceNode = await findNodeId(
      "StructuredJobpost",
      "shortUUID",
      "source",
    );
    await relate(sourceNode, typescript, "HAS_TAG");

    await expect(repository.getSimilarJobs("source")).resolves.toEqual([
      expect.objectContaining({ shortUUID: "candidate" }),
    ]);
    const suggestions = await repository.getSuggestedJobPayloads({
      skills: ["typescript"],
      minimumOverlapRatio: 0.1,
      minimumMatchCount: 1,
      limit: 10,
      offset: 0,
    });
    expect(suggestions.total).toBe(2);
    expect(suggestions.rows).toHaveLength(2);
    await expect(
      repository.getJobTagMatchData("source"),
    ).resolves.toMatchObject({ jobTags: ["typescript"] });
  });

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

  async function relate(
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
      `,
      [sourceId, targetId, type, JSON.stringify(properties)],
    );
  }

  async function createOrganization(id: string, name: string): Promise<string> {
    const nodeId = await createNode("Organization", id, {
      id,
      orgId: id,
      name,
      normalizedName: name.toLowerCase(),
    });
    await postgres.query(
      `
        INSERT INTO organization_search_documents (
          organization_node_id,
          organization_id,
          name,
          normalized_name,
          payload
        ) VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        nodeId,
        id,
        name,
        name.toLowerCase(),
        JSON.stringify({ orgId: id, name, normalizedName: name.toLowerCase() }),
      ],
    );
    return nodeId;
  }

  async function createSearchJob(
    shortUuid: string,
    options: {
      organizationId?: string;
      tags?: string[];
      classifications?: string[];
      publishedTimestamp?: number;
    } = {},
  ): Promise<string> {
    const nodeId = await createNode("StructuredJobpost", shortUuid, {
      id: `${shortUuid}-id`,
      shortUUID: shortUuid,
      title: shortUuid,
    });
    const payload = {
      id: `${shortUuid}-id`,
      shortUUID: shortUuid,
      title: shortUuid,
      timestamp: options.publishedTimestamp ?? Date.now(),
      tags: (options.tags ?? []).map(tag => ({
        id: `tag-${tag}`,
        name: tag,
        normalizedName: tag,
      })),
    };
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id,
          structured_jobpost_id,
          short_uuid,
          organization_id,
          title,
          online,
          blocked,
          published_timestamp,
          tags,
          classifications,
          payload,
          detail_payload
        ) VALUES (
          $1, $2, $3, $4, $3, true, false, $5, $6::text[], $7::text[],
          $8::jsonb, $8::jsonb
        )
      `,
      [
        nodeId,
        `${shortUuid}-id`,
        shortUuid,
        options.organizationId ?? null,
        options.publishedTimestamp ?? Date.now(),
        options.tags ?? [],
        options.classifications ?? [],
        JSON.stringify(payload),
      ],
    );
    return nodeId;
  }

  async function findNodeId(
    label: string,
    property: string,
    value: string,
  ): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM graph_nodes
        WHERE label = $1 AND properties ->> $2 = $3
      `,
      [label, property, value],
    );
    return row.id;
  }
});
