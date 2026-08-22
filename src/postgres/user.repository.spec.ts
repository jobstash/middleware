import { PostgresService } from "./postgres.service";
import { UserRepository } from "./user.repository";

describe("UserRepository public Signals query", () => {
  it("uses a positive candidate allowlist and never selects private identity/application data", async () => {
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
      "HAS_EMAIL",
      "HAS_LINKED_ACCOUNT",
      "HAS_LINKED_WALLET",
      "jobCategoryInterests",
      "lastAppliedTimestamp",
      "HAS_RECRUITER_NOTE",
      "recruiter_cases",
      "profile_notices",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(parameters).toEqual([]);
  });

  it("publishes only aggregate interests shared by at least five opted-in users", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new UserRepository({
      query,
    } as unknown as PostgresService);

    await repository.getAvailableUserAggregateInterests();

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("application.type = 'APPLIED_TO'");
    expect(sql).toContain("count(DISTINCT user_id)::int");
    expect(sql).toContain("HAVING count(DISTINCT user_id) >= 5");
    expect(sql).not.toContain("application.properties");
  });
});
