import { User } from "@privy-io/server-auth";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { PrivyThreatSyncService } from "./privy-threat-sync.service";

describe("PrivyThreatSyncService", () => {
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === "PRIVY_APP_ID" ? "test-app" : "test-secret",
    ),
  } as unknown as ConfigService;

  it("stores only a hashed Privy subject and public GitHub identifiers", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const postgres = {
      transaction: jest.fn(async callback =>
        callback({ query } as unknown as EntityManager),
      ),
    } as unknown as PostgresService;
    const service = new PrivyThreatSyncService(config, postgres);
    const user = {
      id: "did:privy:secret-subject",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      linkedAccounts: [
        {
          type: "github_oauth",
          subject: "123456",
          username: "Example-Dev",
          email: "must-not-be-stored@example.com",
          name: "Sensitive Name",
          verifiedAt: new Date("2026-07-02T00:00:00Z"),
          firstVerifiedAt: new Date("2026-07-02T00:00:00Z"),
          latestVerifiedAt: new Date("2026-07-03T00:00:00Z"),
        },
      ],
    } as unknown as User;

    await expect(service.syncUser(user)).resolves.toBe(true);

    const upsert = query.mock.calls.find(call =>
      String(call[0]).includes("ON CONFLICT (privy_subject_hash)"),
    );
    expect(upsert).toBeDefined();
    expect(upsert?.[1]).toEqual([
      createHash("sha256")
        .update("privy:did:privy:secret-subject")
        .digest("hex"),
      "example-dev",
      "123456",
      new Date("2026-07-02T00:00:00Z"),
      new Date("2026-07-03T00:00:00Z"),
      "did:privy:secret-subject",
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(
      "must-not-be-stored@example.com",
    );
    expect(JSON.stringify(query.mock.calls)).not.toContain("Sensitive Name");
  });

  it("deactivates the hashed subject when GitHub is unlinked", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const postgres = {
      transaction: jest.fn(async callback =>
        callback({ query } as unknown as EntityManager),
      ),
    } as unknown as PostgresService;
    const service = new PrivyThreatSyncService(config, postgres);

    await expect(
      service.syncUser({
        id: "did:privy:no-github",
        linkedAccounts: [],
      } as unknown as User),
    ).resolves.toBe(false);

    const deactivate = query.mock.calls.find(call =>
      String(call[0]).includes("SET active = false"),
    );
    expect(deactivate?.[1]).toEqual([
      createHash("sha256").update("privy:did:privy:no-github").digest("hex"),
    ]);
  });
});
