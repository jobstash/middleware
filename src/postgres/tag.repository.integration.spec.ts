import { Client } from "pg";
import { PostgresService } from "./postgres.service";
import { TagRepository } from "./tag.repository";
import { createProfileMemberFixture } from "./postgres.integration-fixtures";

const databaseUrl = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("fuzzy tag matching in PostgreSQL", () => {
  let db: Client;
  let tags: TagRepository;
  const schema = `fuzzy_tags_test_${process.pid}`;

  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname))
      throw new Error("Tag fixtures require an isolated local database");
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE EXTENSION IF NOT EXISTS unaccent;
      CREATE SCHEMA ${schema};
      SET search_path TO ${schema}, public;
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY, label text, properties jsonb);
      CREATE TABLE graph_relationships(source_id bigint, target_id bigint, type text);
      CREATE INDEX ON graph_relationships(target_id, type, source_id);
      CREATE INDEX ON graph_relationships(source_id, type, target_id);
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY);
      CREATE FUNCTION slugify_text(value text) RETURNS text LANGUAGE sql STABLE AS $$
        SELECT CASE WHEN value IS NULL THEN '' ELSE COALESCE(
          NULLIF(trim(BOTH '-' FROM regexp_replace(lower(unaccent(value)), '[^a-z0-9]+', '-', 'g')), ''),
          lower(trim(value))) END
      $$;
      CREATE INDEX ON graph_nodes USING gin (lower(properties ->> 'name') gin_trgm_ops) WHERE label = 'Tag';
      CREATE INDEX ON graph_nodes USING gin ((properties ->> 'normalizedName') gin_trgm_ops) WHERE label = 'Tag';
      INSERT INTO graph_nodes VALUES
        (1, 'Tag', '{"id":"rust","name":"Rust","normalizedName":"rust","createdTimestamp":0}'),
        (2, 'Tag', '{"id":"rust-lang","name":"Rust Lang","normalizedName":"rust-lang","createdTimestamp":0}'),
        (3, 'Tag', '{"id":"python","name":"Python","normalizedName":"python","createdTimestamp":0}'),
        (4, 'Tag', '{"id":"unknown","name":"Unknown","normalizedName":"unknown","createdTimestamp":0}'),
        (10, 'PreferredDesignation', '{}'), (11, 'BlockedDesignation', '{}');
      INSERT INTO graph_relationships VALUES
        (1,10,'HAS_TAG_DESIGNATION'), (2,1,'IS_SYNONYM_OF'),
        (3,11,'HAS_TAG_DESIGNATION'), (100,1,'HAS_TAG'),
        (100,1,'HAS_TAG'), (101,1,'HAS_TAG'), (100,3,'HAS_TAG');
      INSERT INTO job_search_documents VALUES (100), (101);
    `);
    tags = new TagRepository({
      query: async (sql: string, parameters: unknown[]) =>
        (await db.query(sql, parameters)).rows,
    } as unknown as PostgresService);
  });

  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  });

  it("shares canonical job counts across inputs without changing alias or blocking semantics", async () => {
    const matches = await tags.fuzzyMatches([
      "Rust",
      "rust-lang",
      "Rust",
      "Python",
      "Unknown",
    ]);
    expect(matches).toHaveLength(2);
    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "Rust", id: "rust", jobCount: 2 }),
        expect.objectContaining({
          input: "rust-lang",
          id: "rust",
          jobCount: 2,
        }),
      ]),
    );
    expect(
      matches.every(match => Number.isFinite(match.score) && match.score > 0),
    ).toBe(true);
  });

  it("retains zero-job candidates when requested", async () => {
    expect(await tags.fuzzyMatches(["Unknown"], 5, false)).toEqual([
      expect.objectContaining({ input: "Unknown", id: "unknown", jobCount: 0 }),
    ]);
    expect(await tags.fuzzyMatches([], 5, false)).toEqual([]);
  });
});

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("TagRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let repository: TagRepository;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-tag-integration-test",
    });
    await postgres.onModuleInit();
    repository = new TagRepository(postgres);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
  });

  it("creates, reads, updates, and deletes tags with a default designation", async () => {
    const created = await repository.createTag(
      { name: "TypeScript", normalizedName: "typescript" },
      "0xcreator",
    );

    expect(created).toMatchObject({
      name: "TypeScript",
      normalizedName: "typescript",
    });
    await expect(repository.findById(created.id)).resolves.toEqual(created);
    await expect(
      repository.findByNormalizedName("typescript"),
    ).resolves.toEqual(created);
    await expect(repository.findAll()).resolves.toEqual([created]);
    await expect(
      repository.hasDesignation(
        "typescript",
        "DefaultDesignation",
        "0xcreator",
      ),
    ).resolves.toBe(true);

    const updated = await repository.updateTag(created.id, {
      name: "Typescript",
    });
    expect(updated).toMatchObject({ name: "Typescript" });
    await expect(repository.deleteTag(created.id)).resolves.toBe(true);
    await expect(repository.deleteTag(created.id)).resolves.toBe(false);
  });

  it("propagates blocking and unblocking across a synonym component", async () => {
    await createTag("JavaScript", "javascript");
    await createTag("JS", "js");
    await repository.connectSynonyms("javascript", "js", "0xsuggester");

    await repository.setDesignation({
      normalizedName: "javascript",
      designation: "BlockedDesignation",
      creatorWallet: "0xmoderator",
      includeSynonyms: true,
      replaceAllowed: true,
    });

    await expect(
      repository.findBlockedTag("javascript"),
    ).resolves.toBeDefined();
    await expect(repository.findBlockedTag("js")).resolves.toBeDefined();
    await expect(
      repository.hasDesignation("js", "BlockedDesignation", "0xmoderator"),
    ).resolves.toBe(true);
    await expect(
      repository.getTagsByDesignation("BlockedDesignation"),
    ).resolves.toHaveLength(2);

    await expect(
      repository.removeDesignation("javascript", "BlockedDesignation", true),
    ).resolves.toBe(true);
    await repository.setDesignation({
      normalizedName: "javascript",
      designation: "AllowedDesignation",
      creatorWallet: "0xmoderator",
      includeSynonyms: true,
    });
    await expect(
      repository.hasDesignation("javascript", "AllowedDesignation"),
    ).resolves.toBe(true);
    await expect(
      repository.hasDesignation("js", "AllowedDesignation"),
    ).resolves.toBe(true);
  });

  it("resolves preferred tags and transitive synonyms", async () => {
    const javascript = await createTag("JavaScript", "javascript");
    await createTag("JS", "js");
    await createTag("ECMAScript", "ecmascript");
    await repository.setDesignation({
      normalizedName: "javascript",
      designation: "PreferredDesignation",
      creatorWallet: "0xmoderator",
    });

    await expect(
      repository.connectSynonyms("javascript", "js", undefined, true),
    ).resolves.toHaveLength(2);
    await repository.connectSynonyms("js", "ecmascript", "0xsuggester");

    await expect(
      repository.areSynonymConnected("javascript", "ecmascript"),
    ).resolves.toBe(true);
    const preference = await repository.findPreferredTag("javascript");
    expect(preference?.tag.normalizedName).toBe("javascript");
    expect(preference?.synonyms.map(tag => tag.normalizedName).sort()).toEqual([
      "ecmascript",
      "js",
    ]);
    await expect(
      repository.getPreferredForSynonym("js"),
    ).resolves.toMatchObject({ tag: { normalizedName: "javascript" } });
    await expect(repository.resolveAlias("js")).resolves.toMatchObject({
      input: "js",
      canonical: { normalizedName: "javascript" },
      redirected: true,
    });
    await expect(repository.getPreferredTags()).resolves.toHaveLength(1);

    await postgres.query(
      `
        INSERT INTO tag_aliases (
          alias_normalized, alias_name, canonical_tag_node_id,
          decision, confidence, resolver_version
        )
        SELECT 'js', 'JS', id, 'automatic', 0.95, 'test'
        FROM graph_nodes
        WHERE label = 'Tag' AND properties ->> 'id' = $1
      `,
      [javascript.id],
    );

    await expect(
      repository.disconnectSynonyms("javascript", "js"),
    ).resolves.toBe(true);
    await expect(directSynonymExists("javascript", "js")).resolves.toBe(false);
    await expect(
      postgres.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM tag_alias_blocks
          WHERE left_normalized = 'javascript' AND right_normalized = 'js'
        `,
      ),
    ).resolves.toEqual([{ count: "1" }]);
    await expect(
      postgres.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM tag_aliases
          WHERE alias_normalized = 'js'
        `,
      ),
    ).resolves.toEqual([{ count: "0" }]);

    await repository.connectSynonyms("javascript", "js", "0xmoderator");
    await expect(
      postgres.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM tag_alias_blocks
          WHERE left_normalized = 'javascript' AND right_normalized = 'js'
        `,
      ),
    ).resolves.toEqual([{ count: "0" }]);
  });

  it("resolves a persisted canonical alias before an obsolete exact tag", async () => {
    await createTag("Old spelling", "old-spelling");
    const canonical = await createTag("Canonical", "canonical");
    await postgres.query(
      `
        INSERT INTO tag_aliases (
          alias_normalized, alias_name, canonical_tag_node_id,
          decision, confidence, resolver_version
        )
        SELECT 'old-spelling', 'Old spelling', id,
          'automatic', 0.95, 'test'
        FROM graph_nodes
        WHERE label = 'Tag' AND properties ->> 'id' = $1
      `,
      [canonical.id],
    );

    await expect(
      repository.resolveAlias("old-spelling"),
    ).resolves.toMatchObject({
      input: "old-spelling",
      canonical: { normalizedName: "canonical" },
      redirected: true,
    });
  });

  it("rejects preferred-only synonym links when the origin is not preferred", async () => {
    await createTag("React", "react");
    await createTag("ReactJS", "reactjs");

    await expect(
      repository.connectSynonyms("react", "reactjs", undefined, true),
    ).resolves.toEqual([]);
    await expect(
      repository.areSynonymConnected("react", "reactjs"),
    ).resolves.toBe(false);
  });

  it("atomically replaces paired tags", async () => {
    await createTag("Frontend", "frontend");
    await createTag("React", "react");
    await createTag("Vue", "vue");

    await expect(
      repository.replacePairings("frontend", ["react"], "0xcreator"),
    ).resolves.toBe(true);
    let pairs = await repository.getPairedTags();
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      tag: { normalizedName: "frontend" },
      pairings: [{ normalizedName: "react" }],
    });

    await repository.replacePairings("frontend", ["vue"], "0xcreator");
    pairs = await repository.getPairedTags();
    expect(pairs[0]).toMatchObject({
      pairings: [{ normalizedName: "vue" }],
    });
    expect(JSON.stringify(pairs[0])).not.toContain("react");
  });

  it("refreshes the structured job projection after tag mutations", async () => {
    const tag = await createTag("TypeScript", "typescript");
    await createNode("StructuredJobpost", "job:one", {
      id: "job-one",
      shortUUID: "job-one-short",
      title: "Engineer",
    });

    await expect(
      repository.linkTagToJob(tag.id, "job-one"),
    ).resolves.toMatchObject({ id: tag.id });
    await expect(projectedTagNames("job-one")).resolves.toEqual(["TypeScript"]);

    await repository.updateTag(tag.id, { name: "Typescript" });
    await expect(projectedTagNames("job-one")).resolves.toEqual(["Typescript"]);

    await repository.setDesignation({
      normalizedName: "typescript",
      designation: "BlockedDesignation",
      creatorWallet: "0xmoderator",
      replaceAllowed: true,
    });
    await expect(projectedTagNames("job-one")).resolves.toEqual([]);
    await expect(
      repository.linkTagToJob("missing-tag", "job-one"),
    ).resolves.toBeUndefined();
  });

  it("matches misspelled tags, excludes blocked tags, and scores job usage", async () => {
    const typescript = await createTag("TypeScript", "typescript");
    const javascript = await createTag("JavaScript", "javascript");
    const blocked = await createTag("Java", "java");
    await repository.setDesignation({
      normalizedName: "java",
      designation: "BlockedDesignation",
      creatorWallet: "0xmoderator",
      replaceAllowed: true,
    });
    await seedSearchJob("job-one", "job-one-short", [
      typescript.id,
      javascript.id,
      blocked.id,
    ]);

    const matches = await repository.fuzzyMatches([
      "typescrpt",
      "javascript",
      "java",
    ]);
    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: "typescrpt",
          normalizedName: "typescript",
          jobCount: 1,
        }),
        expect.objectContaining({
          input: "javascript",
          normalizedName: "javascript",
          jobCount: 1,
        }),
      ]),
    );
    expect(matches.some(match => match.normalizedName === "java")).toBe(false);

    const unused = await createTag("Cobol", "cobol");
    await expect(repository.fuzzyMatches(["cobol"], 5, true)).resolves.toEqual(
      [],
    );
    await expect(repository.fuzzyMatches(["cobol"], 5, false)).resolves.toEqual(
      [expect.objectContaining({ id: unused.id, normalizedName: "cobol" })],
    );
  });

  it("orders popular tags, supports an unlimited result set, and counts co-occurrence", async () => {
    const typescript = await createTag("TypeScript", "typescript");
    const postgresTag = await createTag("PostgreSQL", "postgresql");
    const react = await createTag("React", "react");
    await seedSearchJob("job-one", "job-one-short", [
      typescript.id,
      postgresTag.id,
      react.id,
    ]);
    await seedSearchJob("job-two", "job-two-short", [typescript.id]);

    const popular = await repository.getPopularTags(0, 100);
    expect(popular.map(tag => tag.normalizedName)).toEqual([
      "typescript",
      "postgresql",
      "react",
    ]);
    await expect(repository.getPopularTags(1, 100)).resolves.toHaveLength(1);
    await expect(repository.getUnblockedTags()).resolves.toHaveLength(3);

    const cooccurrence = await repository.getCooccurrence([
      typescript.id,
      postgresTag.id,
      react.id,
    ]);
    expect(cooccurrence.get(typescript.id)).toBe(2);
    expect(cooccurrence.get(postgresTag.id)).toBe(2);
    expect(cooccurrence.get(react.id)).toBe(2);
  });

  it("has the JSON, trigram, and relationship indexes used by tag queries", async () => {
    const rows = await postgres.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = ANY($1::text[])
      `,
      [
        [
          "graph_nodes_properties_gin_idx",
          "graph_nodes_normalized_name_trgm_idx",
          "graph_relationships_source_type_target_idx",
          "graph_relationships_target_type_source_idx",
        ],
      ],
    );
    expect(rows.map(row => row.indexname).sort()).toEqual(
      [
        "graph_nodes_normalized_name_trgm_idx",
        "graph_nodes_properties_gin_idx",
        "graph_relationships_source_type_target_idx",
        "graph_relationships_target_type_source_idx",
      ].sort(),
    );
  });

  async function createTag(
    name: string,
    normalizedName: string,
  ): ReturnType<TagRepository["createTag"]> {
    return repository.createTag({ name, normalizedName }, "0xtest");
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
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
  ): Promise<void> {
    await postgres.query(
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', '{}'::jsonb)
        ON CONFLICT (source_id, target_id, type, relationship_key) DO NOTHING
      `,
      [sourceNodeId, targetNodeId, type],
    );
  }

  async function seedSearchJob(
    id: string,
    shortUuid: string,
    tagIds: string[],
  ): Promise<void> {
    const organizationId = `test-organization-${id}`;
    const organizationNodeId = await createProfileMemberFixture(
      postgres,
      "Organization",
      `organization:${id}`,
      { orgId: organizationId, name: `Organization ${id}` },
    );
    const jobNodeId = await createNode("StructuredJobpost", `job:${id}`, {
      id,
      shortUUID: shortUuid,
      title: "Engineer",
    });
    const tagRows = await postgres.query<{
      id: string;
      normalizedName: string;
    }>(
      `
        SELECT
          properties ->> 'id' AS id,
          properties ->> 'normalizedName' AS "normalizedName"
        FROM graph_nodes
        WHERE label = 'Tag'
          AND properties ->> 'id' = ANY($1::text[])
      `,
      [tagIds],
    );
    await postgres.query(
      `
        INSERT INTO job_search_documents (
          job_node_id, structured_jobpost_id, short_uuid, organization_id,
          title, online, tags, payload, detail_payload
        ) VALUES (
          $1, $2, $3, $4, 'Engineer', true, $5::text[],
          $6::jsonb, $6::jsonb
        )
      `,
      [
        jobNodeId,
        id,
        shortUuid,
        organizationId,
        tagRows.map(tag => tag.normalizedName),
        JSON.stringify({ id, shortUUID: shortUuid, title: "Engineer" }),
      ],
    );
    await postgres.query(
      `
        INSERT INTO job_search_owners (
          job_node_id, organization_node_id, organization_id
        ) VALUES ($1, $2, $3)
      `,
      [jobNodeId, organizationNodeId, organizationId],
    );
    for (const tagId of tagIds) {
      const [tag] = await postgres.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM graph_nodes
          WHERE label = 'Tag' AND properties ->> 'id' = $1
        `,
        [tagId],
      );
      await createRelationship(jobNodeId, tag.id, "HAS_TAG");
    }
  }

  async function projectedTagNames(jobId: string): Promise<string[]> {
    const [row] = await postgres.query<{ names: string[] }>(
      `
        SELECT COALESCE(
          array_agg(tag ->> 'name' ORDER BY tag ->> 'name'),
          ARRAY[]::text[]
        ) AS names
        FROM structured_job_documents document
        CROSS JOIN LATERAL jsonb_array_elements(document.payload -> 'tags') tag
        JOIN graph_nodes job ON job.id = document.job_node_id
        WHERE job.properties ->> 'id' = $1
      `,
      [jobId],
    );
    return row?.names ?? [];
  }

  async function directSynonymExists(
    firstNormalizedName: string,
    secondNormalizedName: string,
  ): Promise<boolean> {
    const [row] = await postgres.query<{ found: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes first_tag
          JOIN graph_nodes second_tag ON true
          JOIN graph_relationships relationship ON (
            relationship.source_id = first_tag.id
            AND relationship.target_id = second_tag.id
          ) OR (
            relationship.source_id = second_tag.id
            AND relationship.target_id = first_tag.id
          )
          WHERE first_tag.label = 'Tag'
            AND first_tag.properties ->> 'normalizedName' = $1
            AND second_tag.label = 'Tag'
            AND second_tag.properties ->> 'normalizedName' = $2
            AND relationship.type = 'IS_SYNONYM_OF'
        ) AS found
      `,
      [firstNormalizedName, secondNormalizedName],
    );
    return row.found;
  }
});
