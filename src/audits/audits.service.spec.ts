import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";
import { data } from "src/shared/interfaces";
import { AuditsService } from "./audits.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("AuditsService PostgreSQL integration", () => {
  let postgres: PostgresService;
  let service: AuditsService;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-audits-integration-test",
    });
    await postgres.onModuleInit();
    const graph = new GraphRepository(postgres);
    service = new AuditsService(graph, new SearchDocumentRepository(postgres));
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

  it("creates an audit and refreshes the project projection", async () => {
    const result = await createAudit();
    expect(result).toMatchObject({
      success: true,
      data: { id: expect.any(String), name: "Security Review" },
    });

    const [projection] = await postgres.query<{
      hasAudits: boolean;
      auditCount: string;
    }>(`
      SELECT
        has_audits AS "hasAudits",
        jsonb_array_length(payload -> 'audits')::text AS "auditCount"
      FROM project_search_documents
      WHERE project_id = 'project-1'
    `);
    expect(projection).toEqual({ hasAudits: true, auditCount: "1" });
  });

  it("finds and lists audits from graph tables", async () => {
    const created = data(await createAudit());
    await expect(service.findOne(created.id)).resolves.toMatchObject({
      success: true,
      data: { id: created.id, techIssues: 2 },
    });
    await expect(service.findAll()).resolves.toMatchObject({
      success: true,
      data: [expect.objectContaining({ id: created.id })],
    });
  });

  it("updates an audit and its projected project payload", async () => {
    const created = data(await createAudit());
    await expect(
      service.update(created.id, {
        name: "Security Review",
        date: 1_700_000_000,
        defiId: "audit-defi",
        link: "https://audit.example",
        techIssues: 5,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { id: created.id, techIssues: 5 },
    });
    const [row] = await postgres.query<{ techIssues: string }>(`
      SELECT payload -> 'audits' -> 0 ->> 'techIssues' AS "techIssues"
      FROM project_search_documents
      WHERE project_id = 'project-1'
    `);
    expect(row.techIssues).toBe("5");
  });

  it("deletes an audit and clears the project audit flag", async () => {
    const created = data(await createAudit());
    await expect(service.remove(created.id)).resolves.toMatchObject({
      success: true,
    });
    await expect(service.findOne(created.id)).resolves.toMatchObject({
      success: false,
    });
    const [row] = await postgres.query<{ hasAudits: boolean }>(`
      SELECT has_audits AS "hasAudits"
      FROM project_search_documents
      WHERE project_id = 'project-1'
    `);
    expect(row.hasAudits).toBe(false);
  });

  it("does not create orphan audits for missing projects", async () => {
    const result = await service.create("0xcreator", {
      projectId: "missing",
      name: "Security Review",
      date: 1_700_000_000,
      defiId: "audit-defi",
      link: "https://audit.example",
      techIssues: 2,
    });
    expect(result.success).toBe(false);
    const [row] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_nodes WHERE label = 'Audit'",
    );
    expect(row.count).toBe("0");
  });

  const createAudit = () =>
    service.create("0xcreator", {
      projectId: "project-1",
      name: "Security Review",
      date: 1_700_000_000,
      defiId: "audit-defi",
      link: "https://audit.example",
      techIssues: 2,
    });
});
