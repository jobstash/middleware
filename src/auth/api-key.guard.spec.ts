import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiKeyGuard } from "./api-key.guard";

describe("API key guard promise contract", () => {
  const guard = new ApiKeyGuard(
    new ConfigService({ VCDATA_API_KEY: "secret" }),
  );
  it.each(["Bearer secret", "secret"])(
    "accepts the existing authorization grammar: %s",
    async authorization => {
      const context = {
        switchToHttp: () => ({
          getRequest: (): { headers: { authorization: string } } => ({
            headers: { authorization },
          }),
        }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
  it.each([undefined, "Bearer other"])(
    "rejects an unauthorized value: %s",
    async authorization => {
      const context = {
        switchToHttp: () => ({
          getRequest: (): {
            headers: { authorization: string | undefined };
          } => ({
            headers: { authorization },
          }),
        }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );
  it("retains rejected-promise semantics for context failures", async () => {
    const error = new Error("request unavailable");
    const context = {
      switchToHttp: () => {
        throw error;
      },
    } as unknown as ExecutionContext;
    const result = guard.canActivate(context);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toBe(error);
  });
});
