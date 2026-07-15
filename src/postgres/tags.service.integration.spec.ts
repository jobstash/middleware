import { ConfigService } from "@nestjs/config";
import NotFoundError from "src/shared/errors/not-found-error";
import { TagsService } from "src/tags/tags.service";
import { PostgresService } from "./postgres.service";
import { TagRepository } from "./tag.repository";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("TagsService PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: TagRepository;
  let service: TagsService;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-tags-service-integration-test",
    });
    await postgres.onModuleInit();
    repository = new TagRepository(postgres);
    service = new TagsService(repository, {
      get: jest.fn().mockReturnValue(100),
    } as unknown as ConfigService);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
  });

  it("preserves the tag CRUD API with plain PostgreSQL entities", async () => {
    const created = await service.create(
      { name: "TypeScript", normalizedName: "typescript" },
      "0xcreator",
    );
    expect(created.getNormalizedName()).toBe("typescript");
    await expect(service.findById(created.getId())).resolves.toMatchObject({});
    await expect(
      service.findByNormalizedName("missing"),
    ).resolves.toBeUndefined();
    expect(service.normalizeTagName("React JS")).toBe("react-js");

    await expect(
      service.update(created.getId(), {
        name: "Typescript",
        normalizedName: "typescript",
      }),
    ).resolves.toMatchObject({ name: "Typescript" });
    await expect(service.deleteById(created.getId())).resolves.toBe(true);
    await expect(service.deleteById(created.getId())).resolves.toBe(false);
  });

  it("applies moderation to synonym components and restores allowed tags", async () => {
    await createTag("JavaScript", "javascript");
    await createTag("JS", "js");
    await service.linkSynonyms("javascript", "js", "0xsuggester");

    await service.blockTag("javascript", "0xmoderator");
    await expect(service.hasBlockedRelation("javascript")).resolves.toBe(true);
    await expect(service.hasBlockedRelation("js")).resolves.toBe(true);
    await expect(
      service.hasBlockedTagCreatorRelationship("js", "0xmoderator"),
    ).resolves.toBe(true);

    await service.unblockTag("javascript", "0xmoderator");
    await expect(service.hasBlockedRelation("javascript")).resolves.toBe(false);
    await expect(service.hasBlockedRelation("js")).resolves.toBe(false);
    await expect(
      repository.hasDesignation("javascript", "AllowedDesignation"),
    ).resolves.toBe(true);
    await expect(
      repository.hasDesignation("js", "AllowedDesignation"),
    ).resolves.toBe(true);
  });

  it("matches unused tags without requiring a job and reports misses", async () => {
    await createTag("TypeScript", "typescript");
    await createTag("Java", "java");
    await createTag("Skill", "skill");
    await service.blockTag("java", "0xmoderator");

    await expect(
      service.matchTags(["typescrpt", "java", "unknown", "not-a-real-skill"]),
    ).resolves.toEqual({
      success: true,
      message: "Matched tags successfully",
      data: {
        recognized_tags: ["TypeScript"],
        unrecognized_tags: ["java", "unknown", "not-a-real-skill"],
      },
    });
  });

  it("uses legacy fuzzy distance and exact-match scoring for batch matches", async () => {
    const solidity = await createTag("Solidity", "solidity");
    const solid = await createTag("SOLID", "solid");
    await seedSearchJob("job-one", [solidity.getId(), solid.getId()]);

    const result = await service.batchMatchTags(["solidity"], 0.5, 5);

    expect(result.success).toBe(true);
    if (!("data" in result)) throw new Error("batch response has no data");
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: solidity.getId(),
      normalizedName: "solidity",
    });
    expect(result.data[0].score).toBeCloseTo(
      Math.log(3) * 5.205623149871826,
      12,
    );
  });

  it("searches and batch-ranks job-backed tags with co-occurrence", async () => {
    const typescript = await createTag("TypeScript", "typescript");
    const postgresTag = await createTag("PostgreSQL", "postgresql");
    const react = await createTag("React", "react");
    await seedSearchJob("job-one", [
      typescript.getId(),
      postgresTag.getId(),
      react.getId(),
    ]);

    await expect(service.searchTags("typescrpt")).resolves.toEqual([
      expect.objectContaining({ normalizedName: "typescript" }),
    ]);
    const batch = await service.batchMatchTags(
      ["typescript", "postgresql", "react"],
      0.5,
      2,
    );
    expect(batch.success).toBe(true);
    if (!("data" in batch)) throw new Error("batch response has no data");
    expect(batch.data).toHaveLength(2);
    expect(batch.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ score: expect.any(Number) }),
      ]),
    );
  });

  it("keeps missing relationship targets explicit", async () => {
    const tag = await createTag("TypeScript", "typescript");
    await expect(
      service.relateTagToStructuredJobpost(tag.getId(), "missing-job"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.linkSynonyms("typescript", "missing", "0xsuggester"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.blockTag("missing", "0xmoderator"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  async function createTag(
    name: string,
    normalizedName: string,
  ): ReturnType<TagsService["create"]> {
    return service.create({ name, normalizedName }, "0xtest");
  }

  async function seedSearchJob(id: string, tagIds: string[]): Promise<void> {
    const [job] = await postgres.query<{ id: string }>(
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES (
          'StructuredJobpost', ARRAY['StructuredJobpost']::text[], $1,
          $2::jsonb
        )
        RETURNING id::text AS id
      `,
      [
        `job:${id}`,
        JSON.stringify({ id, shortUUID: `${id}-short`, title: "Engineer" }),
      ],
    );
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          title, online, payload, detail_payload
        ) VALUES (
          $1, $2, $3, 'test-organization', 'Engineer', true,
          $4::jsonb, $4::jsonb
        )
      `,
      [
        job.id,
        id,
        `${id}-short`,
        JSON.stringify({ id, shortUUID: `${id}-short`, title: "Engineer" }),
      ],
    );
    for (const tagId of tagIds) {
      await postgres.query(
        `
          INSERT INTO graph_relationships (
            source_id, target_id, type, relationship_key, properties
          )
          SELECT $1, tag.id, 'HAS_TAG', '', '{}'::jsonb
          FROM graph_nodes tag
          WHERE tag.label = 'Tag' AND tag.properties ->> 'id' = $2
        `,
        [job.id, tagId],
      );
    }
  }
});
