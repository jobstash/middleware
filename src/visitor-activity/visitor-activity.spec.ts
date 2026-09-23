import { createHmac } from "node:crypto";
import { ExecutionContext, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import {
  VisitorActivityController,
  VisitorIngestGuard,
} from "./visitor-activity.controller";
import { VisitorQuery } from "./visitor-activity.dto";

describe("visitor reporting access", () => {
  it.each(["list", "detail"] as const)(
    "restricts %s to superadmins",
    async method => {
      const getSession = jest.fn();
      const guard = new PBACGuard(new Reflector(), { getSession } as never);
      const context = {
        switchToHttp: () => ({
          getRequest: (): Record<string, unknown> => ({}),
          getResponse: (): Record<string, unknown> => ({}),
        }),
        getHandler: () => VisitorActivityController.prototype[method],
        getClass: () => VisitorActivityController,
      } as unknown as ExecutionContext;
      for (const session of [
        null,
        {
          address: "member",
          permissions: [
            CheckWalletPermissions.USER,
            CheckWalletPermissions.ORG_MEMBER,
          ],
        },
      ]) {
        getSession.mockResolvedValue(session);
        await expect(guard.canActivate(context)).rejects.toThrow("Forbidden");
      }
      getSession.mockResolvedValue({
        address: "admin",
        permissions: [CheckWalletPermissions.SUPER_ADMIN],
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
  it("rejects unsigned, stale and altered collection requests", () => {
    const secret = "test-only-secret-with-more-than-thirty-two-characters";
    process.env.VISITOR_INGEST_SECRET = secret;
    const rawBody = Buffer.from('{"kind":"request"}');
    const time = String(Date.now());
    const signature = createHmac("sha256", secret)
      .update(time + "..")
      .update(rawBody)
      .digest("hex");
    const headers: Record<string, string> = {
      "x-visitor-time": time,
      "x-visitor-signature": signature,
    };
    const request = {
      rawBody,
      header: (name: string): string => headers[name],
    };
    const context = {
      switchToHttp: () => ({ getRequest: (): typeof request => request }),
    } as unknown as ExecutionContext;
    const guard = new VisitorIngestGuard();
    expect(guard.canActivate(context)).toBe(true);
    headers.authorization = "Bearer changed";
    expect(() => guard.canActivate(context)).toThrow();
    delete headers.authorization;
    headers["x-visitor-time"] = String(Date.now() - 120000);
    expect(() => guard.canActivate(context)).toThrow();
    headers["x-visitor-time"] = time;
    request.rawBody = Buffer.from("{}");
    expect(() => guard.canActivate(context)).toThrow();
    delete headers["x-visitor-signature"];
    expect(() => guard.canActivate(context)).toThrow();
    delete process.env.VISITOR_INGEST_SECRET;
  });
  it("bounds queries and rejects injected sorting", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const meta = { type: "query" as const, metatype: VisitorQuery };
    await expect(
      pipe.transform({ sort: "lastSeen desc; DROP TABLE visitors" }, meta),
    ).rejects.toThrow();
    await expect(pipe.transform({ days: -1 }, meta)).rejects.toThrow();
    await expect(pipe.transform({ days: 0 }, meta)).resolves.toMatchObject({
      days: 0,
    });
    await expect(pipe.transform({ limit: 10000 }, meta)).rejects.toThrow();
    await expect(
      pipe.transform({ days: "7", sort: "requests" }, meta),
    ).resolves.toMatchObject({ days: 7, sort: "requests" });
  });
});
