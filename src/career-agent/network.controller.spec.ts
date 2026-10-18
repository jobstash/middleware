import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { NetworkController } from "./network.controller";
import {
  NetworkService,
  assemblePaths,
  NetworkEdge,
  clickhouseParameter,
} from "./network.service";

function setup() {
  const network = {
    root: jest
      .fn()
      .mockResolvedValue({ owner: "alice", root: "verified-alice" }),
    paths: jest.fn().mockResolvedValue({ available: false }),
  };
  const career = {
    requireAdvanced: jest.fn().mockResolvedValue(undefined),
    stacks: jest.fn().mockResolvedValue({
      stacks: [{ id: "owned", intent: "network", revision: 0 }],
    }),
  };
  const profile = {
    getRecommendedJobs: jest.fn().mockResolvedValue({
      jobs: Array.from({ length: 25 }, (_, i) => ({
        job: { organization: { orgId: `org-${String(i).padStart(2, "0")}` } },
      })),
    }),
  };
  const controller = new NetworkController(
    network as never,
    career as never,
    profile as never,
  );
  const session = { address: "alice" } as never;
  return { controller, network, career, profile, session };
}

describe("Network coverage", () => {
  it("leaves company and fund context ungated while rejecting unpaid contacts", async () => {
    const career = {
      requireAdvanced: jest.fn().mockRejectedValue(new ForbiddenException()),
      owner: jest.fn().mockResolvedValue("alice"),
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ suppressed: false }])
        .mockResolvedValueOnce([
          { payload: { name: "Company" }, updated_at: new Date() },
        ])
        .mockResolvedValueOnce([{ retainedStaff: 0, asOf: null }])
        .mockResolvedValueOnce([
          { id: "fund", name: "Public fund", portfolio: [] },
        ])
        .mockResolvedValueOnce([]),
    };
    const network = new NetworkService(
      db as never,
      career as never,
      {} as never,
      {} as never,
    );
    expect(await network.company("org")).toMatchObject({
      funds: [{ name: "Public fund" }],
    });
    expect(career.requireAdvanced).not.toHaveBeenCalled();
    await expect(network.people("alice", "org")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("covers all 25 eligible employers in bounded batches and derives targets server-side", async () => {
    const { controller, network, profile, session } = setup();
    let cursor: string | undefined;
    let result;
    do {
      result = await controller.scan(session, { stackId: "owned", cursor });
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(result).toMatchObject({
      checked: 25,
      total: 25,
      unavailable: false,
    });
    expect(network.paths).toHaveBeenCalledTimes(25);
    expect(new Set(network.paths.mock.calls.map(call => call[1])).size).toBe(
      25,
    );
    expect(profile.getRecommendedJobs.mock.calls[0][5].intent).toBe("best");
    await expect(
      controller.scan(session, {
        stackId: "owned",
        targets: ["forged"],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("rejects foreign stacks and unpaid access before target discovery", async () => {
    const { controller, career, profile, session } = setup();
    await expect(
      controller.scan(session, { stackId: "foreign" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(profile.getRecommendedJobs).not.toHaveBeenCalled();
    career.requireAdvanced.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.scan(session, { stackId: "owned" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(profile.getRecommendedJobs).not.toHaveBeenCalled();
  });
  it("restarts coverage after verified-root changes and preserves unknown failures", async () => {
    const { controller, network, session } = setup();
    const first = await controller.scan(session, { stackId: "owned" });
    network.root.mockResolvedValue({ owner: "alice", root: "new-root" });
    network.paths.mockRejectedValue(new Error("timeout"));
    const second = await controller.scan(session, {
      stackId: "owned",
      cursor: first.nextCursor!,
    });
    expect(second).toMatchObject({ checked: 2, total: 25, unavailable: true });
    expect(second.nextCursor).not.toBe(first.nextCursor);
  });
  it("discloses result truncation and removes suppressed people", () => {
    const edge = (i: number): NetworkEdge => ({
      user_a: "alice",
      user_b: `target-${i}`,
      shared_org: "org",
      overlap_start: "2025-01-01",
      overlap_end: "2026-01-01",
      common_repos: [],
      strength_score: 1,
    });
    const coverage = { truncated: false };
    const paths = assemblePaths(
      "alice",
      new Set(Array.from({ length: 50 }, (_, i) => `target-${i}`)),
      Array.from({ length: 50 }, (_, i) => edge(i)),
      [],
      [],
      new Set(["target-0"]),
      coverage,
    );
    expect(paths).toHaveLength(30);
    expect(coverage.truncated).toBe(true);
    expect(paths.every(path => !path.people.includes("target-0"))).toBe(true);
  });
});

it("encodes ClickHouse string arrays as typed literals with escaped values", () => {
  expect(clickhouseParameter(["org", "o'brien", "a\\b"])).toBe(
    "['org','o\\'brien','a\\\\b']",
  );
  expect(clickhouseParameter([])).toBe("[]");
  expect(clickhouseParameter("root")).toBe("root");
});

it("finds a former contributor through indexed history and a reverse edge, while timeouts remain uncached unknowns", async () => {
  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("AS privy")) return [{ privy: "fixture" }];
      if (sql.includes("AS suppressed")) return [{ suppressed: false }];
      if (sql.includes("github.properties->>'login'"))
        return [{ login: "target-org" }];
      return [];
    }),
  };
  const service = new NetworkService(
    db as never,
    { owner: async () => "owner" } as never,
    {} as never,
    {
      getUserById: async () => ({
        linkedAccounts: [
          {
            type: "github_oauth",
            subject: "verified",
            verifiedAt: new Date(),
            username: "Former",
          },
        ],
      }),
    } as never,
  );
  const query = jest
    .spyOn(
      service as unknown as {
        query: (sql: string, params: unknown) => Promise<unknown[]>;
      },
      "query",
    )
    .mockImplementation(async sql => {
      if (sql.includes("current_staff")) return [{ user_login: "peer" }];
      if (sql.includes("work_history")) return [{ organization: "old-org" }];
      if (sql.includes("employees")) return [{ user_login: "peer" }];
      if (sql.includes("co_worker_edges"))
        return [
          {
            user_a: "peer",
            user_b: "Former",
            shared_org: "old-org",
            overlap_start: "2023-01-01",
            overlap_end: "2024-01-01",
            common_repos: ["old-org/repo"],
            strength_score: 1,
          },
        ];
      return [];
    });
  const load = (
    service as unknown as {
      loadPaths: (
        wallet: string,
        org: string,
        contacts: boolean,
      ) => Promise<Record<string, unknown>>;
    }
  ).loadPaths.bind(service);
  expect(await load("fixture", "org", false)).toMatchObject({
    verified: true,
    available: true,
    truncated: false,
  });
  expect(
    query.mock.calls.some(([sql]) => sql.includes("user_b={root:String}")),
  ).toBe(true);
  expect(
    query.mock.calls.some(([sql]) => sql.includes("three_hop_paths")),
  ).toBe(false);
  db.query.mockClear();
  query.mockRejectedValue(new Error("warehouse timeout"));
  expect(await load("fixture", "other-org", false)).toMatchObject({
    available: null,
    unavailable: true,
  });
  expect(
    db.query.mock.calls.some(([sql]) =>
      sql.startsWith("INSERT INTO candidate_network_cache"),
    ),
  ).toBe(false);
});
