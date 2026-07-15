import { GithubUserService } from "src/auth/github/github-user.service";
import { GraphRepository } from "./graph.repository";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("GithubUserService PostgreSQL integration", () => {
  let postgres: PostgresService;
  let service: GithubUserService;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-github-user-integration-test",
    });
    await postgres.onModuleInit();
    service = new GithubUserService(new GraphRepository(postgres));
  });

  afterAll(async () => postgres.onModuleDestroy());

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    await postgres.query(`
      INSERT INTO graph_nodes (label, labels, node_key, properties)
      VALUES (
        'User', ARRAY['User']::text[], 'user-1',
        '{"id":"user-1","wallet":"0x0000000000000000000000000000000000000001"}'
      )
    `);
  });

  it("creates and links GitHub data to a user", async () => {
    const result = await service.addGithubInfoToUser({
      wallet: "0x0000000000000000000000000000000000000001",
      githubLogin: "octocat",
      githubAvatarUrl: "https://example.com/avatar.png",
    });
    expect(result).toMatchObject({ success: true, data: { id: "user-1" } });
    await expect(service.findByLogin("octocat")).resolves.toBeDefined();
    const [row] = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM graph_relationships
      WHERE type = 'HAS_GITHUB_USER'
    `);
    expect(row.count).toBe("1");
  });

  it("updates an existing GitHub profile without duplicating it", async () => {
    const created = await service.create({
      login: "octocat",
      avatarUrl: "https://example.com/old.png",
    });
    await service.update({
      login: "octocat",
      avatarUrl: "https://example.com/new.png",
    });
    const found = await service.findById(created.getId());
    expect(found?.getAvatarUrl()).toBe("https://example.com/new.png");
    const [row] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_nodes WHERE label = 'GithubUser'",
    );
    expect(row.count).toBe("1");
  });

  it("treats already-linked identical data as a no-op", async () => {
    const input = {
      wallet: "0x0000000000000000000000000000000000000001",
      githubLogin: "octocat",
      githubAvatarUrl: "https://example.com/avatar.png",
    };
    await service.addGithubInfoToUser(input);
    await expect(service.addGithubInfoToUser(input)).resolves.toEqual({
      success: false,
      message: "Github data is identical",
    });
  });

  it("unlinks one or all GitHub profiles", async () => {
    await service.create({ login: "one", avatarUrl: "one.png" });
    await service.create({ login: "two", avatarUrl: "two.png" });
    await service.unsafe__linkGithubUser(
      "0x0000000000000000000000000000000000000001",
      "one",
    );
    await service.unsafe__linkGithubUser(
      "0x0000000000000000000000000000000000000001",
      "two",
    );
    await service.removeGithubInfoFromUser(
      "0x0000000000000000000000000000000000000001",
      "one",
    );
    let [row] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_relationships WHERE type = 'HAS_GITHUB_USER'",
    );
    expect(row.count).toBe("1");
    await service.removeGithubInfoFromUser(
      "0x0000000000000000000000000000000000000001",
    );
    [row] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_relationships WHERE type = 'HAS_GITHUB_USER'",
    );
    expect(row.count).toBe("0");
  });
});
