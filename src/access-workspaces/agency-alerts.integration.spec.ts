import { ConfigService } from "@nestjs/config";
import { MailService } from "src/mail/mail.service";
import { AgencyAlertsService } from "./agency-alerts.service";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PostgresService } from "src/postgres/postgres.service";
import { AgencyAlertsRepository } from "./agency-alerts.repository";
import { AgencyAlertsAdminService } from "./agency-alerts-admin.service";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AccessWorkspacesService } from "./access-workspaces.service";

const databaseUrl = process.env.AGENCY_ALERTS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const workspaceId = "c91c41b7-8c1e-4015-8606-2d9f047017c1";
const otherWorkspaceId = "d91c41b7-8c1e-4015-8606-2d9f047017c1";

describeDatabase("Agency Alert PostgreSQL publication and delivery", () => {
  let pool: Pool;
  let repository: AgencyAlertsRepository;
  let admin: AgencyAlertsAdminService;
  let access: AccessWorkspacesRepository;
  let jobId = 100;
  const schema = `agency_alert_test_${process.pid}`;
  const migration = readFileSync(
    resolve(__dirname, "../../scripts/sql/agency-alerts.sql"),
    "utf8",
  );

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("test")
    ) {
      throw new Error(
        "Alert fixtures require a disposable local test database",
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema},public`,
    });
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE FUNCTION ${schema}.jsonb_boolean_value(value jsonb, key text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT (value ->> key)::boolean $$;
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY, label text NOT NULL, properties jsonb NOT NULL);
      CREATE TABLE graph_relationships(source_id bigint, target_id bigint, type text);
      CREATE TABLE access_workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), primary_profile_node_id bigint UNIQUE REFERENCES graph_nodes(id),
        owner_user_id text, normalized_registrable_domain text UNIQUE, status text DEFAULT 'active', plan_code text DEFAULT 'agency',
        entitlement_enabled boolean DEFAULT false, monthly_price_cents int DEFAULT 29900, stripe_quantity int DEFAULT 1,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE access_workspace_members(workspace_id uuid REFERENCES access_workspaces(id), user_id text, role text,
        invited_by text, joined_at timestamptz DEFAULT now(), PRIMARY KEY(workspace_id,user_id));
      CREATE TABLE organization_search_documents(organization_id text PRIMARY KEY, name text, slug text, payload jsonb DEFAULT '{}');
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY, short_uuid text UNIQUE, organization_id text, project_id text,
        title text, location text, online boolean DEFAULT true, blocked boolean DEFAULT false, legacy_list_eligible boolean DEFAULT true,
        tags text[] DEFAULT '{engineering}', access text DEFAULT 'public', organization_has_expert_jobs boolean DEFAULT false,
        published_timestamp bigint);
      INSERT INTO graph_nodes VALUES (1,'User','{"wallet":"member"}'),(2,'UserEmail','{"email":"member@example.com","main":true}'),
        (3,'User','{"wallet":"other"}'),(4,'UserEmail','{"email":"other@example.com","main":true}'),
        (5,'EntityProfile','{"id":"agency-profile","name":"Agency"}'),(6,'EntityProfile','{"id":"other-profile"}'),
        (7,'StructuredJobpost','{"shortUUID":"old-absent"}'),(8,'StructuredJobpost','{"shortUUID":"old-active"}'),
        (9,'UserUnverifiedEmail','{"email":"unverified@example.com","main":true}'),(10,'User','{"wallet":"unverified"}');
      INSERT INTO graph_relationships VALUES (1,2,'HAS_EMAIL'),(3,4,'HAS_EMAIL'),(10,9,'HAS_EMAIL');
      INSERT INTO access_workspaces(id,primary_profile_node_id,owner_user_id,normalized_registrable_domain) VALUES
        ('${workspaceId}',5,'member','agency.example'),('${otherWorkspaceId}',6,'other','other.example');
      INSERT INTO access_workspace_members(workspace_id,user_id,role) VALUES ('${workspaceId}','member','owner'),
        ('${workspaceId}','other','viewer'),('${otherWorkspaceId}','other','owner'),('${workspaceId}','unverified','viewer');
      INSERT INTO organization_search_documents(organization_id,name,slug) VALUES ('org','Organization','organization'),('other-org','Other','other');
      INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,title) VALUES (99,'old-active','org','Old role');
    `);
    await pool.query(migration);
    const postgres = {
      query: async (
        sql: string,
        parameters: unknown[] = [],
      ): Promise<Record<string, unknown>[]> =>
        (await pool.query(sql, parameters)).rows,
      transaction: async <T>(
        work: (manager: {
          query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>;
        }) => Promise<T>,
      ): Promise<T> => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const value = await work({
            query: async (sql, parameters = []): Promise<unknown[]> =>
              (await client.query(sql, parameters)).rows,
          });
          await client.query("COMMIT");
          return value;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    } as unknown as PostgresService;
    repository = new AgencyAlertsRepository(postgres);
    access = new AccessWorkspacesRepository(postgres);
    admin = new AgencyAlertsAdminService(
      postgres,
      new AccessWorkspacesService(access),
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE agency_alert_follows CASCADE;
      DELETE FROM job_search_documents WHERE job_node_id <> 99;
      UPDATE access_workspaces SET alerts_enabled = true, status = 'active', entitlement_enabled = false;
      UPDATE graph_nodes SET properties = properties - 'banned' WHERE label = 'EntityProfile';
      UPDATE graph_nodes SET label='UserEmail', properties='{"email":"member@example.com","main":true}' WHERE id=2;
      UPDATE graph_nodes SET properties='{"email":"other@example.com","main":true}' WHERE id=4;
      DELETE FROM graph_relationships WHERE source_id=1;
      INSERT INTO graph_relationships VALUES (1,2,'HAS_EMAIL');
      INSERT INTO access_workspace_members(workspace_id,user_id,role) VALUES ('${workspaceId}','other','viewer') ON CONFLICT DO NOTHING;
    `);
  });

  async function publish(
    shortUUID: string,
    options: {
      future?: boolean;
      online?: boolean;
      access?: string;
      tags?: string[];
      projectId?: string;
      organizationId?: string | null;
    } = {},
  ): Promise<void> {
    await pool.query(
      `INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,project_id,title,online,access,tags,published_timestamp)
      VALUES ($1,$2,$3,$4,'Engineer',$5,$6,$7,CASE WHEN $8 THEN extract(epoch FROM now()+interval '1 day')*1000 ELSE NULL END)`,
      [
        jobId++,
        shortUUID,
        options.organizationId === undefined ? "org" : options.organizationId,
        options.projectId ?? null,
        options.online ?? true,
        options.access ?? "public",
        options.tags ?? ["engineering"],
        options.future ?? false,
      ],
    );
  }

  it("baselines absent/offline identities, survives rebuilds and migration reapplication", async () => {
    await repository.follow(workspaceId, "member", "org");
    await publish("old-absent");
    await pool.query(
      "UPDATE job_search_documents SET online=false WHERE short_uuid='old-active'; UPDATE job_search_documents SET online=true WHERE short_uuid='old-active'",
    );
    expect(await repository.claim()).toBeNull();
    await publish("baseline-new");
    await pool.query(migration);
    const claim = await repository.claim();
    expect(claim).not.toBeNull();
    expect(await repository.prepare(claim!)).toEqual([
      { shortUUID: "baseline-new", title: "Engineer", location: null },
    ]);
    await pool.query(
      "DELETE FROM job_search_documents WHERE short_uuid='baseline-new'",
    );
    await publish("baseline-new");
    expect(await repository.claim()).toBeNull();
  });

  it("does not backfill first follows or re-follows, including metadata edits", async () => {
    await publish("before-follow");
    await repository.follow(workspaceId, "member", "org");
    expect(await repository.claim()).toBeNull();
    await publish("after-follow");
    const claim = await repository.claim();
    expect(claim).not.toBeNull();
    await repository.unfollow(workspaceId, "member", "org");
    await repository.follow(workspaceId, "member", "org");
    await pool.query(
      "UPDATE job_search_documents SET title='Edited title',online=false WHERE short_uuid='after-follow'; UPDATE job_search_documents SET online=true WHERE short_uuid='after-follow'",
    );
    expect(await repository.claim()).toBeNull();
  });

  it("deduplicates simultaneous workers and batches same-organization roles", async () => {
    await repository.follow(workspaceId, "member", "org");
    await publish("race-one");
    await publish("race-two");
    const claims = (
      await Promise.all([repository.claim(), repository.claim()])
    ).filter(claim => claim !== null);
    expect(claims).toHaveLength(1);
    expect(await repository.prepare(claims[0]!)).toHaveLength(2);
    expect(await repository.claim()).toBeNull();
  });

  it("does not use a max-sequence cursor that skips late transaction commits", async () => {
    await repository.follow(workspaceId, "member", "org");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO job_search_documents(job_node_id,short_uuid,organization_id,title) VALUES ($1,'late-commit','org','Late')`,
        [jobId++],
      );
      await publish("early-commit");
      expect(await repository.claim()).not.toBeNull();
      await client.query("COMMIT");
      const next = await repository.claim();
      expect(
        (await repository.prepare(next!))?.map(job => job.shortUUID),
      ).toEqual(["late-commit"]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("waits for future publication and includes a follow created after capture but before publication", async () => {
    await publish("future-role", { future: true });
    await repository.follow(workspaceId, "member", "org");
    expect(await repository.claim()).toBeNull();
    const future =
      await pool.query(`SELECT publication.observed_at > follow.created_at AS eligible_later
      FROM agency_alert_publications publication CROSS JOIN agency_alert_follows follow WHERE short_uuid='future-role'`);
    expect(future.rows[0].eligible_later).toBe(true);
    // Advance the fixture's effective publication clock, without sleeping or touching production.
    await pool.query(`UPDATE agency_alert_publications SET observed_at=(SELECT created_at+interval '1 microsecond' FROM agency_alert_follows LIMIT 1) WHERE short_uuid='future-role';
      UPDATE job_search_documents SET published_timestamp=extract(epoch FROM now()-interval '1 second')*1000 WHERE short_uuid='future-role'`);
    const claim = await repository.claim();
    expect(
      (await repository.prepare(claim!))?.map(job => job.shortUUID),
    ).toEqual(["future-role"]);
  });

  it("captures only tagged public organization roles and rechecks publication owner", async () => {
    await repository.follow(workspaceId, "member", "org");
    await publish("private-role", { access: "private" });
    await publish("untagged-role", { tags: [] });
    await publish("project-role", {
      projectId: "project",
      organizationId: null,
    });
    expect(await repository.claim()).toBeNull();
    await pool.query(
      "UPDATE job_search_documents SET tags='{engineering}' WHERE short_uuid='untagged-role'",
    );
    const claim = await repository.claim();
    await pool.query(
      "UPDATE job_search_documents SET organization_id='other-org' WHERE short_uuid='untagged-role'",
    );
    expect(await repository.prepare(claim!)).toBeNull();
  });

  it("binds the verified recipient and isolates personal subscriptions", async () => {
    expect(await repository.recipient("unverified")).toBeNull();
    expect(await repository.follow(workspaceId, "unverified", "org")).toBe(
      false,
    );
    expect(await repository.follow(workspaceId, "outsider", "org")).toBe(false);
    await repository.follow(workspaceId, "member", "org");
    await repository.follow(workspaceId, "other", "org");
    await repository.unfollow(workspaceId, "other", "org");
    expect(await repository.follows(workspaceId, "member")).toHaveLength(1);
    await publish("email-recheck");
    const claim = await repository.claim();
    await pool.query("UPDATE graph_nodes SET properties='{}' WHERE id=2");
    expect(await repository.prepare(claim!)).toBeNull();
    expect(
      (await repository.follows(workspaceId, "member"))[0].deliveryPaused,
    ).toBe(true);
  });

  it("pauses changed primary emails rather than redirecting existing subscriptions", async () => {
    await repository.follow(workspaceId, "member", "org");
    await pool.query(
      "UPDATE graph_nodes SET properties=jsonb_set(properties,'{main}','false') WHERE id=2; INSERT INTO graph_relationships VALUES (1,4,'HAS_EMAIL')",
    );
    await publish("primary-change");
    expect(await repository.claim()).toBeNull();
    expect(
      (await repository.follows(workspaceId, "member"))[0].deliveryPaused,
    ).toBe(true);
  });

  it("rechecks whitelist, banned profiles and removal after a committed claim", async () => {
    await repository.follow(workspaceId, "other", "org");
    await publish("revoke-recheck");
    const claim = await repository.claim();
    await admin.approve(workspaceId, "platform-admin", false);
    expect(await repository.prepare(claim!)).toBeNull();
    await admin.approve(workspaceId, "platform-admin", true);
    await pool.query(
      "UPDATE access_workspaces SET status='cancelled' WHERE id=$1",
      [workspaceId],
    );
    expect(await repository.prepare(claim!)).toHaveLength(1);
    await pool.query(
      "UPDATE graph_nodes SET properties = properties || '{\"banned\":true}' WHERE id=5",
    );
    expect(await repository.prepare(claim!)).toBeNull();
    expect(await access.authorize(workspaceId, "other")).toMatchObject({
      alertsEnabled: false,
    });
    expect(await repository.follow(workspaceId, "other", "other-org")).toBe(
      false,
    );
    await expect(
      admin.approve(workspaceId, "platform-admin", true),
    ).rejects.toThrow("available profile");
    await pool.query(
      "UPDATE graph_nodes SET properties = properties - 'banned' WHERE id=5",
    );
    await admin.removeMember(workspaceId, "other");
    expect(await repository.prepare(claim!)).toBeNull();
    expect(await repository.follows(workspaceId, "other")).toEqual([]);
  });

  it.each(["cancelled", "expired"])(
    "keeps free approved Alert independent of %s paid billing",
    async status => {
      await pool.query("UPDATE access_workspaces SET status=$2 WHERE id=$1", [
        workspaceId,
        status,
      ]);
      await admin.approve(workspaceId, "platform-admin", true);
      expect(await access.authorize(workspaceId, "member")).toMatchObject({
        alertsEnabled: true,
        entitled: false,
      });
      expect(await repository.follow(workspaceId, "member", "org")).toBe(true);
      await publish(`free-${status}`);
      const claim = await repository.claim();
      expect(await repository.prepare(claim!)).toHaveLength(1);
      await admin.approve(workspaceId, "platform-admin", false);
      expect(await repository.prepare(claim!)).toBeNull();
      expect(await repository.follow(workspaceId, "member", "other-org")).toBe(
        false,
      );
    },
  );

  it("approval does not grant paid entitlement and provisioning requires existing identities", async () => {
    await admin.approve(workspaceId, "platform-admin", true);
    expect(await access.authorize(workspaceId, "member")).toMatchObject({
      alertsEnabled: true,
      entitled: false,
    });
    await expect(
      admin.provision("platform-admin", {
        primaryProfileId: "agency-profile",
        ownerUserId: "nobody",
        domain: "agency.example",
      }),
    ).rejects.toThrow("existing JobStash account");
    await expect(
      admin.putMember(workspaceId, "platform-admin", "nobody", "viewer"),
    ).rejects.toThrow("existing JobStash account");
    await expect(admin.removeMember(workspaceId, "member")).rejects.toThrow(
      "owner cannot be removed",
    );
    const approved = await admin.provision("platform-admin", {
      primaryProfileId: "agency-profile",
      ownerUserId: "member",
      domain: "agency.example",
    });
    expect(approved).toMatchObject({
      alertsEnabled: true,
      whitelistUpdatedBy: "platform-admin",
    });
    await pool.query(
      `INSERT INTO graph_nodes VALUES (11,'EntityProfile','{"id":"new-partner","name":"New Partner"}')`,
    );
    const created = await admin.provision("platform-admin", {
      primaryProfileId: "new-partner",
      ownerUserId: "member",
      domain: "new-partner.example",
    });
    expect(created).toMatchObject({
      ownerUserId: "member",
      alertsEnabled: true,
      whitelistUpdatedBy: "platform-admin",
    });
    expect(await access.authorize(created.id, "member")).toMatchObject({
      entitled: false,
      alertsEnabled: true,
    });
  });

  it("unsubscribe stops only that recipient's workspace, including already-claimed batches", async () => {
    await repository.follow(workspaceId, "other", "org");
    await repository.follow(otherWorkspaceId, "other", "org");
    await publish("unsubscribe-race");
    const claim = await repository.claim();
    await repository.unfollow(claim!.workspaceId, claim!.userId);
    expect(await repository.prepare(claim!)).toBeNull();
    const other =
      claim!.workspaceId === workspaceId ? otherWorkspaceId : workspaceId;
    expect(await repository.follows(other, "other")).toHaveLength(1);
  });
  it("delivers the real SQL publication batch through the MailService boundary without sending real email", async () => {
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const service = new AgencyAlertsService(
      repository,
      access,
      { sendEmail } as unknown as MailService,
      new ConfigService({
        ENVIRONMENT: "production",
        JWT_SECRET: "test-secret",
        EMAIL: "alerts@example.com",
        FE_DOMAIN: "https://jobstash.xyz",
        MW_DOMAIN: "https://middleware.example.com",
        ORG_ADMIN_DOMAIN: "https://admin.jobstash.xyz",
      }),
    );
    const previousOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    try {
      await repository.follow(workspaceId, "member", "org");
      await publish("mail-boundary-one");
      await publish("mail-boundary-two");
      await service.deliver();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "member@example.com",
          text: expect.stringContaining("2 new roles"),
        }),
      );
      expect(
        (await pool.query("SELECT status FROM agency_alert_deliveries")).rows,
      ).toEqual([{ status: "accepted" }]);
      await service.deliver();
      expect(sendEmail).toHaveBeenCalledTimes(1);
    } finally {
      if (previousOwner === undefined)
        delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
      else process.env.MIDDLEWARE_SCHEDULE_OWNER = previousOwner;
    }
  });
});
