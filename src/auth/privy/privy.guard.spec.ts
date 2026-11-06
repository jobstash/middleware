import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrivyClient } from "@privy-io/node";
import { PrivyGuard } from "./privy.guard";

jest.mock("@privy-io/node", () => ({ PrivyClient: jest.fn() }));

describe("PrivyGuard sequential authentication retries", () => {
  const user = { id: "did:privy:fixture" };
  const verifyAccessToken = jest.fn();
  const getUser = jest.fn();
  let guard: PrivyGuard;

  const context = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    verifyAccessToken.mockResolvedValue({ user_id: user.id });
    getUser.mockResolvedValue(user);
    jest.mocked(PrivyClient).mockImplementation(
      () =>
        ({
          utils: () => ({ auth: () => ({ verifyAccessToken }) }),
          users: () => ({ _get: getUser }),
        }) as unknown as PrivyClient,
    );
    guard = new PrivyGuard(
      new ConfigService({
        PRIVY_APP_ID: "fixture-app",
        PRIVY_APP_SECRET: "fixture-secret",
      }),
    );
  });

  afterEach(() => jest.useRealTimers());

  it("does not contact the provider without a bearer token", async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("never fetches user data when token verification fails", async () => {
    verifyAccessToken.mockRejectedValue(new Error("invalid fixture token"));
    const denied = expect(
      guard.canActivate(context("Bearer fixture-token")),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await jest.runAllTimersAsync();
    await denied;
    expect(verifyAccessToken).toHaveBeenCalledTimes(4);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("awaits a failed user lookup before retrying and limits attempts", async () => {
    getUser.mockRejectedValue(new Error("fixture lookup unavailable"));
    const denied = expect(
      guard.canActivate(context("Bearer fixture-token")),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await jest.runAllTimersAsync();
    await denied;
    expect(verifyAccessToken).toHaveBeenCalledTimes(4);
    expect(getUser).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 3; index += 1) {
      expect(getUser.mock.invocationCallOrder[index]).toBeLessThan(
        verifyAccessToken.mock.invocationCallOrder[index + 1],
      );
    }
  });

  it("stops retrying after a successful verified user lookup", async () => {
    getUser.mockRejectedValueOnce(new Error("transient fixture failure"));
    const allowed = guard.canActivate(context("Bearer fixture-token"));
    await jest.runAllTimersAsync();
    await expect(allowed).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledTimes(2);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getUser).toHaveBeenLastCalledWith(user.id);
  });
});
