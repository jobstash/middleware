import { addCareerEvidence, mergeCareer } from "./merge-career";
const role = {
  title: "Engineer",
  company: "Acme",
  description: "Built the payments service",
  startDate: "2020-01-01",
  endDate: null,
  current: true,
  seniority: null,
};
describe("career upload enrichment", () => {
  it("deduplicates roles after PostgreSQL jsonb reorders their keys", () => {
    const fromDatabase = Object.fromEntries(
      Object.entries(role).reverse(),
    ) as typeof role;
    expect(
      mergeCareer(
        { roles: [fromDatabase], educationLevel: null },
        { roles: [role], educationLevel: null },
      ).roles,
    ).toHaveLength(1);
  });
  it("preserves older experience and education on sparse subsequent uploads", () => {
    expect(
      mergeCareer(
        { roles: [role], educationLevel: "master" },
        { roles: [], educationLevel: null },
      ),
    ).toEqual({ roles: [role], educationLevel: "master" });
  });
  it("reuses exact claims and retains conflicting dates with attribution", () => {
    const merged = mergeCareer(
      { roles: [role], educationLevel: null },
      {
        roles: [role, { ...role, startDate: "2021-01-01" }],
        educationLevel: null,
      },
    );
    expect(merged.roles).toHaveLength(2);
    const evidence = addCareerEvidence([], merged, "existing_profile");
    expect(evidence).toHaveLength(2);
    expect(evidence[0].source).toEqual({
      kind: "existing_profile",
      excerpt: null,
    });
    expect(evidence[0].conflicts).toEqual([evidence[1].id]);
    expect(addCareerEvidence(evidence, merged, "candidate")).toEqual(evidence);
  });
});
