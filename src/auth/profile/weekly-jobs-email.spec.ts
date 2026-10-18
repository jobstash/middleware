import {
  isRecentWeeklyJob,
  weeklyJobsEmail,
  WeeklyEmailJob,
} from "./weekly-jobs-email";

const now = Date.parse("2026-09-07T10:00:00Z");
const job: WeeklyEmailJob = {
  shortUUID: "abc123",
  title: "Head of Engineering",
  organization: { name: "Example" },
  timestamp: now,
  location: "Europe",
  locationType: "REMOTE",
  seniority: "SENIOR",
  commitment: "FULL_TIME",
};
const message = (jobs = [job]): ReturnType<typeof weeklyJobsEmail> =>
  weeklyJobsEmail({
    from: "jobs@jobstash.xyz",
    to: "preview@example.test",
    frontend: "https://jobstash.xyz",
    candidateFrontend: "https://recruiters.test",
    unsubscribeUrl: "https://jobstash.xyz/email/unsubscribe?token=example",
    jobs,
  });

describe("weekly matches email", () => {
  it("escapes imported job content and still links by the stable public job ID", () => {
    const mail = message([
      {
        ...job,
        title: 'Manager <script>alert("x")</script>',
        organization: { name: 'A&B "Company"' },
      },
    ]);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("A&amp;B &quot;Company&quot;");
    expect(mail.html).toContain("/abc123?utm_source=");
  });
  it("omits missing details rather than inventing a work mode or location", () => {
    const mail = message([
      {
        ...job,
        location: null,
        locationType: null,
        seniority: null,
        commitment: null,
      },
    ]);
    expect(mail.html).not.toContain("Remote");
    expect(mail.html).not.toContain("null");
    expect(mail.html).not.toContain("undefined");
  });
  it.each([
    [now, true],
    [now - 21 * 86400000, true],
    [now - 21 * 86400000 - 1, false],
    [now + 1, false],
    [null, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])(
    "applies the exact 21-day cutoff to timestamp %s",
    (timestamp, expected) => {
      expect(isRecentWeeklyJob({ timestamp }, now)).toBe(expected);
    },
  );
});
