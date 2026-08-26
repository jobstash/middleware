import { recommendedJobsSql } from "./recommended-jobs.sql";

describe("recommendedJobsSql", () => {
  it("uses activity, profile data, freshness, and hard exclusions", () => {
    expect(recommendedJobsSql).toContain("FROM user_activity_events event");
    expect(recommendedJobsSql).toContain("relationship.type = 'HAS_SKILL'");
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
