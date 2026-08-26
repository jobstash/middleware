import { PostgresService } from "./postgres.service";
import { UserRepository } from "./user.repository";

describe("UserRepository Agency Talent Pool query", () => {
  it("uses a positive candidate allowlist with one contact email and no application data", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new UserRepository({
      query,
    } as unknown as PostgresService);

    await repository.getAvailableUsers();

    const [sql, parameters = []] = query.mock.calls[0] as [string, unknown[]?];
    expect(sql).toMatch(
      /COALESCE\(\s*jsonb_boolean_value\(profile_user\.properties, 'available'\), false\s*\)/,
    );
    expect(sql).toContain("jsonb_build_object(");
    expect(sql).not.toContain("profile_user.properties ||");
    for (const forbidden of [
      "alternateEmails",
      "linkedAccounts",
      "HAS_LINKED_WALLET",
      "jobCategoryInterests",
      "lastAppliedTimestamp",
      "HAS_RECRUITER_NOTE",
      "recruiter_cases",
      "profile_notices",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql).toContain("'email'");
    expect(sql).toContain("HAS_EMAIL");
    expect(sql).toContain("HAS_LINKED_ACCOUNT");
    expect(parameters).toEqual([]);
  });

  it("loads an individual report candidate only when the user opted in", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new UserRepository({
      query,
    } as unknown as PostgresService);

    await repository.getAvailableUser("0xCandidate");

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "lower(profile_user.properties ->> 'wallet') = lower($1)",
    );
    expect(sql).toContain(
      "jsonb_boolean_value(profile_user.properties, 'available')",
    );
    expect(sql).toContain("'github'");
    expect(parameters).toEqual(["0xCandidate"]);
  });

  it("ranks and limits top candidates before building their full payloads", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new UserRepository({
      query,
    } as unknown as PostgresService);

    await repository.getTopAvailableUsers(50);

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WITH ranked_users AS MATERIALIZED");
    expect(sql).toContain("LIMIT $1");
    expect(sql.indexOf("LIMIT $1")).toBeLessThan(
      sql.indexOf("SELECT jsonb_build_object("),
    );
    expect(parameters).toEqual([50]);
  });
});
