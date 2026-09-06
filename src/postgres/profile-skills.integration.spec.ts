import { Client } from "pg";
import { ProfileRepository } from "./profile.repository";
import { SearchRepository } from "./search.repository";
import { PostgresService } from "./postgres.service";

const databaseUrl = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("profile skill identity in PostgreSQL", () => {
  let client: Client;
  let profiles: ProfileRepository;
  let search: SearchRepository;
  const schema = `profile_skills_test_${process.pid}`;
  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname))
      throw new Error("Skill fixtures require an isolated local database");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE SCHEMA ${schema}; SET search_path TO ${schema},public;
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY, label text, properties jsonb);
      CREATE TABLE graph_relationships(id bigint GENERATED ALWAYS AS IDENTITY,
        source_id bigint, target_id bigint, type text, relationship_key text DEFAULT '',
        properties jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now(),
        UNIQUE(source_id,target_id,type,relationship_key));
      CREATE FUNCTION jsonb_boolean_value(jsonb,text) RETURNS boolean LANGUAGE SQL AS 'SELECT ($1 ->> $2)::boolean';
      CREATE TABLE job_search_documents(job_node_id bigint,online boolean DEFAULT true,
        blocked boolean DEFAULT false,published_timestamp bigint DEFAULT 100,filter_labels jsonb);`);
    const executor = {
      query: async (
        sql: string,
        args: unknown[],
      ): Promise<Record<string, unknown>[]> =>
        (await client.query(sql, args)).rows,
    };
    const postgres = {
      ...executor,
      transaction: async (
        work: (manager: typeof executor) => Promise<unknown>,
      ) => work(executor),
    } as unknown as PostgresService;
    profiles = new ProfileRepository(postgres);
    search = new SearchRepository(postgres);
  });
  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
    }
  });
  beforeEach(async () => {
    await client.query(`BEGIN;
      INSERT INTO graph_nodes VALUES
        (1,'User','{"wallet":"skill-user"}'),
        (10,'Tag','{"id":"devops-old","name":"DevOps","normalizedName":"devops"}'),
        (11,'Tag','{"id":"devops-new","name":"DevOps","normalizedName":"devops"}'),
        (20,'Tag','{"id":"python","name":"Python","normalizedName":"python"}'),
        (30,'Tag','{"id":"c","name":"C","normalizedName":"c"}'),
        (31,'Tag','{"id":"cpp","name":"C++","normalizedName":"c++"}');`);
  });
  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  it("reads existing duplicate names once and preserves canTeach", async () => {
    await client.query(`INSERT INTO graph_relationships(source_id,target_id,type,properties) VALUES
      (1,10,'HAS_SKILL','{"canTeach":false}'),(1,11,'HAS_SKILL','{"canTeach":true}');`);
    expect(await profiles.getSkills("skill-user")).toEqual([
      {
        id: "devops-old",
        name: "DevOps",
        normalizedName: "devops",
        canTeach: true,
      },
    ]);
  });
  it("stores one stable tag when a save repeats IDs or names", async () => {
    const input = [
      { id: "devops-new", normalizedName: "devops", canTeach: true },
      { id: "devops-old", normalizedName: "devops", canTeach: false },
      { id: "devops-new", normalizedName: "devops", canTeach: false },
    ];
    for (let i = 0; i < 2; i++) {
      expect(await profiles.replaceSkills("skill-user", input)).toBe(true);
      expect(
        (
          await client.query(
            "SELECT target_id,properties FROM graph_relationships WHERE type='HAS_SKILL'",
          )
        ).rows,
      ).toEqual([{ target_id: "10", properties: { canTeach: true } }]);
    }
  });
  it("does not collapse distinct punctuation-bearing skills", async () => {
    await profiles.replaceSkills("skill-user", [
      { id: "c", normalizedName: "c", canTeach: false },
      { id: "cpp", normalizedName: "c++", canTeach: false },
    ]);
    expect(
      (await profiles.getSkills("skill-user")).map(skill => skill.name),
    ).toEqual(["C", "C++"]);
  });
  it("returns unique suggestions before pagination, including label case variants", async () => {
    await client.query(`INSERT INTO job_search_documents(job_node_id,filter_labels) VALUES
      (100,'{"tags":{"devops":"DevOps","python":"Python"}}'),
      (101,'{"tags":{"devops":"devops"}}');`);
    const options = { startDate: 0, endDate: 200, limit: 1 };
    expect(await search.getSkillSuggestions({ ...options, offset: 0 })).toEqual(
      [{ id: "devops-old", name: "DevOps", normalizedName: "devops" }],
    );
    expect(await search.getSkillSuggestions({ ...options, offset: 1 })).toEqual(
      [{ id: "python", name: "Python", normalizedName: "python" }],
    );
    expect(
      await search.getSkillSuggestions({
        ...options,
        query: "DevOps",
        offset: 1,
      }),
    ).toEqual([]);
  });
  it("does not add both duplicate tags when repository skills are saved", async () => {
    await client.query(`INSERT INTO graph_nodes VALUES (2,'GithubUser','{}'),(3,'GithubRepository','{"id":"repo"}');
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES (1,2,'HAS_GITHUB_USER'),(2,3,'CONTRIBUTED_TO');
      INSERT INTO graph_relationships(source_id,target_id,type,relationship_key) VALUES (1,10,'HAS_SKILL','legacy-key');`);
    expect(
      await profiles.updateRepoTags("skill-user", "repo", [
        { normalizedName: "devops", canTeach: true },
      ]),
    ).toBe(true);
    expect(
      (await profiles.getSkills("skill-user")).map(skill => skill.id),
    ).toEqual(["devops-old"]);
    expect(
      (
        await client.query(
          "SELECT target_id FROM graph_relationships WHERE type='HAS_SKILL'",
        )
      ).rows,
    ).toEqual([{ target_id: "10" }]);
  });
});
