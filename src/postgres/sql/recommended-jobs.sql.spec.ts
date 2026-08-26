import { recommendedJobsSql } from "./recommended-jobs.sql";

describe("recommendedJobsSql", () => {
  it("uses activity, profile data, freshness, and hard exclusions", () => {
    expect(recommendedJobsSql).toContain("FROM user_activity_events event");
    expect(recommendedJobsSql).toContain("relationship.type = 'HAS_SKILL'");
    expect(recommendedJobsSql).toContain(
      "account_history.type = 'HAS_WORK_HISTORY'",
    );
    expect(recommendedJobsSql).toContain(
      "history_repository.type = 'WORKED_ON_REPO'",
    );
    expect(recommendedJobsSql).toContain("repository.properties -> 'skills'");
    expect(recommendedJobsSql).toContain("'commitsCount'");
    expect(recommendedJobsSql).toContain("'lastContributedAt'");
    expect(recommendedJobsSql).toContain("'cryptoNative'");
    expect(recommendedJobsSql).toContain("candidate.onboard_into_web3");
    expect(recommendedJobsSql).toContain("owner_affinity");
    expect(recommendedJobsSql).toContain("preference_context");
    expect(recommendedJobsSql).toContain("preferences.job_categories");
    expect(recommendedJobsSql).toContain("preferences.preferred_skills");
    expect(recommendedJobsSql).toContain("preferred_minimum_salary");
    expect(recommendedJobsSql).toContain("preferred_company_size_min");
    expect(recommendedJobsSql).toContain("document.online");
    expect(recommendedJobsSql).toContain("NOT document.blocked");
    expect(recommendedJobsSql).toContain("jsonb_object_keys");
    expect(recommendedJobsSql).toContain("'job_apply', 'job_dismiss'");
    expect(recommendedJobsSql).toContain("blocked.type = 'BLOCKED_ORG_JOBS'");
    expect(recommendedJobsSql).toContain("ranked.owner_rank <= 2");
    expect(recommendedJobsSql).toContain("ranked.score DESC");
  });

  it("weights applications above views and discounts stale activity", () => {
    expect(recommendedJobsSql).toContain("WHEN 'job_apply' THEN 8.0");
    expect(recommendedJobsSql).toContain("WHEN 'job_view' THEN CASE");
    expect(recommendedJobsSql).toContain("event.dwell_ms >= 5000");
    expect(recommendedJobsSql).toContain("exp(");
  });
});
