import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service";
import { PBACGuard } from "./pbac.guard";

describe("PBACGuard controller-level contracts", () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({}),
      getResponse: () => ({}),
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;

  it("reads method then controller permissions and fails unauthenticated", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["USER"]),
    } as unknown as Reflector;
    const auth = {
      getSession: jest.fn().mockResolvedValue({ permissions: [] }),
    } as unknown as AuthService;
    const guard = new PBACGuard(reflector, auth);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      "permissions",
      [expect.any(Function), expect.any(Function)],
    );
  });
});
