import { shortlistSignals } from "./screening-shortlist";

const taxonomy = ["BACKEND", "ENGINEERING", "ENGINEERING_MANAGEMENT", "SALES", "DESIGN", "FRONTEND"];
const source = { roleCategory: "Engineering Manager", preferences: { jobCategories: ["ENGINEERING_MANAGEMENT"], rolePriorities: ["Engineering Manager"] } };

describe("candidate shortlist signals", () => {
  it("keeps explicit direction authoritative over CV and preference history", () => {
    expect(shortlistSignals({ career: { directions: ["DESIGN"] }, job_categories: ["SALES"] }, source, taxonomy, "backend roles"))
      .toEqual({ categories: ["DESIGN"], roles: [], basis: "selected_directions" });
    expect(shortlistSignals({ job_categories: ["Sales"] }, source, taxonomy))
      .toEqual({ categories: ["SALES"], roles: [], basis: "preferred_categories" });
  });

  it("uses an explicit goal ahead of derived source roles and does not broaden missing directions", () => {
    expect(shortlistSignals({}, source, taxonomy, "Find backend roles").categories).toEqual(["BACKEND"]);
    expect(shortlistSignals({ career: { directions: ["Unavailable category"] } }, source, taxonomy).categories).toEqual([]);
    expect(shortlistSignals({}, null, taxonomy)).toEqual({ categories: [], roles: [], basis: "selected_cv_parse" });
  });

  it("uses extracted current-role categories without adding incidental or generic professions", () => {
    expect(shortlistSignals({}, source, taxonomy)).toEqual({ categories: ["ENGINEERING_MANAGEMENT"], roles: ["Engineering Manager"], basis: "selected_cv_parse" });
    expect(shortlistSignals({}, { roleCategory: "Senior Frontend Developer" }, taxonomy).categories).toEqual(["FRONTEND"]);
  });

});
