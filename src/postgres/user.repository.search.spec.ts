import { UserRepository } from "./user.repository";
import type { PostgresService } from "./postgres.service";

describe("UserRepository threat-access search", () => {
  it("searches compact identity fields case-insensitively without loading profiles", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        wallet: "0x0000000000000000000000000000000000000001",
        name: "Alice Example",
        email: "Alice@Example.com",
        github: "AliceDev",
        hasAccess: false,
      },
    ]);
    const repository = new UserRepository({
      query,
    } as unknown as PostgresService);

    const users = await repository.searchThreatAccessUsers(
      "  ALICE@EXAMPLE.COM  ",
      "THREAT_INTEL",
      25,
      false,
    );

    expect(users).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "position($2 in lower(identity.properties::text)) > 0",
      ),
      ["THREAT_INTEL", "alice@example.com", false, 25],
    );
    expect(query.mock.calls[0][0]).not.toContain("workHistory");
  });

  it("can restrict the compact query to users who already have access", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new UserRepository({
      query,
    } as unknown as PostgresService);

    await repository.searchThreatAccessUsers("", "THREAT_INTEL", 100, true);

    expect(query.mock.calls[0][1]).toEqual(["THREAT_INTEL", "", true, 100]);
  });
});
