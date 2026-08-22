import { PostgresService } from "src/postgres/postgres.service";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";

const transactionalPostgres = (query: jest.Mock) =>
  ({
    transaction: jest.fn(async callback => callback({ query })),
  }) as unknown as PostgresService;

describe("AccessWorkspacesRepository", () => {
  it("creates one owner membership and returns the unlimited-seat receipt", async () => {
    const value = {
      id: "workspace",
      unlimitedSeats: true,
      entitlementEnabled: false,
      monthlyPriceCents: 29900,
      stripeQuantity: 1,
      members: [{ userId: "owner", role: "owner" }],
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ nodeId: "7" }])
      .mockResolvedValueOnce([{ id: "workspace" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value }]);
    const repository = new AccessWorkspacesRepository(
      transactionalPostgres(query),
    );

    await expect(
      repository.create({
        ownerUserId: "owner",
        primaryProfileId: "profile",
        normalizedDomain: "example.com",
      }),
    ).resolves.toEqual(value);
    expect(query.mock.calls[1][0]).toContain("INSERT INTO access_workspaces");
    expect(query.mock.calls[1][1]).toEqual(["7", "owner", "example.com"]);
    expect(query.mock.calls[2][0]).toContain("'owner'");
    expect(query.mock.calls[3][0]).toContain("'unlimitedSeats', true");
    expect(query.mock.calls[3][0]).toContain(
      "'stripeQuantity', workspace.stripe_quantity",
    );
    expect(query.mock.calls[3][0]).not.toContain(
      "normalized_registrable_domain = $2",
    );
  });

  it.each(["owner", "admin"] as const)(
    "allows %s to manage non-owner members",
    async role => {
      const query = jest.fn().mockResolvedValue([{ user_id: "next" }]);
      const repository = new AccessWorkspacesRepository(
        transactionalPostgres(query),
      );
      jest.spyOn(repository, "authorize").mockResolvedValue({
        workspaceId: "workspace",
        role,
        entitled: true,
      });

      await expect(
        repository.putMember({
          workspaceId: "workspace",
          actorUserId: role,
          userId: "next",
          role: "analyst",
        }),
      ).resolves.toBe(true);
      expect(query.mock.calls[0][0]).toContain(
        "WHERE access_workspace_members.role <> 'owner'",
      );
    },
  );

  it.each(["analyst", "viewer"] as const)(
    "denies %s member administration without issuing a mutation",
    async role => {
      const query = jest.fn();
      const repository = new AccessWorkspacesRepository(
        transactionalPostgres(query),
      );
      jest.spyOn(repository, "authorize").mockResolvedValue({
        workspaceId: "workspace",
        role,
        entitled: true,
      });

      await expect(
        repository.putMember({
          workspaceId: "workspace",
          actorUserId: role,
          userId: "next",
          role: "viewer",
        }),
      ).resolves.toBe(false);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("fails reveal closed for viewers before loading a Profile", async () => {
    const query = jest.fn();
    const repository = new AccessWorkspacesRepository(
      transactionalPostgres(query),
    );
    jest.spyOn(repository, "authorize").mockResolvedValue({
      workspaceId: "workspace",
      role: "viewer",
      entitled: true,
    });

    await expect(
      repository.inspectProfile({
        workspaceId: "workspace",
        actorUserId: "viewer",
        slug: "acme",
        revealedFields: ["info.email"],
      }),
    ).resolves.toEqual({
      authorization: {
        workspaceId: "workspace",
        role: "viewer",
        entitled: true,
      },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("audits reveal field names and a value-free fingerprint", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          profileNodeId: "7",
          payload: { info: { email: "private@example.com" } },
        },
      ])
      .mockResolvedValueOnce([{ count: "2" }])
      .mockResolvedValueOnce([]);
    const repository = new AccessWorkspacesRepository(
      transactionalPostgres(query),
    );
    jest.spyOn(repository, "authorize").mockResolvedValue({
      workspaceId: "workspace",
      role: "analyst",
      entitled: true,
    });

    const result = await repository.inspectProfile({
      workspaceId: "workspace",
      actorUserId: "analyst",
      slug: "acme",
      revealedFields: ["info.email"],
    });

    expect(result.recentRevealCount).toBe(2);
    const audit = query.mock.calls[2];
    expect(audit[0]).toContain("INSERT INTO inspect_audits");
    expect(audit[1]).toEqual([
      "workspace",
      "analyst",
      "7",
      "reveal",
      ["info.email"],
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    expect(JSON.stringify(audit)).not.toContain("private@example.com");
  });

  it("leaves an active source unchanged without deliberate bypass", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: "target", domain: "target.example", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "source", domain: "source.example", status: "active" },
      ]);
    const repository = new AccessWorkspacesRepository(
      transactionalPostgres(query),
    );

    await expect(
      repository.transferDomain({
        targetWorkspaceId: "target",
        actorUserId: "superadmin",
        normalizedDomain: "source.example",
        reason: "Reviewed domain move",
        superadminBypass: false,
      }),
    ).resolves.toEqual({ status: "active_source_requires_bypass" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map(call => call[0]).join("\n")).not.toContain(
      "UPDATE access_workspaces",
    );
  });

  it("atomically swaps ownership and records before/after bypass evidence", async () => {
    const value = { id: "audit", superadminBypass: true };
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: "target", domain: "target.example", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "source", domain: "source.example", status: "active" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value }]);
    const postgres = transactionalPostgres(query);
    const repository = new AccessWorkspacesRepository(postgres);

    await expect(
      repository.transferDomain({
        targetWorkspaceId: "target",
        actorUserId: "superadmin",
        normalizedDomain: "source.example",
        reason: "Reviewed domain move",
        superadminBypass: true,
      }),
    ).resolves.toEqual({ status: "transferred", value });
    expect(query.mock.calls[2][1]).toEqual([
      "source",
      "transfer-source.invalid",
    ]);
    expect(query.mock.calls[3][1]).toEqual(["target", "source.example"]);
    expect(query.mock.calls[4][1]).toEqual(["source", "target.example"]);
    const [auditSql, auditParameters] = query.mock.calls[5] as [
      string,
      unknown[],
    ];
    expect(auditSql).toContain("before_snapshot, after_snapshot");
    expect(auditSql).not.toContain("access_workspace_members");
    expect(auditParameters).toEqual([
      "source.example",
      "source",
      "target",
      "superadmin",
      true,
      "Reviewed domain move",
      expect.stringContaining('"domain":"target.example"'),
      expect.stringContaining('"domain":"source.example"'),
    ]);
  });
});
