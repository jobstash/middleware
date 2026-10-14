import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { AuthService } from "src/auth/auth.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { ProfileService } from "src/auth/profile/profile.service";
import { GraphRepository } from "src/postgres/graph.repository";
import { ScorerService } from "src/scorer/scorer.service";
import { StripeService } from "src/stripe/stripe.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { PermissionService } from "src/user/permission.service";
import { UserController } from "src/user/user.controller";
import { UserService } from "src/user/user.service";
import {
  AccessWorkspacesController,
  InspectController,
} from "./access-workspaces.controller";
import { AgencyAlertsAdminController } from "./agency-alerts-admin.controller";
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

describeDatabase(
  "Agency Alert PostgreSQL delivery and Agency product HTTP access",
  () => {
    let pool: Pool;
    let repository: AgencyAlertsRepository;
    let admin: AgencyAlertsAdminService;
    let access: AccessWorkspacesRepository;
    let app: INestApplication;
    let auth: AuthService;
    const users = {
      getUsersAvailableForWork: jest.fn(),
      getTopUsers: jest.fn(),
      getAgencyCandidateReport: jest.fn(),
      getTalentLists: jest.fn(),
      createTalentList: jest.fn(),
      addUserNote: jest.fn(),
    };
    const scorer = { getCandidateReport: jest.fn() };
    const subscriptions = { getSubscriptionInfoByOrgId: jest.fn() };
    const bundlePaths = [
      `/access-workspaces/${workspaceId}/bounty-opportunities`,
      `/users/available?workspaceId=${workspaceId}`,
      `/users/available/top?workspaceId=${workspaceId}`,
      `/users/available/public-opt-in/report?workspaceId=${workspaceId}`,
      `/users/candidate-report/light-fury?workspaceId=${workspaceId}`,
    ];
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
      CREATE FUNCTION ${schema}.jsonb_numeric_value(value jsonb, key text) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT (value ->> key)::numeric $$;
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY, label text NOT NULL, properties jsonb NOT NULL);
      CREATE TABLE graph_relationships(source_id bigint, target_id bigint, type text);
      ALTER TABLE graph_relationships ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY;
      CREATE TABLE access_workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), primary_profile_node_id bigint UNIQUE REFERENCES graph_nodes(id),
        owner_user_id text, normalized_registrable_domain text UNIQUE, status text DEFAULT 'active', plan_code text DEFAULT 'agency',
        entitlement_enabled boolean DEFAULT false, monthly_price_cents int DEFAULT 29900, stripe_quantity int DEFAULT 1,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE access_workspace_members(workspace_id uuid REFERENCES access_workspaces(id), user_id text, role text,
        invited_by text, joined_at timestamptz DEFAULT now(), PRIMARY KEY(workspace_id,user_id));
      CREATE TABLE organization_search_documents(organization_id text PRIMARY KEY, name text, slug text, payload jsonb DEFAULT '{}');
      ALTER TABLE organization_search_documents ADD COLUMN organization_node_id bigint;
      CREATE TABLE project_search_documents(project_id text PRIMARY KEY, name text, slug text, payload jsonb DEFAULT '{}');
      CREATE TABLE job_search_owners(job_node_id bigint, organization_node_id bigint);
      CREATE TABLE inspect_audits(workspace_id uuid, actor_user_id text, profile_node_id bigint,
        action text, revealed_fields text[], request_fingerprint text, created_at timestamptz DEFAULT now());
      CREATE TABLE job_search_documents(job_node_id bigint PRIMARY KEY, short_uuid text UNIQUE, organization_id text, project_id text,
        title text, location text, online boolean DEFAULT true, blocked boolean DEFAULT false, legacy_list_eligible boolean DEFAULT true,
        tags text[] DEFAULT '{engineering}', access text DEFAULT 'public', organization_has_expert_jobs boolean DEFAULT false,
        published_timestamp bigint);
      ALTER TABLE job_search_documents ADD COLUMN payload jsonb DEFAULT '{}';
      INSERT INTO graph_nodes VALUES (1,'User','{"wallet":"member"}'),(2,'UserEmail','{"email":"member@example.com","main":true}'),
        (3,'User','{"wallet":"other"}'),(4,'UserEmail','{"email":"other@example.com","main":true}'),
        (5,'EntityProfile','{"id":"agency-profile","name":"Agency"}'),(6,'EntityProfile','{"id":"other-profile"}'),
        (7,'StructuredJobpost','{"shortUUID":"old-absent"}'),(8,'StructuredJobpost','{"shortUUID":"old-active"}'),
        (9,'UserUnverifiedEmail','{"email":"unverified@example.com","main":true}'),(10,'User','{"wallet":"unverified"}');
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES (1,2,'HAS_EMAIL'),(3,4,'HAS_EMAIL'),(10,9,'HAS_EMAIL');
      INSERT INTO graph_nodes VALUES
        (20,'UserPermission','{"name":"USER"}'),(21,'UserPermission','{"name":"SUPER_ADMIN"}'),
        (22,'User','{"wallet":"did:privy:agency-member"}'),(23,'User','{"wallet":"outsider"}'),
        (24,'User','{"wallet":"platform-admin"}'),
        (25,'EntityProfile','{"id":"private-profile","slug":"private-profile"}'),
        (26,'ProfileInfo','{"email":"private@example.com","description":"Profile"}'),
        (99,'StructuredJobpost','{"shortUUID":"old-active","paysBounty":true,"bountyAmount":"$1000"}');
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES
        (1,20,'HAS_PERMISSION'),(3,20,'HAS_PERMISSION'),(22,20,'HAS_PERMISSION'),
        (23,20,'HAS_PERMISSION'),(24,21,'HAS_PERMISSION'),(25,26,'HAS_PROFILE_INFO');
      INSERT INTO access_workspaces(id,primary_profile_node_id,owner_user_id,normalized_registrable_domain) VALUES
        ('${workspaceId}',5,'member','agency.example'),('${otherWorkspaceId}',6,'other','other.example');
      INSERT INTO access_workspace_members(workspace_id,user_id,role) VALUES ('${workspaceId}','member','owner'),
        ('${workspaceId}','other','viewer'),('${otherWorkspaceId}','other','owner'),('${workspaceId}','unverified','viewer');
      INSERT INTO access_workspace_members(workspace_id,user_id,role) VALUES
        ('${workspaceId}','did:privy:agency-member','analyst');
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
      const module = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            { name: "default", ttl: 60_000, limit: 1000 },
          ]),
        ],
        controllers: [
          AccessWorkspacesController,
          InspectController,
          UserController,
          AgencyAlertsAdminController,
        ],
        providers: [
          AuthService,
          PBACGuard,
          { provide: JwtService, useValue: new JwtService() },
          {
            provide: ConfigService,
            useValue: new ConfigService({
              JWT_SECRET: "agency-bundle-http-secret",
              JWT_EXPIRES_IN: "1h",
            }),
          },
          { provide: GraphRepository, useValue: new GraphRepository(postgres) },
          {
            provide: AccessWorkspacesService,
            useValue: new AccessWorkspacesService(access),
          },
          { provide: AgencyAlertsAdminService, useValue: admin },
          // Keep external candidate/report retrieval at the service boundary.
          // JWT identity, permissions, memberships and product authorization use PostgreSQL.
          { provide: UserService, useValue: users },
          { provide: ScorerService, useValue: scorer },
          { provide: SubscriptionsService, useValue: subscriptions },
          { provide: ProfileService, useValue: {} },
          { provide: StripeService, useValue: {} },
          { provide: PermissionService, useValue: {} },
        ],
      }).compile();
      auth = module.get(AuthService);
      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (pool) {
        await pool.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool.end();
      }
    });

    beforeEach(async () => {
      jest.clearAllMocks();
      users.getUsersAvailableForWork.mockResolvedValue({
        success: true,
        data: { candidates: [{ wallet: "public-opt-in" }] },
      });
      users.getTopUsers.mockResolvedValue({
        success: true,
        data: { candidates: [{ wallet: "public-opt-in" }] },
      });
      users.getAgencyCandidateReport.mockResolvedValue({
        success: true,
        data: { candidate: { wallet: "public-opt-in" } },
      });
      scorer.getCandidateReport.mockResolvedValue({
        success: true,
        data: { user: { github: "light-fury" } },
      });
      await pool.query(`TRUNCATE agency_alert_follows CASCADE;
      DELETE FROM job_search_documents WHERE job_node_id <> 99;
      UPDATE access_workspaces SET alerts_enabled = true, status = 'active', entitlement_enabled = false, plan_code = 'agency';
      UPDATE graph_nodes SET properties = properties - 'banned' WHERE label = 'EntityProfile';
      UPDATE graph_nodes SET label='UserEmail', properties='{"email":"member@example.com","main":true}' WHERE id=2;
      UPDATE graph_nodes SET properties='{"email":"other@example.com","main":true}' WHERE id=4;
      DELETE FROM graph_relationships WHERE source_id=1 AND type='HAS_EMAIL';
      INSERT INTO graph_relationships(source_id,target_id,type) VALUES (1,2,'HAS_EMAIL');
      INSERT INTO access_workspace_members(workspace_id,user_id,role) VALUES ('${workspaceId}','other','viewer') ON CONFLICT DO NOTHING;
      INSERT INTO access_workspace_members(workspace_id,user_id,role) VALUES
        ('${workspaceId}','did:privy:agency-member','analyst') ON CONFLICT DO NOTHING;
      TRUNCATE inspect_audits;
    `);
    });

    function tokenFor(address: string): string {
      return auth.createToken({
        address,
        permissions: [],
        cryptoNative: false,
      });
    }

    async function expectBundleAccess(
      token: string,
      status: number,
    ): Promise<void> {
      for (const path of bundlePaths) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set("Authorization", `Bearer ${token}`)
          .expect(status);
        if (status === 200) {
          expect(response.body.success).toBe(true);
        } else {
          expect(response.body.message).toBe(
            "Agency partner approval or an active Agency subscription is required",
          );
        }
      }
    }

    it.each(["active", "cancelled", "expired"])(
      "serves all bundle APIs to the current approved unpaid Privy member with %s billing",
      async status => {
        await pool.query("UPDATE access_workspaces SET status=$2 WHERE id=$1", [
          workspaceId,
          status,
        ]);
        const token = tokenFor("did:privy:agency-member");
        const billing = await pool.query(
          `SELECT status, entitlement_enabled, plan_code, monthly_price_cents, stripe_quantity
         FROM access_workspaces WHERE id=$1`,
          [workspaceId],
        );
        await expectBundleAccess(token, 200);
        const bounties = await request(app.getHttpServer())
          .get(bundlePaths[0])
          .set("Authorization", `Bearer ${token}`)
          .expect(200);
        expect(bounties.body.data).toMatchObject({
          summary: { bountyJobCount: 1 },
          jobs: [expect.objectContaining({ shortUUID: "old-active" })],
        });
        expect(users.getUsersAvailableForWork).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceId }),
        );
        expect(users.getAgencyCandidateReport).toHaveBeenCalledWith(
          "public-opt-in",
        );
        expect(scorer.getCandidateReport).toHaveBeenCalledWith(
          "light-fury",
          undefined,
        );
        expect(subscriptions.getSubscriptionInfoByOrgId).not.toHaveBeenCalled();
        expect(
          await access.authorize(workspaceId, "did:privy:agency-member"),
        ).toMatchObject({ entitled: false, alertsEnabled: true });
        expect(
          (
            await pool.query(
              `SELECT status, entitlement_enabled, plan_code, monthly_price_cents, stripe_quantity
             FROM access_workspaces WHERE id=$1`,
              [workspaceId],
            )
          ).rows,
        ).toEqual(billing.rows);
      },
    );

    it("revokes the whole unpaid bundle immediately and restores it on approval with the same JWT", async () => {
      const token = tokenFor("did:privy:agency-member");
      await expectBundleAccess(token, 200);
      await admin.approve(workspaceId, "platform-admin", false);
      jest.clearAllMocks();
      await expectBundleAccess(token, 403);
      expect(users.getUsersAvailableForWork).not.toHaveBeenCalled();
      expect(users.getTopUsers).not.toHaveBeenCalled();
      expect(users.getAgencyCandidateReport).not.toHaveBeenCalled();
      expect(scorer.getCandidateReport).not.toHaveBeenCalled();
      await admin.approve(workspaceId, "platform-admin", true);
      await expectBundleAccess(token, 200);
    });

    it("denies removed members and outsiders despite another member's approval", async () => {
      const token = tokenFor("did:privy:agency-member");
      await expectBundleAccess(token, 200);
      await admin.removeMember(workspaceId, "did:privy:agency-member");
      await expectBundleAccess(token, 403);
      await expectBundleAccess(tokenFor("outsider"), 403);
      await request(app.getHttpServer())
        .get(
          `/users/available/top?workspaceId=${workspaceId}&userId=member&address=member`,
        )
        .set("Authorization", `Bearer ${tokenFor("outsider")}`)
        .expect(403);
      await request(app.getHttpServer()).get(bundlePaths[0]).expect(403);
    });

    it("denies banned or non-Agency partner profiles without a paid grant", async () => {
      const token = tokenFor("did:privy:agency-member");
      await pool.query(
        `UPDATE graph_nodes SET properties=properties || '{"banned":true}' WHERE id=5`,
      );
      await expectBundleAccess(token, 403);
      await pool.query(
        `UPDATE graph_nodes SET properties=properties - 'banned' WHERE id=5;
       UPDATE access_workspaces SET plan_code='other' WHERE id='${workspaceId}'`,
      );
      await expectBundleAccess(token, 403);
    });

    it("preserves paid-only access independently of Alert approval and requires active paid state", async () => {
      const token = tokenFor("did:privy:agency-member");
      await admin.approve(workspaceId, "platform-admin", false);
      await pool.query(
        "UPDATE access_workspaces SET entitlement_enabled=true WHERE id=$1",
        [workspaceId],
      );
      await expectBundleAccess(token, 200);
      expect(
        await access.authorize(workspaceId, "did:privy:agency-member"),
      ).toMatchObject({ entitled: true, alertsEnabled: false });
      expect(await repository.follow(workspaceId, "member", "org")).toBe(false);
      await request(app.getHttpServer())
        .post("/inspect/profiles/private-profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ workspaceId })
        .expect(201);
      const reveal = await request(app.getHttpServer())
        .post("/inspect/profiles/private-profile/reveal")
        .set("Authorization", `Bearer ${token}`)
        .send({ workspaceId, fields: ["info.email"] })
        .expect(201);
      expect(reveal.body.data).toEqual({ "info.email": "private@example.com" });
      await pool.query(
        "UPDATE access_workspaces SET status='cancelled' WHERE id=$1",
        [workspaceId],
      );
      await expectBundleAccess(token, 403);
      await pool.query(
        "UPDATE access_workspaces SET status='active' WHERE id=$1",
        [workspaceId],
      );
      await admin.removeMember(workspaceId, "did:privy:agency-member");
      await expectBundleAccess(token, 403);
    });

    it("does not grant private profile/contact, employer management or administrator access", async () => {
      const token = auth.createToken({
        address: "did:privy:agency-member",
        permissions: ["SUPER_ADMIN", "ORG_MEMBER", "ORG_OWNER"],
        cryptoNative: false,
      });
      await expectBundleAccess(token, 200);
      for (const path of [
        "/inspect/profiles/private-profile",
        "/inspect/profiles/private-profile/reveal",
      ]) {
        await request(app.getHttpServer())
          .post(path)
          .set("Authorization", `Bearer ${token}`)
          .send({ workspaceId, fields: ["info.email"] })
          .expect(403);
      }
      expect((await pool.query("SELECT * FROM inspect_audits")).rows).toEqual(
        [],
      );
      for (const path of [
        "/users/admin/available",
        "/users/admin/available/top",
        "/users/admin/available/public-opt-in/report",
        "/users/admin/candidate-report/light-fury",
        "/access-workspaces/admin/bounty-opportunities",
        "/users/org/org/talent-lists",
      ]) {
        await request(app.getHttpServer())
          .get(path)
          .set("Authorization", `Bearer ${token}`)
          .expect(403);
      }
      await request(app.getHttpServer())
        .post("/users/org/org/talent-lists")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Unauthorized list" })
        .expect(403);
      await request(app.getHttpServer())
        .post("/users/note")
        .set("Authorization", `Bearer ${token}`)
        .send({ wallet: "public-opt-in", note: "Unauthorized note" })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/agency-alerts/admin/workspaces/${workspaceId}/approval`)
        .set("Authorization", `Bearer ${token}`)
        .send({ enabled: true })
        .expect(403);
      expect(users.getTalentLists).not.toHaveBeenCalled();
      expect(users.createTalentList).not.toHaveBeenCalled();
      expect(users.addUserNote).not.toHaveBeenCalled();
      expect(subscriptions.getSubscriptionInfoByOrgId).not.toHaveBeenCalled();
      expect(
        await access.authorize(workspaceId, "did:privy:agency-member"),
      ).toMatchObject({ entitled: false, alertsEnabled: true });
    });

    it("retains superadmin bundle endpoints without Agency membership", async () => {
      const token = tokenFor("platform-admin");
      expect(await access.authorize(workspaceId, "platform-admin")).toBeNull();
      for (const path of [
        "/access-workspaces/admin/bounty-opportunities",
        "/users/admin/available",
        "/users/admin/available/top",
        "/users/admin/available/public-opt-in/report",
        "/users/admin/candidate-report/light-fury",
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set("Authorization", `Bearer ${token}`)
          .expect(200);
        expect(response.body.success).toBe(true);
      }
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
      expect(await repository.follow(workspaceId, "outsider", "org")).toBe(
        false,
      );
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
        expect(await repository.follow(workspaceId, "member", "org")).toBe(
          true,
        );
        await publish(`free-${status}`);
        const claim = await repository.claim();
        expect(await repository.prepare(claim!)).toHaveLength(1);
        await admin.approve(workspaceId, "platform-admin", false);
        expect(await repository.prepare(claim!)).toBeNull();
        expect(
          await repository.follow(workspaceId, "member", "other-org"),
        ).toBe(false);
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
  },
);
