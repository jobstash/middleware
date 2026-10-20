import "reflect-metadata";
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { PBACGuard } from "src/auth/pbac.guard";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { SessionObject } from "src/shared/interfaces";
import { SubscriptionService } from "./subscription.service";
import {
  CompanionProfileController,
  CompanionDeviceController,
} from "./companion.controller";
import { DeviceAuthGuard } from "./device-execution.guard";
import { DeviceExecutionService } from "./device-execution.service";
import {
  deviceCanonicalRequest,
  deviceInput,
  MatchingCatalogueArgs,
} from "./device-execution.protocol";
import { matchingCatalogue, matchingJobs } from "./device-matching";

interface DeviceHarness {
  query: jest.Mock<Promise<Record<string, unknown>[]>, [string]>;
  db: PostgresService;
  subscriptions: { refresh: jest.Mock; entitled: jest.Mock };
  service: DeviceExecutionService;
}

jest.mock("./device-matching", () => ({
  matchingCatalogue: jest.fn(),
  matchingJobs: jest.fn(),
}));
const device = { id: "3b7837f3-2e09-4b86-a2c5-51b53b3d0a61", owner: "123" };
const catalogueArgs: MatchingCatalogueArgs = {
  publicationRange: "all",
  since: null,
  until: "2026-10-20T10:15:30.123Z",
};

describe("hosted companion boundary", () => {
  it("registers session and signed guards, never public profile/feed controllers", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CompanionProfileController),
    ).toContain(PBACGuard);
    expect(
      Reflect.getMetadata("permissions", CompanionProfileController),
    ).toHaveLength(1);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CompanionDeviceController),
    ).toContain(DeviceAuthGuard);
  });

  it("registers cancellation under the account guard and forwards only its session identity", async () => {
    const cancel = jest.fn().mockResolvedValue({
      cancelAtPeriodEnd: true,
      paidUntil: "2026-11-15T00:00:00.000Z",
      cancelledAt: "2026-10-15T00:00:00.000Z",
    });
    const controller = new CompanionProfileController(
      {} as DeviceExecutionService,
      { cancel } as unknown as SubscriptionService,
    );
    const body = { requestId: "617773b0-77be-4d96-8f7a-fb63393946b9" };
    expect(Reflect.getMetadata(PATH_METADATA, controller.cancel)).toBe("subscription/cancel");
    expect(Reflect.getMetadata(METHOD_METADATA, controller.cancel)).toBe(1);
    await controller.cancel({ address: "session-wallet" } as SessionObject, body);
    expect(cancel).toHaveBeenCalledWith("session-wallet", body);
  });

  it.each([
    {},
    { authorization: "Bearer browser" },
    { cookie: "session=browser" },
  ])("rejects unsigned public/browser transport %j", async headers => {
    const authenticate = jest.fn();
    // Test doubles implement only the methods exercised at this DI boundary.
    const devices = { authenticate } as unknown as DeviceExecutionService;
    const guard = new DeviceAuthGuard(devices);
    const request = {
      headers,
      method: "POST",
      originalUrl: "/device/platform",
      rawBody: Buffer.from("{}"),
    };
    const context = {
      switchToHttp: (): { getRequest: () => typeof request } => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("verifies exact Ed25519 body bytes and consumes a nonce once", async () => {
    const keys = generateKeyPairSync("ed25519");
    const publicKey = keys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url");
    let used = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith("SELECT *"))
        return [
          {
            id: device.id,
            user_node_id: device.owner,
            public_key: publicKey,
            status: "active",
          },
        ];
      if (sql.startsWith("INSERT")) {
        if (used) return [];
        used = true;
        return [{ nonce: "accepted" }];
      }
      return [];
    });
    // The transaction double supplies only SQL queries, without opening a database.
    const manager = { query } as unknown as EntityManager;
    const db = {
      query,
      transaction: <T>(work: (value: EntityManager) => Promise<T>) =>
        work(manager),
    } as unknown as PostgresService;
    const subscriptions = {} as unknown as SubscriptionService;
    const service = new DeviceExecutionService(db, subscriptions);
    const input = {
      id: device.id,
      time: String(Date.now()),
      nonce: randomUUID(),
      method: "POST",
      path: "/device/platform",
      body: Buffer.from(JSON.stringify({
        operation: "matching_catalogue",
        args: { ...catalogueArgs, offset: Number.MAX_SAFE_INTEGER, countOnly: true },
      })),
      signature: "",
    };
    input.signature = sign(
      null,
      Buffer.from(
        deviceCanonicalRequest(
          input.time,
          input.nonce,
          input.method,
          input.path,
          input.body,
        ),
      ),
      keys.privateKey,
    ).toString("base64url");
    await expect(service.authenticate(input)).resolves.toEqual(device);
    await expect(service.authenticate(input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.authenticate({ ...input, body: Buffer.from("{}") }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    query.mockClear();
    await expect(
      service.authenticate({ ...input, body: Buffer.alloc(16385) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["legacy_sources", "legacy_career", "search_jobs", "inference"])(
    "does not expose %s",
    operation => {
      expect(() => deviceInput("platform", { operation, args: {} })).toThrow();
    },
  );

  it("rejects unknown fields, coercion and more than ten requested originals", () => {
    expect(() =>
      deviceInput("platform", {
        operation: "status",
        args: {},
        owner: "other",
      }),
    ).toThrow();
    expect(() =>
      deviceInput("platform", {
        operation: "matching_jobs",
        args: { ids: [123] },
      }),
    ).toThrow();
    expect(() =>
      deviceInput("platform", {
        operation: "matching_jobs",
        args: { ids: Array.from({ length: 11 }, (_, i) => `node:${i + 1}`) },
      }),
    ).toThrow();
  });

  it.each([
    "today",
    "yesterday",
    "past_3_days",
    "past_week",
    "past_2_weeks",
    "past_month",
    "all",
  ] as const)("accepts exact caller-supplied bounds for %s", publicationRange => {
    const args: MatchingCatalogueArgs = {
      publicationRange,
      since: publicationRange === "all" ? null : "2000-02-29T23:59:59.9Z",
      until: "2026-10-20T10:15:30.123Z",
      offset: Number.MAX_SAFE_INTEGER,
      countOnly: true,
    };
    expect(deviceInput("platform", { operation: "matching_catalogue", args }))
      .toEqual({ operation: "matching_catalogue", args });
  });

  it.each(["", ".1", ".12", ".123"])(
    "preserves UTC timestamp precision %j without normalization",
    fraction => {
      const args = {
        publicationRange: "today",
        since: `2026-10-19T10:15:30${fraction}Z`,
        until: `2026-10-20T10:15:30${fraction}Z`,
      };
      expect(deviceInput("platform", { operation: "matching_catalogue", args }))
        .toEqual({ operation: "matching_catalogue", args });
    },
  );

  it.each([
    "2026-02-29T00:00:00Z",
    "2026-02-30T00:00:00.000Z",
    "2026-04-31T00:00:00.000Z",
    "2026-10-19T24:00:00Z",
    "2026-10-19T23:59:60Z",
    "2026-13-01T00:00:00Z",
    "2026-10-19",
    "2026-10-19T00:00:00+00:00",
    "2026-10-19T00:00:00",
    "2026-10-19t00:00:00z",
    "2026-10-19T00:00:00.1234Z",
    "2026-10-19T00:00:00Z\n",
    "not-a-date",
  ])("rejects malformed or normalized-invalid bounds %j", timestamp => {
    expect(() => deviceInput("platform", {
      operation: "matching_catalogue",
      args: { ...catalogueArgs, until: timestamp },
    })).toThrow(BadRequestException);
    expect(() => deviceInput("platform", {
      operation: "matching_catalogue",
      args: { ...catalogueArgs, publicationRange: "past_month", since: timestamp },
    })).toThrow(BadRequestException);
  });

  it.each([
    { ...catalogueArgs, since: "2000-01-01T00:00:00Z" },
    { ...catalogueArgs, publicationRange: "today" },
    { ...catalogueArgs, publicationRange: "past_week", since: catalogueArgs.until },
    {
      ...catalogueArgs,
      publicationRange: "past_week",
      since: "2026-10-21T00:00:00Z",
    },
    { ...catalogueArgs, publicationRange: "past_year" },
    { ...catalogueArgs, until: null },
    { ...catalogueArgs, since: undefined },
    { ...catalogueArgs, until: undefined },
    { ...catalogueArgs, publicationRange: undefined },
    { ...catalogueArgs, limit: 1000 },
    { ...catalogueArgs, offset: -1 },
    { ...catalogueArgs, offset: 0.5 },
    { ...catalogueArgs, offset: Number.MAX_SAFE_INTEGER + 1 },
    { ...catalogueArgs, offset: Infinity },
    { ...catalogueArgs, offset: NaN },
    { ...catalogueArgs, offset: "10001" },
    { ...catalogueArgs, offset: null },
    { ...catalogueArgs, countOnly: "true" },
    { ...catalogueArgs, countOnly: 1 },
    { ...catalogueArgs, countOnly: null },
    {},
  ])("rejects mismatched windows or obsolete/coerced pagination %j", args => {
    expect(() => deviceInput("platform", {
      operation: "matching_catalogue",
      args,
    })).toThrow(BadRequestException);
  });

  function harness(paid = true): DeviceHarness {
    const query = jest.fn(
      async (sql: string): Promise<Record<string, unknown>[]> =>
        sql.startsWith("SELECT id")
          ? [{ id: device.id }]
          : [{ label: "Account" }],
    );
    const subscriptions = {
      refresh: jest.fn().mockResolvedValue(undefined),
      entitled: jest.fn().mockResolvedValue(paid),
    };
    // Platform only needs these repository/subscription methods.
    const db = { query } as unknown as PostgresService;
    const billing = subscriptions as unknown as SubscriptionService;
    return {
      query,
      db,
      subscriptions,
      service: new DeviceExecutionService(db, billing),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it.each([false, true])(
    "denies unpaid catalogue requests before fetching (countOnly=%s)",
    async countOnly => {
      const { service, subscriptions } = harness(false);
      await expect(service.platform(device, {
        operation: "matching_catalogue",
        args: { ...catalogueArgs, offset: Number.MAX_SAFE_INTEGER, countOnly },
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(matchingCatalogue).not.toHaveBeenCalled();
      expect(subscriptions.refresh).toHaveBeenCalledWith(device.owner);
      expect(subscriptions.entitled).toHaveBeenCalledWith(device.owner);
    },
  );

  it("rejects invalid catalogue input before querying or refreshing payment", async () => {
    const { service, query, subscriptions } = harness();
    await expect(service.platform(device, {
      operation: "matching_catalogue",
      args: { ...catalogueArgs, limit: 1000 },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(subscriptions.refresh).not.toHaveBeenCalled();
    expect(matchingCatalogue).not.toHaveBeenCalled();
  });

  it("rejects a revoked or foreign device before contacting payment or jobs", async () => {
    const { service, query, subscriptions } = harness();
    query.mockResolvedValueOnce([]);
    await expect(service.platform(device, {
      operation: "matching_catalogue",
      args: { ...catalogueArgs, countOnly: true },
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledWith(expect.any(String), [device.id, device.owner]);
    expect(subscriptions.refresh).not.toHaveBeenCalled();
    expect(matchingCatalogue).not.toHaveBeenCalled();
  });

  it("allows an owned paid device and retains the whole original", async () => {
    const { service, subscriptions } = harness();
    const batch = {
      jobs: [{ id: "node:1", ad: "original ".repeat(20000) }],
      remainingIds: [],
      unavailableIds: [],
    };
    (matchingJobs as jest.Mock).mockResolvedValue(batch);
    await expect(
      service.platform(device, {
        operation: "matching_jobs",
        args: { ids: ["node:1"] },
      }),
    ).resolves.toEqual(batch);
    expect(subscriptions.refresh).toHaveBeenCalledTimes(2);
    expect(subscriptions.entitled).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "withholds fetched data when revoked during the read (countOnly=%s)",
    async countOnly => {
      const { service, query } = harness();
      query
        .mockResolvedValueOnce([{ id: device.id }])
        .mockResolvedValueOnce([{ label: "Account" }])
        .mockResolvedValueOnce([]);
      (matchingCatalogue as jest.Mock).mockResolvedValue({
        total: 100000,
        jobs: [],
      });
      await expect(service.platform(device, {
        operation: "matching_catalogue",
        args: { ...catalogueArgs, countOnly },
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(matchingCatalogue).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    "withholds fetched data on payment expiry (countOnly=%s)",
    async countOnly => {
      const { service, subscriptions } = harness();
      (matchingCatalogue as jest.Mock).mockResolvedValue({ total: 100000, jobs: [] });
      subscriptions.entitled
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      await expect(service.platform(device, {
        operation: "matching_catalogue",
        args: { ...catalogueArgs, countOnly },
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(matchingCatalogue).toHaveBeenCalledTimes(1);
      expect(subscriptions.refresh).toHaveBeenCalledTimes(2);
    },
  );

  it.each([false, true])(
    "fails closed when the payment provider fails (afterFetch=%s)",
    async afterFetch => {
      const { service, subscriptions } = harness();
      const failure = new Error("provider unavailable");
      (matchingCatalogue as jest.Mock).mockResolvedValue({ jobs: [] });
      if (afterFetch) subscriptions.refresh.mockResolvedValueOnce(undefined);
      subscriptions.refresh.mockRejectedValueOnce(failure);
      await expect(service.platform(device, {
        operation: "matching_catalogue",
        args: catalogueArgs,
      })).rejects.toBe(failure);
      expect(matchingCatalogue).toHaveBeenCalledTimes(afterFetch ? 1 : 0);
    },
  );

  it("rejects rather than truncates an oversized original response", async () => {
    const { service } = harness();
    (matchingJobs as jest.Mock).mockResolvedValue({
      jobs: [{ ad: "x".repeat(8 * 1024 * 1024) }],
      remainingIds: [],
      unavailableIds: [],
    });
    await expect(
      service.platform(device, {
        operation: "matching_jobs",
        args: { ids: ["node:1"] },
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});
