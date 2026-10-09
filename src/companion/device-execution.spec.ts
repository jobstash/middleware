import "reflect-metadata";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { PBACGuard } from "src/auth/pbac.guard";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
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
} from "./device-execution.protocol";
import { matchingCatalogue, matchingJobs } from "./device-matching";

interface DeviceHarness {
  query: jest.Mock<Promise<Record<string, unknown>[]>, [string]>;
  subscriptions: { refresh: jest.Mock; entitled: jest.Mock };
  service: DeviceExecutionService;
}

jest.mock("./device-matching", () => ({
  matchingCatalogue: jest.fn(),
  matchingJobs: jest.fn(),
}));
const device = { id: "3b7837f3-2e09-4b86-a2c5-51b53b3d0a61", owner: "123" };

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
      body: Buffer.from('{"operation":"status","args":{}}'),
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
    await expect(service.authenticate(input)).rejects.toThrow(
      "already received",
    );
    await expect(
      service.authenticate({ ...input, body: Buffer.from("{}") }),
    ).rejects.toThrow("signature");
    query.mockClear();
    await expect(
      service.authenticate({ ...input, body: Buffer.alloc(16385) }),
    ).rejects.toThrow("Invalid device request");
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
      subscriptions,
      service: new DeviceExecutionService(db, billing),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("denies paired but unpaid raw reads before querying jobs", async () => {
    const { service } = harness(false);
    await expect(
      service.platform(device, { operation: "matching_catalogue", args: {} }),
    ).rejects.toThrow("active paid membership");
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

  it("withholds fetched data when revoked during the read", async () => {
    const { service, query } = harness();
    query
      .mockResolvedValueOnce([{ id: device.id }])
      .mockResolvedValueOnce([{ label: "Account" }])
      .mockResolvedValueOnce([]);
    (matchingCatalogue as jest.Mock).mockResolvedValue({
      jobs: [{ id: "node:1" }],
    });
    await expect(
      service.platform(device, { operation: "matching_catalogue", args: {} }),
    ).rejects.toThrow("no longer paired");
  });

  it("withholds fetched data on payment expiry or provider failure", async () => {
    const { service, subscriptions } = harness();
    (matchingCatalogue as jest.Mock).mockResolvedValue({ jobs: [] });
    subscriptions.entitled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(
      service.platform(device, { operation: "matching_catalogue", args: {} }),
    ).rejects.toThrow("active paid membership");
    subscriptions.refresh.mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    await expect(
      service.platform(device, { operation: "matching_catalogue", args: {} }),
    ).rejects.toThrow("provider unavailable");
  });

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
    ).rejects.toThrow("response exceeds limit");
  });
});
