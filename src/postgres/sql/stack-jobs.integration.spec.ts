import { Client } from "pg";
import { originalAdFilterSql } from "./stack-jobs.sql";
const integration = process.env.CAREER_TEST_DATABASE_URL
  ? describe
  : describe.skip;
integration("Original-ad stack keyword matching", () => {
  let client: Client;
  beforeAll(async () => {
    const url = new URL(process.env.CAREER_TEST_DATABASE_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      !url.pathname.endsWith("/career_agent_test")
    )
      throw Error("Dedicated local test database required");
    client = new Client({ connectionString: url.toString() });
    await client.connect();
  });
  afterAll(async () => client.end());
  const query = async (filters: object) =>
    (
      await client.query(
        `WITH graph_nodes(id,label,properties) AS (VALUES
 (1,'Jobpost','{"title":"Backend engineer","content":"Build <b>Rust</b> services for zero knowledge systems"}'::jsonb),
 (2,'Jobpost','{"title":"Backend engineer","content":"Java backend internship"}'::jsonb),
 (3,'StructuredJobpost','{"title":"Rust engineer","content":"Rust Rust"}'::jsonb)),
 graph_relationships(source_id,target_id,type) AS (VALUES(1,101,'HAS_STRUCTURED_JOBPOST'),(2,102,'HAS_STRUCTURED_JOBPOST'),(3,103,'HAS_STRUCTURED_JOBPOST')),
 job_search_documents(job_node_id,online,payload) AS (VALUES (101,true,'{"description":"No desired keywords"}'::jsonb),(102,true,'{"description":"Rust and zero knowledge"}'::jsonb),(103,true,'{"description":"Rust"}'::jsonb))
 SELECT document.job_node_id FROM job_search_documents document ${originalAdFilterSql.replaceAll("$5", "$1")} ORDER BY document.job_node_id`,
        [JSON.stringify(filters)],
      )
    ).rows.map(row => row.job_node_id);
  it("matches original content even when the structured description omits it", async () =>
    expect(
      await query({ all: ["rust"], any: ["zero knowledge", "solidity"] }),
    ).toEqual([101]));
  it("never matches text found only in the structured job or a wrong source node", async () =>
    expect(await query({ all: ["rust"], exclude: ["zero knowledge"] })).toEqual(
      [],
    ));
  it("treats wildcard and SQL-looking input as literal text", async () =>
    expect(await query({ any: ["%", "' OR true --"] })).toEqual([]));
  it("applies exclusion terms to the original advertisement", async () =>
    expect(await query({ exclude: ["internship"] })).toEqual([101]));
});
