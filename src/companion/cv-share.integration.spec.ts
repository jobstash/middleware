/// <reference lib="es2024.promise" />
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client, Pool, QueryResultRow } from "pg";
import * as request from "supertest";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileRepository } from "src/postgres/profile.repository";
import { CompanionDeviceController } from "./companion.controller";
import { CvShareService } from "./cv-share.service";
import { CV_OBJECT_STORAGE } from "./cv-storage";
import { INTRO_PATHS_HTTP } from "./intro-paths";
import { DeviceAuthGuard } from "./device-execution.guard";
import {
  CvShareInput,
  deviceCanonicalRequest,
  deviceCvBodyParser,
} from "./device-execution.protocol";
import { DeviceExecutionService } from "./device-execution.service";
import { SubscriptionService } from "./subscription.service";

const databaseUrl = process.env.COMPANION_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64url");
const deviceId = randomUUID();
const payload = (): CvShareInput & {
  document: { filename: string; mediaType: "text/plain"; text: string };
} => ({
  document: {
    filename: "CV.txt",
    mediaType: "text/plain",
    text: "Engineer at Example Labs, 2021–2024.",
  },
  employment: [
    {
      ref: "profile:2",
      title: "Engineer",
      startDate: "2021",
      endDate: "2024",
      current: false,
    },
  ],
  consent: { version: 1, grantedAt: new Date().toISOString() },
});

function operationBarrier(): {
  reached: Promise<void>;
  wait: () => Promise<void>;
  release: () => void;
} {
  const reached = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  return {
    reached: reached.promise,
    release: pending.resolve,
    wait: async (): Promise<void> => {
      reached.resolve();
      await pending.promise;
    },
  };
}

suite("signed companion CV sharing on production main", () => {
  let client: Client, app: INestApplication;
  let pool: Pool;
  const schema = `companion_cv_test_${process.pid}`;
  const objects = new Map<string, Buffer>();
  // Nonempty CV bytes and permanent zero-byte objects are modeled separately.
  const fences = new Set<string>();
  const requestHashes = new Map<string, string>();
  let beforePut: (() => Promise<void>) | undefined;
  let uploadBackendPid: number | undefined;
  let afterPut: (() => Promise<void>) | undefined;
  let beforeDelete: (() => Promise<void>) | undefined;
  const storage = {
    put: jest.fn(
      async (
        key: string,
        body: Buffer,
        _contentType: string,
        requestHash: string,
      ) => {
        await beforePut?.();
        // The condition is evaluated at commit, not when the PUT begins.
        if (fences.has(key)) return false;
        if (objects.has(key)) {
          if (requestHashes.get(key) === requestHash) return true;
          throw new Error("Existing object does not match request");
        }
        objects.set(key, body);
        requestHashes.set(key, requestHash);
        await afterPut?.();
        return true;
      },
    ),
    delete: jest.fn(async (key: string) => {
      await beforeDelete?.();
      objects.delete(key);
      requestHashes.delete(key);
      fences.add(key);
    }),
    list: jest.fn(async (prefix: string) =>
      [...objects.keys(), ...fences].filter(key => key.startsWith(prefix)),
    ),
  };
  const db = {
    query: async (
      sql: string,
      parameters?: unknown[],
    ): Promise<QueryResultRow[]> => (await pool.query(sql, parameters)).rows,
    transaction: async (
      run: (executor: unknown) => Promise<unknown>,
    ): Promise<unknown> => {
      const connection = await pool.connect();
      let connectionError: Error | undefined;
      const onConnectionError = (error: Error): void => {
        connectionError = error;
      };
      connection.on("error", onConnectionError);
      await connection.query("BEGIN");
      try {
        const result = await run({
          query: async (sql: string, parameters?: unknown[]) => {
            const result = await connection.query(sql, parameters);
            if (
              sql.includes("candidate_subscriptions") &&
              sql.includes("FOR SHARE")
            )
              uploadBackendPid = (
                await connection.query("SELECT pg_backend_pid() AS pid")
              ).rows[0].pid;
            return result.rows;
          },
        });
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await connection.query("ROLLBACK");
        } catch (rollbackError) {
          if (!connectionError) throw rollbackError;
        }
        throw error;
      } finally {
        connection.removeListener("error", onConnectionError);
        connection.release(Boolean(connectionError));
      }
    },
  };
  const subscriptions = {
    refresh: async (): Promise<void> => {},
    entitled: async (): Promise<boolean> =>
      (
        await db.query(
          "SELECT 1 FROM candidate_subscriptions WHERE status='active' AND paid_until>now()",
        )
      ).length > 0,
  };
  const signed = (
    path: string,
    body: unknown,
    tamper = false,
  ): request.Test => {
    const raw = JSON.stringify(body),
      time = String(Date.now()),
      nonce = randomUUID();
    const signature = sign(
      null,
      Buffer.from(
        deviceCanonicalRequest(time, nonce, "POST", path, Buffer.from(raw)),
      ),
      keys.privateKey,
    ).toString("base64url");
    return request(app.getHttpServer())
      .post(path)
      .set({
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
        "X-Device-Time": time,
        "X-Device-Nonce": nonce,
        "X-Device-Signature": signature,
      })
      .send(tamper ? raw + " " : raw);
  };
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.includes("test"))
      throw new Error("Use an isolated local test database");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE SCHEMA ${schema}; SET search_path TO ${schema},public;
      CREATE TABLE graph_nodes(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,label text,labels text[],node_key text,properties jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
      CREATE TABLE graph_relationships(source_id bigint REFERENCES graph_nodes(id),target_id bigint REFERENCES graph_nodes(id),type text,relationship_key text DEFAULT '',properties jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),UNIQUE(source_id,target_id,type,relationship_key));
      CREATE TABLE candidate_devices(id uuid PRIMARY KEY,user_node_id bigint,public_key text,status text);
      CREATE TABLE candidate_device_nonces(device_id uuid,nonce uuid,received_at timestamptz DEFAULT now(),UNIQUE(device_id,nonce));
      CREATE TABLE candidate_subscriptions(checkout_id text,user_node_id bigint,status text,paid_until timestamptz);
      CREATE TABLE recommendation_embedding_documents(kind text,node_id bigint);
      CREATE FUNCTION entity_property_is_banned(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT COALESCE((p->>'banned')::boolean,false)$$;
      CREATE FUNCTION slugify_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT trim(both '-' from regexp_replace(lower(t),'[^a-z0-9]+','-','g'))$$;
      CREATE FUNCTION normalized_url_host(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT NULLIF(split_part(regexp_replace(lower(t),'^https?://',''), '/', 1),'')$$;
      CREATE TABLE organization_search_documents(organization_node_id bigint,name text,names text[],search_text text,search_vector tsvector,payload jsonb,detail_payload jsonb);
      CREATE TABLE project_search_documents(project_node_id bigint,name text,names text[],search_text text,search_vector tsvector,payload jsonb,detail_payload jsonb);`);
    await client.query(
      readFileSync(
        join(__dirname, "../../scripts/sql/companion-cv-documents.sql"),
        "utf8",
      ),
    );
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema},public`,
    });
    const module = await Test.createTestingModule({
      controllers: [CompanionDeviceController],
      providers: [
        DeviceExecutionService,
        DeviceAuthGuard,
        CvShareService,
        ProfileRepository,
        { provide: PostgresService, useValue: db },
        { provide: SubscriptionService, useValue: subscriptions },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (): string => "https://jobstash.xyz" },
        },
        { provide: CV_OBJECT_STORAGE, useValue: storage },
        { provide: INTRO_PATHS_HTTP, useValue: { post: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.use("/device/cv", deviceCvBodyParser());
    await app.init();
  });
  beforeEach(async () => {
    objects.clear();
    fences.clear();
    requestHashes.clear();
    beforePut = undefined;
    uploadBackendPid = undefined;
    afterPut = undefined;
    beforeDelete = undefined;
    jest.clearAllMocks();
    await client.query(`TRUNCATE candidate_cv_documents,recommendation_embedding_documents,graph_relationships,graph_nodes,candidate_devices,candidate_device_nonces,candidate_subscriptions,organization_search_documents,project_search_documents RESTART IDENTITY CASCADE;
      INSERT INTO graph_nodes(id,label,properties) VALUES
       (1,'User','{"privyId":"did:privy:synthetic","name":"Candidate"}'),
       (2,'EntityProfile','{"slug":"example-labs","aliases":["Ex Labs"]}'),
       (3,'ProfileInfo','{"displayName":"Example Labs","canonicalSite":"https://example.test"}'),
       (4,'Organization','{"name":"Example Labs","normalizedName":"example-labs"}'),
       (5,'Organization','{"name":"Banned","banned":true}'),
       (6,'UserShowCase','{"label":"CV","url":"https://old.test/cv"}'),
       (7,'LinkedAccount','{"github":"synthetic-dev"}');
      SELECT setval(pg_get_serial_sequence('graph_nodes','id'),100);
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES (2,3,'HAS_PROFILE_INFO'),(2,4,'PROFILE_HAS_ORGANIZATION'),(1,6,'HAS_SHOWCASE'),(1,7,'HAS_LINKED_ACCOUNT');
      INSERT INTO candidate_subscriptions VALUES ('sub',1,'active',now()+interval '1 day');
      INSERT INTO organization_search_documents VALUES (4,'Example Labs',ARRAY['example-labs'],'Example Labs',to_tsvector('simple','Example Labs'),'{}','{}');`);
    await client.query(
      "INSERT INTO candidate_devices VALUES($1,1,$2,'active')",
      [deviceId, publicKey],
    );
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (client) {
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
    }
  });

  it("replaces the existing CV showcase and employment edges using the R2 resume layout", async () => {
    const first = await signed("/device/cv", payload()).expect(200);
    expect(first.body).toMatchObject({ attached: true, employment: 1 });
    expect([...objects.keys()]).toEqual([`${first.body.documentId}/CV.txt`]);
    expect([...objects.values()][0].toString()).toBe(payload().document.text);
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=6"))[0]
        .properties.url,
    ).toBe(`https://jobstash.xyz/api/resume/${first.body.documentId}`);
    const next = payload();
    next.employment = [
      {
        ref: "organization:4",
        title: "Lead",
        startDate: "2024-01",
        endDate: null,
        current: true,
      },
    ];
    await signed("/device/cv", next).expect(200);
    const edges = await db.query(
      "SELECT target_id,properties FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      target_id: "4",
      properties: {
        title: "Lead",
        current: true,
        endDate: null,
        source: "companion_cv",
      },
    });
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=1"))[0]
        .properties.cvSharingConsent.consentVersion,
    ).toBe(1);
  });
  it.each(["profile:999", "profile:4", "organization:5"])(
    "rejects unknown, wrong-label or banned ref %s before storage",
    async ref => {
      const input = payload();
      input.employment[0].ref = ref;
      await signed("/device/cv", input).expect(400);
      expect(storage.put).not.toHaveBeenCalled();
      expect(
        await db.query(
          "SELECT * FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
        ),
      ).toEqual([]);
    },
  );
  it("rejects a tampered body and a device without membership", async () => {
    await signed("/device/cv", payload(), true).expect(403);
    await client.query("UPDATE candidate_subscriptions SET status='expired'");
    await signed("/device/cv", payload()).expect(403);
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("retains a durable cleanup target when storage writes bytes but loses its response", async () => {
    const input = { ...payload(), documentId: randomUUID() };
    afterPut = async (): Promise<void> => {
      throw new Error("connection lost");
    };
    await signed("/device/cv", input).expect(503);
    expect(objects.size).toBe(1);
    expect(
      (await db.query("SELECT state FROM candidate_cv_documents"))[0].state,
    ).toBe("pending");
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=6"))[0]
        .properties.url,
    ).toBe("https://old.test/cv");
    await signed("/device/cv/delete", { documentId: input.documentId }).expect(
      200,
    );
    expect(objects.size).toBe(0);
  });
  it("retries the same registered upload after a lost storage response without rewriting bytes", async () => {
    const input = { ...payload(), documentId: randomUUID() };
    afterPut = async (): Promise<void> => {
      throw new Error("response lost");
    };
    await signed("/device/cv", input).expect(503);
    const originalBytes = objects.get(`${input.documentId}/CV.txt`);
    afterPut = undefined;
    await signed("/device/cv", input).expect(200);
    expect(objects.get(`${input.documentId}/CV.txt`)).toBe(originalBytes);
    expect(
      (await db.query("SELECT state FROM candidate_cv_documents"))[0].state,
    ).toBe("attached");
  });
  it("deletes a zero-role CV without membership or consent, preserving unrelated profile data", async () => {
    const input = { ...payload(), documentId: randomUUID(), employment: [] };
    await signed("/device/cv", input).expect(200);
    await client.query("UPDATE candidate_subscriptions SET status='expired'");
    await client.query(
      "UPDATE graph_nodes SET properties=properties-'cvSharingConsent' WHERE id=1",
    );
    const body = { documentId: input.documentId };
    await signed("/device/cv/delete", body).expect(200, {
      deleted: true,
      ...body,
    });
    expect(objects.size).toBe(0);
    expect(
      await db.query(
        "SELECT * FROM graph_relationships WHERE type='HAS_SHOWCASE'",
      ),
    ).toEqual([]);
    expect(
      await db.query(
        "SELECT * FROM graph_relationships WHERE type='HAS_LINKED_ACCOUNT'",
      ),
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=1"))[0]
        .properties.name,
    ).toBe("Candidate");
    storage.delete.mockClear();
    await signed("/device/cv/delete", body).expect(200, {
      deleted: true,
      ...body,
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("deletes an older immutable target without touching its replacement or employment", async () => {
    const first = await signed("/device/cv", payload()).expect(200);
    const second = await signed("/device/cv", payload()).expect(200);
    await signed("/device/cv/delete", {
      documentId: first.body.documentId,
    }).expect(200);
    expect([...objects.keys()]).toEqual([`${second.body.documentId}/CV.txt`]);
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=6"))[0]
        .properties.url,
    ).toContain(second.body.documentId);
    const edges = await db.query(
      "SELECT properties FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].properties.documentId).toBe(second.body.documentId);
  });
  it("persists deletion intent on an ambiguous storage failure and resumes exact cleanup", async () => {
    const input = { ...payload(), documentId: randomUUID() };
    await signed("/device/cv", input).expect(200);
    storage.delete.mockImplementationOnce(async key => {
      objects.delete(key);
      requestHashes.delete(key);
      fences.add(key);
      throw new Error("delete response lost");
    });
    await signed("/device/cv/delete", { documentId: input.documentId }).expect(
      503,
    );
    expect(
      (await db.query("SELECT state FROM candidate_cv_documents"))[0].state,
    ).toBe("deleting");
    expect(
      await db.query(
        "SELECT * FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
      ),
    ).toHaveLength(1);
    await signed("/device/cv", input).expect(409);
    await signed("/device/cv/delete", { documentId: input.documentId }).expect(
      200,
    );
    expect(
      await db.query(
        "SELECT * FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
      ),
    ).toEqual([]);
  });
  it("never lets an editable current CV URL claim unregistered legacy bytes", async () => {
    const documentId = randomUUID();
    objects.set(`${documentId}/legacy.txt`, Buffer.from("legacy"));
    await client.query(
      "UPDATE graph_nodes SET properties=properties || $1::jsonb WHERE id=6",
      [
        JSON.stringify({
          url: `https://jobstash.xyz/api/resume/${documentId}`,
        }),
      ],
    );
    const result = await signed("/device/cv/delete", { documentId }).expect(
      409,
    );
    expect(result.body.code).toBe("cv_ownership_unknown");
    expect(objects.size).toBe(1);
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("recovers proven legacy keys, deletes every exact-prefix object, and keeps neighboring keys", async () => {
    const documentId = randomUUID();
    objects.set(`${documentId}/one.txt`, Buffer.from("one"));
    objects.set(`${documentId}/two.pdf`, Buffer.from("two"));
    objects.set(`${documentId}-neighbor/other.txt`, Buffer.from("other"));
    await client.query(
      "INSERT INTO graph_relationships(source_id,target_id,type,properties) VALUES(1,2,'CV_EMPLOYMENT',$1)",
      [JSON.stringify({ documentId, source: "companion_cv" })],
    );
    await signed("/device/cv/delete", { documentId }).expect(200);
    expect([...objects.keys()]).toEqual([`${documentId}-neighbor/other.txt`]);
    expect(
      (
        await db.query("SELECT object_keys,state FROM candidate_cv_documents")
      )[0],
    ).toEqual({
      object_keys: [`${documentId}/one.txt`, `${documentId}/two.pdf`],
      state: "deleted",
    });
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual([
      `${documentId}/one.txt`,
      `${documentId}/two.pdf`,
    ]);
  });
  it("backfills legacy ownership before replacement removes its graph provenance", async () => {
    const legacy = randomUUID();
    objects.set(`${legacy}/old.txt`, Buffer.from("legacy"));
    await client.query(
      "INSERT INTO graph_relationships(source_id,target_id,type,properties) VALUES(1,2,'CV_EMPLOYMENT',$1)",
      [JSON.stringify({ documentId: legacy, source: "companion_cv" })],
    );
    await client.query(
      readFileSync(
        join(__dirname, "../../scripts/sql/companion-cv-documents.sql"),
        "utf8",
      ),
    );
    const current = await signed("/device/cv", payload()).expect(200);
    await signed("/device/cv/delete", { documentId: legacy }).expect(200);
    expect([...objects.keys()]).toEqual([`${current.body.documentId}/CV.txt`]);
  });
  it("denies foreign registered documents without touching storage", async () => {
    const documentId = randomUUID();
    await client.query(
      "INSERT INTO candidate_cv_documents(document_id,user_node_id,object_keys,state) VALUES($1,99,$2,'attached')",
      [documentId, [`${documentId}/foreign.txt`]],
    );
    objects.set(`${documentId}/foreign.txt`, Buffer.from("foreign"));
    await signed("/device/cv/delete", { documentId }).expect(403);
    await signed("/device/cv", { ...payload(), documentId }).expect(403);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("tombstones a not-yet-arrived upload and rejects any delayed resurrection", async () => {
    const documentId = randomUUID();
    await signed("/device/cv/delete", { documentId }).expect(200, {
      deleted: true,
      documentId,
    });
    await signed("/device/cv", { ...payload(), documentId }).expect(409);
    expect(objects.size).toBe(0);
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("returns the original receipt on retry without restoring an older CV", async () => {
    const first = { ...payload(), documentId: randomUUID() };
    const receipt = await signed("/device/cv", first).expect(200);
    const second = await signed("/device/cv", payload()).expect(200);
    await signed("/device/cv", first).expect(200, receipt.body);
    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=6"))[0]
        .properties.url,
    ).toContain(second.body.documentId);
    await signed("/device/cv", { ...first, employment: [] }).expect(409);
  });
  it("serializes in-flight deletion with a new share using the owner row", async () => {
    const first = await signed("/device/cv", payload()).expect(200);
    const barrier = operationBarrier();
    beforeDelete = barrier.wait;
    const removal = signed("/device/cv/delete", {
      documentId: first.body.documentId,
    })
      .expect(200)
      .then(result => result);
    await barrier.reached;
    await client.query("BEGIN");
    await expect(
      client.query("SELECT id FROM graph_nodes WHERE id=1 FOR UPDATE NOWAIT"),
    ).rejects.toMatchObject({ code: "55P03" });
    await client.query("ROLLBACK");
    const replacement = signed("/device/cv", payload())
      .expect(200)
      .then(result => result);
    barrier.release();
    const [, next] = await Promise.all([removal, replacement]);
    expect([...objects.keys()]).toEqual([`${next.body.documentId}/CV.txt`]);
    expect(
      (
        await db.query(
          "SELECT n.properties FROM graph_nodes n JOIN graph_relationships r ON r.target_id=n.id WHERE r.source_id=1 AND r.type='HAS_SHOWCASE'",
        )
      )[0].properties.url,
    ).toContain(next.body.documentId);
  });
  it("waits for an in-flight upload before erasing it, without resurrecting its bytes", async () => {
    const input = { ...payload(), documentId: randomUUID() };
    const barrier = operationBarrier();
    afterPut = barrier.wait;
    const upload = signed("/device/cv", input)
      .expect(200)
      .then(result => result);
    await barrier.reached;
    const removal = signed("/device/cv/delete", {
      documentId: input.documentId,
    })
      .expect(200)
      .then(result => result);
    barrier.release();
    await Promise.all([upload, removal]);
    expect(objects.size).toBe(0);
    expect(
      (await db.query("SELECT state FROM candidate_cv_documents"))[0].state,
    ).toBe("deleted");
    expect(
      await db.query(
        "SELECT * FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
      ),
    ).toEqual([]);
    await signed("/device/cv", input).expect(409);
  });
  it("fences a late PUT after the upload's actual PostgreSQL session is terminated", async () => {
    const input = { ...payload(), documentId: randomUUID() };
    const key = `${input.documentId}/CV.txt`;
    const barrier = operationBarrier();
    beforePut = barrier.wait;
    const upload = signed("/device/cv", input)
      .expect(409)
      .then(result => result);
    await barrier.reached;
    try {
      expect(uploadBackendPid).toEqual(expect.any(Number));
      expect(
        (
          await client.query("SELECT pg_terminate_backend($1) AS terminated", [
            uploadBackendPid,
          ])
        ).rows[0].terminated,
      ).toBe(true);
      // The PUT is still outstanding, but its owner/document locks are now gone.
      await signed("/device/cv/delete", {
        documentId: input.documentId,
      }).expect(200);
      expect(objects.has(key)).toBe(false);
      expect(fences.has(key)).toBe(true);
      expect(
        (
          await db.query("SELECT state,object_keys FROM candidate_cv_documents")
        )[0],
      ).toEqual({
        state: "deleted",
        object_keys: [key],
      });
    } finally {
      barrier.release();
    }
    await upload;
    // Storage evaluates If-None-Match at commit and cannot replace the acknowledged fence.
    expect(objects.has(key)).toBe(false);
    expect(fences.has(key)).toBe(true);
    expect(
      await db.query(
        "SELECT * FROM graph_relationships WHERE type='CV_EMPLOYMENT'",
      ),
    ).toEqual([]);
    expect(
      (await db.query("SELECT properties FROM graph_nodes WHERE id=6"))[0]
        .properties.url,
    ).toBe("https://old.test/cv");
    storage.delete.mockClear();
    await signed("/device/cv/delete", { documentId: input.documentId }).expect(
      200,
    );
    expect(storage.delete).not.toHaveBeenCalled();
    expect(fences.has(key)).toBe(true);
  });
  it("does not acknowledge deletion when the permanent storage fence cannot be written", async () => {
    const input = { ...payload(), documentId: randomUUID() };
    const key = `${input.documentId}/CV.txt`;
    await signed("/device/cv", input).expect(200);
    storage.delete.mockRejectedValueOnce(new Error("fence unavailable"));
    await signed("/device/cv/delete", { documentId: input.documentId }).expect(
      503,
    );
    expect(objects.has(key)).toBe(true);
    expect(fences.has(key)).toBe(false);
    expect(
      (
        await db.query("SELECT state,object_keys FROM candidate_cv_documents")
      )[0],
    ).toEqual({
      state: "deleting",
      object_keys: [key],
    });
    await signed("/device/cv/delete", { documentId: input.documentId }).expect(
      200,
    );
    expect(objects.has(key)).toBe(false);
    expect(fences.has(key)).toBe(true);
  });
  it("serializes ordinary profile replacement with deletion and preserves the later profile", async () => {
    await client.query(
      `UPDATE graph_nodes SET properties=properties || '{"wallet":"synthetic-wallet"}' WHERE id=1`,
    );
    const first = await signed("/device/cv", payload()).expect(200);
    const barrier = operationBarrier();
    beforeDelete = barrier.wait;
    const removal = signed("/device/cv/delete", {
      documentId: first.body.documentId,
    })
      .expect(200)
      .then(result => result);
    await barrier.reached;
    const replacement = app
      .get(ProfileRepository)
      .replaceShowcases("synthetic-wallet", [
        { label: "CV", url: "https://synthetic.invalid/new-cv" },
        { label: "Portfolio", url: "https://synthetic.invalid/portfolio" },
      ]);
    barrier.release();
    await Promise.all([removal, replacement]);
    const showcases = await app
      .get(ProfileRepository)
      .getShowcases("synthetic-wallet");
    expect(showcases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "CV",
          url: "https://synthetic.invalid/new-cv",
        }),
        expect.objectContaining({
          label: "Portfolio",
          url: "https://synthetic.invalid/portfolio",
        }),
      ]),
    );
    expect(objects.size).toBe(0);
  });
  it("never treats a failed object listing as an empty prefix", async () => {
    const documentId = randomUUID();
    objects.set(`${documentId}/legacy.txt`, Buffer.from("unclaimed"));
    storage.list.mockRejectedValueOnce(new Error("listing unavailable"));
    await signed("/device/cv/delete", { documentId }).expect(503);
    expect(await db.query("SELECT * FROM candidate_cv_documents")).toEqual([]);
    await signed("/device/cv/delete", { documentId }).expect(409);
    await signed("/device/cv", { ...payload(), documentId }).expect(409);
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(objects.size).toBe(1);
  });
  it("authenticates deletion bytes and rejects invalid, oversized or revoked-device requests", async () => {
    const body = { documentId: randomUUID() };
    await signed("/device/cv/delete", body, true).expect(403);
    await signed("/device/cv/delete", { ...body, owner: "1" }).expect(400);
    await signed("/device/cv/delete", { documentId: "../foreign" }).expect(400);
    await signed("/device/cv/delete", { padding: "x".repeat(17000) }).expect(
      413,
    );
    await client.query("UPDATE candidate_devices SET status='revoked'");
    await signed("/device/cv/delete", body).expect(403);
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("rejects oversized signed bodies at the route parser", async () => {
    await signed("/device/cv", {
      padding: "x".repeat(7.5 * 1024 * 1024),
    }).expect(413);
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("returns profiles before duplicate children and exposes the synchronized GitHub login", async () => {
    const result = await signed("/device/platform", {
      operation: "employer_search",
      args: { queries: [{ name: "Example Labs" }, { name: "Ex Labs" }] },
    }).expect(200);
    expect(
      result.body.results.map((r: { candidates: { ref: string }[] }) =>
        r.candidates.map(c => c.ref),
      ),
    ).toEqual([["profile:2"], ["profile:2"]]);
    const status = await signed("/device/platform", {
      operation: "status",
      args: {},
    }).expect(200);
    expect(status.body.github).toEqual({ login: "synthetic-dev" });
  });
  it("resolves profiles and children to the ecosystem.vision page key and refuses ambiguous, banned or unknown refs", async () => {
    const resolve = (ref: string): request.Test =>
      signed("/device/platform", {
        operation: "employer_profile",
        args: { ref },
      });
    const page = {
      kind: "organization",
      slug: "example-labs",
      name: "Example Labs",
    };
    expect((await resolve("profile:2").expect(200)).body).toEqual(page);
    expect((await resolve("organization:4").expect(200)).body).toEqual(page);
    await resolve("organization:5").expect(404);
    await resolve("profile:999").expect(404);
    await resolve("profile:4").expect(404);
    // Projects are products: the profile keeps resolving to its organization however many projects it owns,
    // falls back to a lone project when it has no organization, and is ambiguous with several projects and none.
    await client.query(`INSERT INTO graph_nodes(id,label,properties) VALUES (8,'Project','{"name":"Example App","normalizedName":"example-app"}'),
      (9,'EntityProfile','{"slug":"lonely"}'),(10,'EntityProfile','{"slug":"products-only"}'),(11,'Project','{"name":"Second App","normalizedName":"second-app"}');
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES (2,8,'PROFILE_HAS_PROJECT'),(2,11,'PROFILE_HAS_PROJECT'),(10,8,'PROFILE_HAS_PROJECT');`);
    expect((await resolve("profile:2").expect(200)).body).toEqual(page);
    await resolve("profile:9").expect(404);
    expect((await resolve("profile:10").expect(200)).body).toEqual({
      kind: "project",
      slug: "example-app",
      name: "Example App",
    });
    await client.query(
      "INSERT INTO graph_relationships(source_id,target_id,type) VALUES (10,11,'PROFILE_HAS_PROJECT')",
    );
    await resolve("profile:10").expect(404);
    expect((await resolve("project:8").expect(200)).body).toEqual({
      kind: "project",
      slug: "example-app",
      name: "Example App",
    });
    await client.query("UPDATE candidate_subscriptions SET status='expired'");
    // Opening a page needs pairing, not membership: saved history stays navigable after expiry.
    await resolve("organization:4").expect(200);
  });
});
