import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";
import { data } from "src/shared/interfaces";
import { HacksService } from "./hacks.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("HacksService PostgreSQL integration", () => {
  let postgres: PostgresService;
  let service: HacksService;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-hacks-integration-test",
    });
    await postgres.onModuleInit();
    const graph = new GraphRepository(postgres);
    service = new HacksService(graph, new SearchDocumentRepository(postgres));
  });

  afterAll(async () => postgres.onModuleDestroy());

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    await postgres.query(`
      INSERT INTO graph_nodes (label, labels, node_key, properties)
      VALUES (
        'Project', ARRAY['Project']::text[], 'project-1',
        '{"id":"project-1","name":"Project One","normalizedName":"project-one"}'
      )
    `);
    await postgres.query(`
      SELECT refresh_project_search_document_ids(ARRAY[
        (SELECT id FROM graph_nodes WHERE node_key = 'project-1')
      ])
    `);
  });

  it("creates a hack and refreshes the project projection", async () => {
    const result = await createHack();
    expect(result).toMatchObject({
      success: true,
      data: { id: expect.any(String), category: "Exploit" },
    });
    const [projection] = await postgres.query<{
      hasHacks: boolean;
      hackCount: string;
    }>(`
      SELECT
        has_hacks AS "hasHacks",
        jsonb_array_length(payload -> 'hacks')::text AS "hackCount"
      FROM project_search_documents
      WHERE project_id = 'project-1'
    `);
    expect(projection).toEqual({ hasHacks: true, hackCount: "1" });
  });

  it("finds and lists hacks from graph tables", async () => {
    const created = data(await createHack());
    await expect(service.findOne(created.id)).resolves.toMatchObject({
      success: true,
      data: { id: created.id, fundsLost: 100 },
    });
    await expect(service.findAll()).resolves.toMatchObject({
      success: true,
      data: [expect.objectContaining({ id: created.id })],
    });
  });

  it("updates a hack and its projected project payload", async () => {
    const created = data(await createHack());
    await expect(
      service.update(created.id, { fundsReturned: 75 }),
    ).resolves.toMatchObject({
      success: true,
      data: { id: created.id, fundsReturned: 75 },
    });
    const [row] = await postgres.query<{ fundsReturned: string }>(`
      SELECT payload -> 'hacks' -> 0 ->> 'fundsReturned' AS "fundsReturned"
      FROM project_search_documents
      WHERE project_id = 'project-1'
    `);
    expect(row.fundsReturned).toBe("75");
  });

  it("deletes a hack and clears the project hack flag", async () => {
    const created = data(await createHack());
    await expect(service.remove(created.id)).resolves.toMatchObject({
      success: true,
    });
    const [row] = await postgres.query<{ hasHacks: boolean }>(`
      SELECT has_hacks AS "hasHacks"
      FROM project_search_documents
      WHERE project_id = 'project-1'
    `);
    expect(row.hasHacks).toBe(false);
  });

  it("does not create orphan hacks for missing projects", async () => {
    const result = await service.create("0xcreator", {
      projectId: "missing",
      defiId: "hack-defi",
      category: "Exploit",
      description: "Test incident",
      issueType: "Logic",
      fundsLost: 100,
      date: 1_700_000_000,
      fundsReturned: 25,
    });
    expect(result.success).toBe(false);
    const [row] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_nodes WHERE label = 'Hack'",
    );
    expect(row.count).toBe("0");
  });

  const createHack = () =>
    service.create("0xcreator", {
      projectId: "project-1",
      defiId: "hack-defi",
      category: "Exploit",
      description: "Test incident",
      issueType: "Logic",
      fundsLost: 100,
      date: 1_700_000_000,
      fundsReturned: 25,
    });
});
