import { UserRepository } from "./user.repository";
import { ProfileRepository } from "./profile.repository";

describe("consistent login user lookup", () => {
  it("reads status from the same oldest user record that profile writes select", async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ present: true, value: false }]);
    const repository = new UserRepository({ query } as any);
    await expect(repository.getCryptoNative("0xMiXeD")).resolves.toBe(false);
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY id LIMIT 1/);
  });
  it("uses the user wallet index and stable selection for cache checks", async () => {
    const query = jest.fn().mockResolvedValue([{ expiresAt: "123" }]);
    const repository = new ProfileRepository({ query } as any);
    await expect(repository.getCacheLock("0xMiXeD")).resolves.toBe(123);
    expect(query.mock.calls[0][0]).toContain("account.label = 'User'");
    expect(query.mock.calls[0][0]).toContain("ORDER BY account.id LIMIT 1");
  });
  it("reuses an existing wallet after taking the per-wallet creation lock", async () => {
    const properties = { wallet: "0xMixed", name: "Existing" };
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ nodeId: "1", properties }]);
    const transaction = jest.fn(work => work({ query }));
    const repository = new UserRepository({ transaction } as any);
    await expect(
      repository.createUser({ wallet: "0xmixed", name: "Replacement" }),
    ).resolves.toEqual(properties);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[1][0]).toContain(
      "lower(properties ->> 'wallet') = lower($1)",
    );
    expect(query.mock.calls[1][1]).toEqual(["0xmixed", "{}"]);
  });
});
