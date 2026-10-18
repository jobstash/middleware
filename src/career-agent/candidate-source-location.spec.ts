import { createHash } from "node:crypto";
import { Client } from "pg";
import { CANDIDATE_SOURCE_MATCHING_VERSION, CANDIDATE_SOURCE_PROFILE_VERSION, SOURCE_PROFILE_PREFERENCE_COLUMNS, candidateSourceLocationSql, candidateSourceParseReady, candidateSourceExtractionState } from "./candidate-source-location";
import { unknownDocumentProvenance } from "./candidate-document-provenance";

const documentId = "11111111-1111-4111-8111-111111111111";
function document() {
  const source_text = "Amsterdam, Netherlands\nUS/EU citizenship; no sponsorship required.\nPrevious employer: San Francisco.";
  const content_hash = createHash("sha256").update(source_text).digest("hex");
  return { id: documentId, user_node_id: 1, content_hash, source_text, parsed_result: {
    matchingContext: { version: CANDIDATE_SOURCE_MATCHING_VERSION, contentHash: content_hash,
      sourceTextHash: createHash("md5").update(source_text).digest("hex"), mode: "text",
      projectionText: source_text, projectionHash: createHash("md5").update(source_text).digest("hex"), sourceProvenance: null },
    location: { city: "Amsterdam", state: null, country: "Netherlands", countryCode: "NL" },
    sourceGrounding: { currentResidence: "Amsterdam, Netherlands", relocation: null,
      workAuthorization: "US/EU citizenship", requiresSponsorship: "no sponsorship required" },
    preferences: { residenceCountry: "NL", relocation: null, relocationDestinations: [], workAuthorization: "US/EU citizenship", requiresSponsorship: false },
  } };
}

it("invalidates source context when content, extracted text or parser version changes", () => {
  const source = document();
  expect(candidateSourceParseReady(source)).toBe(true);
  expect(candidateSourceParseReady({ ...source, content_hash: "changed" })).toBe(false);
  expect(candidateSourceParseReady({ ...source, source_text: "new residence" })).toBe(false);
  expect(candidateSourceParseReady({ ...source, parsed_result: null })).toBe(false);
  expect(candidateSourceParseReady({ ...source, parsed_result: { ...source.parsed_result, matchingContext: { ...source.parsed_result.matchingContext, version: 0 } } })).toBe(false);
  expect(candidateSourceParseReady({ ...source, extraction_provenance: unknownDocumentProvenance(source.content_hash, source.source_text) })).toBe(false);
  expect(candidateSourceParseReady({ ...source, parsed_result: { ...source.parsed_result,
    matchingContext: { ...source.parsed_result.matchingContext, projectionText: "Forged ordinary text" } } })).toBe(false);
});

it("separates full extraction readiness, device waiting and interrupted legacy attempts", () => {
  const source = { ...document(), parse_status: "ready", parse_error: null };
  expect(candidateSourceExtractionState(source, false)).toEqual({ status: "unparsed", profileReady: false, errorCode: null });
  const full = { ...source, parsed_result: { ...source.parsed_result, matchingOnly: false, isResume: true,
    profileExtractionVersion: CANDIDATE_SOURCE_PROFILE_VERSION,
    profileGrounding: Object.fromEntries(Object.keys(SOURCE_PROFILE_PREFERENCE_COLUMNS).map(field => [field, null])),
    evidence: [], career: { roles: [], educationLevel: null } } };
  expect(candidateSourceExtractionState(full, false)).toEqual({ status: "ready", profileReady: true, errorCode: null });
  expect(candidateSourceExtractionState({ ...full, source_text: "changed" }, false).profileReady).toBe(false);
  expect(candidateSourceExtractionState({ ...full, parsed_result: { ...full.parsed_result, profileExtractionVersion: null } }, false).profileReady).toBe(false);
  expect(candidateSourceExtractionState({ ...full, parse_status: "processing", parsed_result: { ...full.parsed_result, matchingOnly: true } }, true))
    .toEqual({ status: "processing", profileReady: false, errorCode: null });
  expect(candidateSourceExtractionState({ ...source, parse_status: "waiting_for_device" }, true))
    .toEqual({ status: "waiting_for_device", profileReady: false, errorCode: null });
  expect(candidateSourceExtractionState({ ...source, parse_status: "processing" }, false))
    .toEqual({ status: "failed", profileReady: false, errorCode: "parse_interrupted" });
  expect(candidateSourceExtractionState({ ...source, parse_status: "failed", parse_error: "connection_unavailable" }, false))
    .toEqual({ status: "failed", profileReady: false, errorCode: "connection_unavailable" });
});

const url = process.env.MCP_DATABASE_TEST_URL ?? process.env.CAREER_TEST_DATABASE_URL;
(url ? describe : describe.skip)("source location SQL precedence and ownership", () => {
  const db = new Client({ connectionString: url });
  beforeAll(async () => { await db.connect(); await db.query("BEGIN READ ONLY"); });
  afterAll(async () => { await db.query("ROLLBACK"); await db.end(); });
  async function context(source: Record<string, unknown>, preferences: Record<string, unknown> | null = null, owner = 1, explicitFields: string[] = []) {
    const result = await db.query(`WITH graph_nodes AS (SELECT 1::bigint AS id,jsonb_build_object('explicitProfileFields',$5::jsonb) AS properties),
      candidate_documents AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS d(id uuid,user_node_id bigint,content_hash text,source_text text,parsed_result jsonb,extraction_provenance jsonb)),
      user_job_preferences AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS p(user_node_id bigint,
        screening_location_preferences jsonb,residence_country text,work_authorization text,requires_sponsorship boolean,utc_offset_minutes integer))
      SELECT ${candidateSourceLocationSql("$3", "$4")} AS context`,
    [JSON.stringify([source]), JSON.stringify(preferences ? [{ user_node_id: 1, ...preferences }] : []), owner, documentId, JSON.stringify(Object.fromEntries(explicitFields.map(field => [field, true])))]);
    return result.rows[0].context;
  }
  it("uses the owned CV's grounded residence without turning citizenship or historical work into relocation", async () => {
    const value = await context(document());
    expect(value).toMatchObject({ currentLocation: "Amsterdam, Netherlands", residenceCountry: "NL", relocation: null,
      relocationLocations: [], workAuthorization: "US/EU citizenship", requiresSponsorship: false, sourceParseRequired: false });
    expect(value.provenance).toMatchObject({ documentId, currentLocation: "source_document", relocation: "unknown" });
    expect(await context(document(), null, 2)).toBeNull();
  });
  it("honors explicit location and relocation, including an intentional unknown, over source facts", async () => {
    const value = await context(document(), { screening_location_preferences: { currentLocation: "Berlin, Germany", relocation: "not_open", destinations: null },
      work_authorization: "EU work authorization", requires_sponsorship: true });
    expect(value).toMatchObject({ currentLocation: "Berlin, Germany", location: null, residenceCountry: null, relocation: "not_open",
      workAuthorization: "EU work authorization", requiresSponsorship: true, provenance: { currentLocation: "explicit_preferences" } });
    expect(await context(document(), { screening_location_preferences: { currentLocation: null, relocation: null } }))
      .toMatchObject({ currentLocation: null, location: null, residenceCountry: null, relocation: null });
    expect(await context(document(), { residence_country: "DE" }))
      .toMatchObject({ currentLocation: "DE", location: null, residenceCountry: "DE" });
  });
  it("preserves deliberately cleared profile constraints instead of refilling them from the CV", async () => {
    expect(await context(document(), { residence_country: null, work_authorization: null, requires_sponsorship: null }, 1,
      ["residenceCountry", "workAuthorization", "requiresSponsorship"]))
      .toMatchObject({ currentLocation: null, residenceCountry: null, workAuthorization: null, requiresSponsorship: null });
  });
  it("does not reuse stale or unparsed geography and leaves historical-only CVs unknown", async () => {
    const source = document();
    for (const changed of [{ ...source, content_hash: "changed" }, { ...source, source_text: "Changed source" }, { ...source, parsed_result: null }]) {
      expect(await context(changed)).toMatchObject({ sourceParseRequired: true, currentLocation: null, residenceCountry: null, relocation: null, workAuthorization: null });
    }
    expect(await context({ ...source, parsed_result: { ...source.parsed_result, location: null,
      preferences: { ...source.parsed_result.preferences, residenceCountry: null } } }))
      .toMatchObject({ sourceParseRequired: false, currentLocation: null, residenceCountry: null, relocation: null, workAuthorization: "US/EU citizenship" });
  });
  it("keeps explicit bounded relocation destinations separate from residence", async () => {
    expect(await context(document(), { screening_location_preferences: { relocation: "specific_locations", destinations: "Berlin, Germany" } }))
      .toMatchObject({ currentLocation: "Amsterdam, Netherlands", relocation: "specific_locations", relocationLocations: ["Berlin, Germany"], destinations: "Berlin, Germany" });
    expect(await context(document(), { screening_location_preferences: { relocation: "not_open", destinations: "Berlin, Germany" } }))
      .toMatchObject({ relocation: "not_open", relocationLocations: [], destinations: null });
  });
  it("scopes ambiguous legacy values without treating equality as canonical ownership and honors explicit confirmation", async () => {
    const source = document();
    const conflicted = { ...source, parsed_result: { ...source.parsed_result, location: null,
      preferences: { ...source.parsed_result.preferences, residenceCountry: null, workAuthorization: null, requiresSponsorship: null },
      sourceVisibilityConflicts: {
        residenceCountry: { value: "NL", status: "unresolved" },
        workAuthorization: { value: "US/EU citizenship", status: "unresolved" },
        requiresSponsorship: { value: false, status: "unresolved" },
      } } };
    const legacy = { residence_country: "NL", work_authorization: "US/EU citizenship", requires_sponsorship: false };
    expect(await context(conflicted, legacy)).toMatchObject({ currentLocation: null, residenceCountry: null,
      workAuthorization: null, requiresSponsorship: null,
      sourceVisibilityConflicts: { residenceCountry: { status: "unresolved" }, workAuthorization: { status: "unresolved" } } });
    expect(await context(conflicted, legacy, 1, ["residenceCountry", "workAuthorization", "requiresSponsorship"]))
      .toMatchObject({ residenceCountry: "NL", workAuthorization: "US/EU citizenship", requiresSponsorship: false,
        sourceVisibilityConflicts: {} });
    expect(legacy).toEqual({ residence_country: "NL", work_authorization: "US/EU citizenship", requires_sponsorship: false });
  });
});
