import { randomUUID } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { installCandidateGeographyFixture, saveCandidateGeographyFixture } from "./candidate-geographic-eligibility.fixture";

const url = process.env.CAREER_TEST_DATABASE_URL ?? process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Canonical candidate geographic eligibility", () => {
  let db: PostgresService;
  const schema = `candidate_geo_${randomUUID().replace(/-/g, "")}`;
  const amsterdam = { currentLocation: "Amsterdam, Netherlands", relocation: null, workAuthorization: "US and EU citizenship" };

  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) ||
      !["/career_agent_test", "/jobstash_hosted_career_test", "/jobstash_mcp_test", "/candidate_matching_test"].includes(target.pathname))
      throw new Error("A dedicated local test database is required");
    db = new PostgresService({ url: url!, applicationName: "candidate-geography-tests", maxConnections: 2, statementTimeoutMs: 10000 });
    const source = db.getDataSource();
    source.setOptions({ extra: { ...source.options.extra, options: `-c jit=off -c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE graph_nodes(id bigserial PRIMARY KEY,label text);
      CREATE TABLE graph_relationships(source_id bigint,target_id bigint,type text);
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY,payload jsonb DEFAULT '{}');`);
    await installCandidateGeographyFixture(db);
  });
  afterAll(async () => {
    if (db) { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.onModuleDestroy(); }
  });
  beforeEach(async () => {
    await db.query(`TRUNCATE graph_nodes,graph_relationships,job_search_documents,job_work_location_options,job_availability_extractions RESTART IDENTITY`);
  });

  async function job(option: Record<string, unknown> = {}) {
    const [structured] = await db.query<{ id: string }>(`INSERT INTO graph_nodes(label) VALUES('StructuredJobpost') RETURNING id::text`);
    const [raw] = await db.query<{ id: string }>(`INSERT INTO graph_nodes(label) VALUES('Jobpost') RETURNING id::text`);
    await db.query(`INSERT INTO graph_relationships VALUES($1,$2,'HAS_STRUCTURED_JOBPOST')`, [raw.id, structured.id]);
    await db.query(`INSERT INTO job_search_documents(job_node_id) VALUES($1)`, [structured.id]);
    await saveCandidateGeographyFixture(db, structured.id, raw.id);
    if (Object.keys(option).length) {
      const entries = Object.entries(option);
      await db.query(`UPDATE job_work_location_options SET ${entries.map(([key], index) => `${key}=$${index + 2}`).join(",")} WHERE raw_job_node_id=$1`, [raw.id, ...entries.map(([, value]) => value)]);
    }
    if (option.mode === "onsite" || option.mode === "hybrid")
      await db.query(`UPDATE job_search_documents SET work_arrangement=jsonb_build_object('classification',$2::text,'fullyRemote',false) WHERE job_node_id=$1`, [structured.id, `verified_${option.mode}`]);
    return { id: structured.id, raw: raw.id };
  }
  async function status(id: string, candidate: Record<string, unknown> = amsterdam) {
    const [row] = await db.query<{ status: string }>(`SELECT job_candidate_geo_eligibility($1,candidate_geo_context($2::jsonb)) AS status`, [id, JSON.stringify(candidate)]);
    return row.status;
  }

  it("uses current residence, never citizenship, and requires a local workplace", async () => {
    const sf = await job({ mode: "onsite", countries: ["US"], scope: "country_list", office_city: "San Francisco" });
    const hybrid = await job({ mode: "hybrid", countries: ["US"], scope: "country_list", office_city: "San Francisco" });
    const local = await job({ mode: "onsite", countries: ["NL"], scope: "country_list", office_city: "Amsterdam" });
    const otherCity = await job({ mode: "hybrid", countries: ["NL"], scope: "country_list", office_city: "Rotterdam" });
    expect(await status(sf.id)).toBe("ineligible");
    expect(await status(hybrid.id, { ...amsterdam, relocation: "not_open" })).toBe("ineligible");
    expect(await status(local.id)).toBe("eligible");
    expect(await status(otherCity.id)).toBe("ineligible");
    expect(await status(local.id, { residenceCountry: "NL" })).toBe("unknown");
  });

  it("retains real global and region-compatible remote options independently of headquarters", async () => {
    const global = await job();
    await db.query(`UPDATE job_search_documents SET payload='{"location":"San Francisco","organization":{"location":"San Francisco"}}' WHERE job_node_id=$1`, [global.id]);
    const emea = await job({ scope: "region", regions: ["EMEA"] });
    const us = await job({ scope: "country_list", countries: ["US"], residency_requirements: ["US"] });
    const excluded = await job({ excluded_countries: ["NL"] });
    expect(await status(global.id)).toBe("eligible");
    expect(await status(emea.id)).toBe("eligible");
    expect(await status(us.id)).toBe("ineligible");
    expect(await status(excluded.id)).toBe("ineligible");
    expect(await status(global.id, { workAuthorization: "US citizenship" })).toBe("eligible");
    expect(await status(us.id, { workAuthorization: "US citizenship" })).toBe("unknown");
  });

  it("expands only to explicit relocation destinations or an explicit worldwide opt-in", async () => {
    const sf = await job({ mode: "onsite", scope: "country_list", countries: ["US"], office_city: "San Francisco" });
    expect(await status(sf.id, { ...amsterdam, relocationLocations: ["US"] })).toBe("ineligible");
    expect(await status(sf.id, { ...amsterdam, relocation: "specific_locations", relocationLocations: ["Berlin, Germany"] })).toBe("ineligible");
    expect(await status(sf.id, { ...amsterdam, relocation: "specific_locations", relocationLocations: ["SF, United States"] })).toBe("eligible");
    expect(await status(sf.id, { ...amsterdam, relocation: "specific_locations", relocationLocations: ["United States"] })).toBe("eligible");
    expect(await status(sf.id, { relocation: "open_anywhere" })).toBe("eligible");
  });

  it("does not invent worldwide permission from incomplete or unqualified extraction", async () => {
    const legacy = await job({ scope: "unstated" });
    const inherited = await job({ arrangement_confidence: "inherited" });
    const residency = await job({ residency_requirements: ["Must be resident in an unspecified licensed jurisdiction"] });
    const timezone = await job({ required_minimum_utc_offset_minutes: -480, required_maximum_utc_offset_minutes: -300 });
    const unqualified = await job();
    await db.query(`UPDATE job_search_documents SET work_arrangement='{"classification":"remote_unqualified","fullyRemote":true}' WHERE job_node_id=$1`, [unqualified.id]);
    expect(await status(legacy.id)).toBe("unknown");
    expect(await status(inherited.id)).toBe("unknown");
    expect(await status(residency.id)).toBe("unknown");
    expect(await status(timezone.id)).toBe("ineligible");
    expect(await status(timezone.id, {})).toBe("unknown");
    expect(await status(unqualified.id)).toBe("unknown");
  });

  it("honors hard seasonal timezone bands without turning a preferred band into a restriction", async () => {
    const hard = await job({ required_minimum_utc_offset_minutes: 60, required_maximum_utc_offset_minutes: 60 });
    const compatible = await job({ required_minimum_utc_offset_minutes: 60, required_maximum_utc_offset_minutes: 120 });
    const preferred = await job({ minimum_utc_offset_minutes: -480, maximum_utc_offset_minutes: -300, timezone_preference_strength: "preferred" });
    expect(await status(hard.id)).toBe("ineligible");
    expect(await status(compatible.id)).toBe("eligible");
    expect(await status(preferred.id)).toBe("eligible");
  });

  it("uses only the latest committed extraction and preserves independent workplace alternatives", async () => {
    const target = await job({ mode: "onsite", scope: "country_list", countries: ["US"], office_city: "San Francisco" });
    await db.query(`INSERT INTO job_availability_extractions VALUES($1,$1,'new',now()+interval '1 second')`, [target.raw]);
    await db.query(`INSERT INTO job_work_location_options(raw_job_node_id,jobsite_node_id,extractor_version) VALUES($1,$1,'new')`, [target.raw]);
    await db.query(`UPDATE job_search_documents SET work_arrangement='{"classification":"verified_remote","fullyRemote":true}' WHERE job_node_id=$1`, [target.id]);
    expect(await status(target.id)).toBe("eligible");
    await db.query(`UPDATE job_work_location_options SET scope='country_list',countries=ARRAY['US'] WHERE extractor_version='new'`);
    expect(await status(target.id)).toBe("ineligible");
    await db.query(`INSERT INTO job_work_location_options(raw_job_node_id,jobsite_node_id,extractor_version,option_key,mode,scope,countries,office_city)
      VALUES($1,$1,'new','local','onsite','country_list',ARRAY['NL'],'Amsterdam')`, [target.raw]);
    expect(await status(target.id)).toBe("eligible");
  });
});
