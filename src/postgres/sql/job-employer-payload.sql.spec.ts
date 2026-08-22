import {
  jobEmployerPayload,
  jobWorkArrangementPayload,
} from "./job-employer-payload.sql";

describe("job WorkArrangementV1 payload SQL", () => {
  it("projects the strict public option from the authoritative search document", () => {
    const sql = jobWorkArrangementPayload("job");

    expect(sql).toContain("job.work_arrangement ->> 'classification'");
    expect(sql).toContain("'remoteOptions'");
    expect(sql).toContain("'hybridOptions'");
    expect(sql).toContain("'onsiteOptions'");
    expect(sql).not.toContain("'options', COALESCE");
    expect(sql).toContain("'includedCountries'");
    expect(sql).toContain("'excludedRegions'");
    expect(sql).toContain("'requiredUtcBand'");
    expect(sql).toContain("'preferredUtcBand'");
    expect(sql).toContain("'minimumMinutes'");
    expect(sql).toContain("'workAuthorizationRequirements'");
    expect(sql).toContain("'workAuthorizations'");
    expect(sql).toContain("'residencyRequirements'");
    expect(sql).toContain("'sponsorshipStatus'");
    expect(sql).toContain("'officeCity'");
    expect(sql).toContain("'attendanceCadence'");
    expect(sql).toContain("'travelRequirement'");
    expect(sql).toContain("'evidence'");
    expect(sql).toContain("'confidence'");
    expect(sql).not.toContain("remote_or_office");
    expect(sql).not.toContain("structured_job_work_arrangements_v1");
  });

  it("adds WorkArrangementV1 to every employer payload", () => {
    const sql = jobEmployerPayload("job.payload");
    expect(sql).toContain("'workArrangement'");
    expect(sql).toContain("job.work_arrangement");
  });
});
