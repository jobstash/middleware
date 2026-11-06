import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { Client } from "pg";
import { PostgresService } from "src/postgres/postgres.service";
import { CompanionDeviceController } from "./companion.controller";
import { DeviceAuthGuard } from "./device-execution.guard";
import { DeviceExecutionService } from "./device-execution.service";
import { deviceCanonicalRequest } from "./device-execution.protocol";
import { SubscriptionService } from "./subscription.service";

const databaseUrl = process.env.COMPANION_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  "GitHub introductions through signed local HTTP and isolated PostgreSQL",
  () => {
    const schema = `companion_intro_test_${process.pid}`;
    const deviceId = randomUUID();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const target = { login: "lifinance", kind: "organization" };
    const post = jest.fn();
    const subscriptions = { refresh: jest.fn(), entitled: jest.fn() };
    let client: Client;
    let app: INestApplication;
    let url: string;
    const db = {
      query: async (
        sql: string,
        parameters?: unknown[],
      ): Promise<Record<string, unknown>[]> =>
        (await client.query(sql, parameters)).rows,
      transaction: async <T>(
        fn: (connection: typeof db) => Promise<T>,
      ): Promise<T> => {
        await client.query("BEGIN");
        try {
          const result = await fn(db);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      },
    };
    const signedRequest = (
      args: unknown,
      overrides: Record<string, string> = {},
    ): Promise<Response> => {
      const raw = JSON.stringify({ operation: "intro_paths", args });
      const time = String(Date.now());
      const nonce = randomUUID();
      const signature = sign(
        null,
        Buffer.from(
          deviceCanonicalRequest(
            time,
            nonce,
            "POST",
            "/device/platform",
            Buffer.from(raw),
          ),
        ),
        privateKey,
      ).toString("base64url");
      return fetch(`${url}/device/platform`, {
        method: "POST",
        body: raw,
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId,
          "X-Device-Time": time,
          "X-Device-Nonce": nonce,
          "X-Device-Signature": signature,
          ...overrides,
        },
      });
    };

    beforeAll(async () => {
      const targetDatabase = new URL(databaseUrl!);
      if (
        !["localhost", "127.0.0.1"].includes(targetDatabase.hostname) ||
        !decodeURIComponent(targetDatabase.pathname).includes("test")
      )
        throw new Error(
          "Introduction fixtures require an isolated local test database",
        );
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
      await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE graph_nodes (id bigint PRIMARY KEY, label text, properties jsonb);
      CREATE TABLE graph_relationships (source_id bigint, target_id bigint, type text);
      CREATE TABLE candidate_devices (id uuid PRIMARY KEY, user_node_id bigint, status text, public_key text);
      CREATE TABLE candidate_device_nonces (device_id uuid, nonce uuid, received_at timestamptz DEFAULT now(), PRIMARY KEY(device_id, nonce));
      INSERT INTO graph_nodes VALUES (1,'User','{"name":"Synthetic intro account"}');`);
      await client.query(
        "INSERT INTO candidate_devices VALUES ($1,1,'active',$2)",
        [
          deviceId,
          publicKey
            .export({ type: "spki", format: "der" })
            .toString("base64url"),
        ],
      );
      const service = new DeviceExecutionService(
        db as unknown as PostgresService,
        subscriptions as unknown as SubscriptionService,
        { post } as never,
      );
      const module = await Test.createTestingModule({
        controllers: [CompanionDeviceController],
        providers: [
          DeviceAuthGuard,
          { provide: DeviceExecutionService, useValue: service },
        ],
      }).compile();
      app = module.createNestApplication({ rawBody: true, logger: false });
      await app.listen(0, "127.0.0.1");
      url = await app.getUrl();
    });
    afterAll(async () => {
      if (app) await app.close();
      if (client) {
        await client.query(`DROP SCHEMA ${schema} CASCADE`);
        await client.end();
      }
    });
    beforeEach(async () => {
      post.mockReset();
      subscriptions.refresh.mockReset();
      subscriptions.entitled.mockReset().mockResolvedValue(true);
      await client.query(
        "DELETE FROM graph_relationships; DELETE FROM graph_nodes WHERE id <> 1",
      );
      post.mockImplementation(async (_path, body) => ({
        data: {
          source: body.source,
          available: true,
          asOf: "2026-11-05T00:00:00.000Z",
          inferred: true,
          coverage: { source: "indexed", maxHops: 2 },
          targets: body.targets.map((endpoint: object) => ({
            ...endpoint,
            status: "no_paths",
            paths: [],
          })),
        },
      }));
    });

    it.each(["user", "organization"])(
      "queries explicit %s source to users and organizations without linked GitHub or any job tables",
      async kind => {
        const response = await signedRequest({
          source: { login: "Source-Org", kind },
          targets: [
            target,
            { login: "Friend", kind: "user" },
            { ...target, login: "LiFinance" },
          ],
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          source: { login: "source-org", kind },
          available: true,
          targets: [
            { ...target, status: "no_paths" },
            { login: "friend", kind: "user", status: "no_paths" },
          ],
        });
        expect(post).toHaveBeenCalledWith("/scorer/intro-paths/query", {
          source: { login: "source-org", kind },
          targets: [target, { login: "friend", kind: "user" }],
          limit: 50,
        });
      },
    );

    it("reports github_required when default source is missing", async () => {
      const response = await signedRequest({ targets: [target] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        source: null,
        available: false,
        reason: "github_required",
        targets: [{ ...target, status: "unavailable" }],
      });
      expect(post).not.toHaveBeenCalled();
    });

    it.each(["LinkedAccount", "GithubUser"])(
      "resolves default source through actual %s SQL",
      async label => {
        const properties =
          label === "LinkedAccount"
            ? { github: "Synthetic-User" }
            : { login: "Synthetic-User" };
        await client.query("INSERT INTO graph_nodes VALUES (2,$1,$2)", [
          label,
          properties,
        ]);
        await client.query("INSERT INTO graph_relationships VALUES (1,2,$1)", [
          label === "LinkedAccount" ? "HAS_LINKED_ACCOUNT" : "HAS_GITHUB_USER",
        ]);
        const response = await signedRequest({ targets: [target] });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          source: { login: "synthetic-user", kind: "user" },
        });
      },
    );

    it.each([
      { jobIds: ["node:1"] },
      { targets: [] },
      { targets: [{ login: "bad--login", kind: "user" }] },
      { targets: [target], publicationRange: "all" },
    ])("rejects malformed signed args %j", async args => {
      expect((await signedRequest(args)).status).toBe(400);
      expect(post).not.toHaveBeenCalled();
      expect(subscriptions.refresh).not.toHaveBeenCalled();
    });

    it("rejects invalid signatures, unsigned requests and browser authorization", async () => {
      expect(
        (
          await signedRequest(
            { targets: [target] },
            { "X-Device-Signature": "A".repeat(86) },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await signedRequest(
            { targets: [target] },
            { Authorization: "Bearer synthetic" },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/device/platform`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operation: "intro_paths",
              args: { targets: [target] },
            }),
          })
        ).status,
      ).toBe(403);
      expect(post).not.toHaveBeenCalled();
    });

    it("retains paid gating for explicit queries", async () => {
      subscriptions.entitled.mockResolvedValue(false);
      expect(
        (
          await signedRequest({
            source: { login: "source", kind: "user" },
            targets: [target],
          })
        ).status,
      ).toBe(403);
      expect(post).not.toHaveBeenCalled();
    });

    it("distinguishes scorer failure from no paths", async () => {
      post.mockRejectedValue(new Error("Synthetic scorer unavailable"));
      const response = await signedRequest({
        source: { login: "source", kind: "organization" },
        targets: [target],
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        available: false,
        reason: "unavailable",
        targets: [{ ...target, status: "unavailable", paths: [] }],
      });
    });
  },
);
