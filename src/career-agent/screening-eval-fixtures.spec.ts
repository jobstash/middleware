import { screeningEvalFixtures, validateScreeningEvalFixtures } from "../../dev/career/screening-eval-fixtures";

// Prevent malformed or ungrounded fixture context from reaching paid inference.
// These validate fixture inputs, not model quality or prompt wording.
describe("Screening eval production context prerequisites", () => {
  it.each(screeningEvalFixtures)("keeps $id candidate location grounded in its own source", fixture => {
    validateScreeningEvalFixtures([fixture]);
    const context = JSON.parse(fixture.sources.additional_context);
    const location = context.candidate_preferences.candidate_source_location;
    expect(location.currentLocation).toBe("Amsterdam");
    expect(location.relocation).toBeNull();
    expect(fixture.sources.candidate_cv.includes(location.provenance.excerpts.currentResidence)).toBe(true);
    expect(fixture.sources.candidate_cv.includes(location.provenance.excerpts.workAuthorization)).toBe(true);
    expect(fixture.sources.candidate_cv.includes(location.provenance.excerpts.requiresSponsorship)).toBe(true);
    // Unknown company/geographic context cannot smuggle the candidate's past
    // employer or a search category into the target employer's facts.
    expect(context.company).toBeNull();
    expect(context.job_geography).toBeNull();
  });
  it.each(["Candidate confirms Amsterdam residence.", "null", "[]", "{}", '{"candidate_preferences":{}}'])("rejects invalid context before inference: %s", additional_context => {
    const fixture = screeningEvalFixtures[0];
    expect(() => validateScreeningEvalFixtures([{ ...fixture, sources: { ...fixture.sources, additional_context } }])).toThrow();
  });
  it.each(["location", "relocation", "quote", "source-hash", "company-lane", "geography-lane"])("rejects invalid %s grounding before inference", invalid => {
    const fixture = screeningEvalFixtures[0];
    const context = JSON.parse(fixture.sources.additional_context);
    const location = context.candidate_preferences.candidate_source_location;
    if (invalid === "location") location.currentLocation = "Melbourne";
    if (invalid === "relocation") location.relocation = "willing_if_needed";
    if (invalid === "quote") location.provenance.excerpts.workAuthorization = "Authorized to work everywhere";
    if (invalid === "source-hash") location.provenance.sourceTextHash = "a-different-cv";
    if (invalid === "company-lane") context.company = "An invented prestigious employer";
    if (invalid === "geography-lane") context.job_geography = "Assumed fully remote worldwide";
    expect(() => validateScreeningEvalFixtures([{ ...fixture, sources: { ...fixture.sources, additional_context: JSON.stringify(context) } }])).toThrow();
  });
  it("preserves the misleading search label separately from the real vacancy", () => {
    const fixture = screeningEvalFixtures.find(item => item.id === "misleading-category")!;
    const context = JSON.parse(fixture.sources.additional_context);
    expect(context.candidate_preferences.candidate_search_goal).toBe("Backend TypeScript");
    expect(fixture.sources.job_description).toContain("five years of hands-on production C++ and CUDA GPU-kernel development");
  });
});
