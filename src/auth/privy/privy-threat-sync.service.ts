import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { createHash } from "node:crypto";
import { EntityManager } from "typeorm";
import { User } from "@privy-io/server-auth";
import { PostgresService } from "src/postgres/postgres.service";
import { CustomLogger } from "src/shared/utils/custom-logger";

type PrivyGithubAccount = {
  type: string;
  username?: string;
  subject?: string;
  first_verified_at?: number;
  latest_verified_at?: number;
  verified_at?: number;
};

type PrivyUserResponse = {
  id: string;
  created_at?: number;
  linked_accounts?: PrivyGithubAccount[];
};

type PrivyPage = {
  data?: PrivyUserResponse[];
  next_cursor?: string | null;
};

type MinimalPrivyAccount = {
  privyId: string;
  subjectHash: string;
  githubLogin: string;
  githubUserId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type PrivyThreatSyncStatus = {
  running: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  privyUsersScanned: number;
  githubAccountsSynced: number;
};

@Injectable()
export class PrivyThreatSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new CustomLogger(PrivyThreatSyncService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private initialTimer: NodeJS.Timeout | null = null;
  private status: PrivyThreatSyncStatus = {
    running: false,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastError: null,
    privyUsersScanned: 0,
    githubAccountsSynced: 0,
  };

  constructor(
    config: ConfigService,
    private readonly postgres: PostgresService,
  ) {
    this.appId = config.getOrThrow<string>("PRIVY_APP_ID");
    this.appSecret = config.getOrThrow<string>("PRIVY_APP_SECRET");
  }

  onModuleInit(): void {
    if (process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1") return;
    this.initialTimer = setTimeout(() => void this.sync(), 60_000);
    this.initialTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  getStatus(): PrivyThreatSyncStatus {
    return { ...this.status };
  }

  /**
   * Enroll a newly authenticated/updated Privy identity immediately. This is
   * deliberately best-effort so threat telemetry can never block login.
   */
  async syncUser(user: User): Promise<boolean> {
    if (!user?.id) return false;
    try {
      const github = user.linkedAccounts
        ?.filter(account => account.type === "github_oauth")
        .sort(
          (left, right) =>
            this.dateMillis(right.latestVerifiedAt ?? right.verifiedAt) -
            this.dateMillis(left.latestVerifiedAt ?? left.verifiedAt),
        )[0];
      const subjectHash = this.subjectHash(user.id);
      const githubLogin =
        github?.type === "github_oauth"
          ? this.githubLogin(github.username)
          : null;
      await this.postgres.transaction(async manager => {
        await this.ensureSchema(manager);
        if (!githubLogin || github?.type !== "github_oauth") {
          await manager.query(
            `UPDATE threat_intel.jobstash_privy_accounts
             SET active = false, synced_at = now()
             WHERE privy_subject_hash = $1 AND active`,
            [subjectHash],
          );
          return;
        }
        const createdAt = this.dateValue(user.createdAt) ?? new Date();
        const firstSeenAt = this.dateValue(github.firstVerifiedAt) ?? createdAt;
        const lastSeenAt =
          this.dateValue(github.latestVerifiedAt ?? github.verifiedAt) ??
          firstSeenAt;
        await manager.query(
          `INSERT INTO threat_intel.jobstash_privy_accounts (
             privy_subject_hash, github_login, github_user_id, first_seen_at,
             last_seen_at, jobstash_user_node_id, active, synced_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             (
               SELECT id FROM graph_nodes
               WHERE label = 'User' AND properties ->> 'privyId' = $6
               ORDER BY id LIMIT 1
             ),
             true, now()
           )
           ON CONFLICT (privy_subject_hash) DO UPDATE SET
             github_login = EXCLUDED.github_login,
             github_user_id = EXCLUDED.github_user_id,
             first_seen_at = LEAST(
               threat_intel.jobstash_privy_accounts.first_seen_at,
               EXCLUDED.first_seen_at
             ),
             last_seen_at = GREATEST(
               threat_intel.jobstash_privy_accounts.last_seen_at,
               EXCLUDED.last_seen_at
             ),
             jobstash_user_node_id = COALESCE(
               EXCLUDED.jobstash_user_node_id,
               threat_intel.jobstash_privy_accounts.jobstash_user_node_id
             ),
             active = true,
             synced_at = now()`,
          [
            subjectHash,
            githubLogin,
            String(github.subject ?? ""),
            firstSeenAt,
            lastSeenAt,
            user.id,
          ],
        );
      });
      return Boolean(githubLogin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Privy incremental threat-account sync failed: ${message}`,
      );
      return false;
    }
  }

  @Cron("0 2 * * *", { name: "privy-threat-account-sync", timeZone: "UTC" })
  async sync(): Promise<PrivyThreatSyncStatus> {
    if (process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1")
      return this.getStatus();
    if (this.status.running) return this.getStatus();
    this.status = {
      ...this.status,
      running: true,
      lastStartedAt: new Date().toISOString(),
      lastError: null,
    };
    try {
      const { accounts, userCount } = await this.fetchAccounts();
      if (userCount === 0)
        throw new Error(
          "Privy returned zero users; refusing to deactivate the current account snapshot",
        );
      await this.replaceAccounts(accounts);
      this.status = {
        running: false,
        lastStartedAt: this.status.lastStartedAt,
        lastCompletedAt: new Date().toISOString(),
        lastError: null,
        privyUsersScanned: userCount,
        githubAccountsSynced: accounts.length,
      };
      this.logger.log(
        `Synced ${accounts.length} GitHub identities from ${userCount} Privy users`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = { ...this.status, running: false, lastError: message };
      this.logger.error(`Privy threat-account sync failed: ${message}`);
    }
    return this.getStatus();
  }

  private async fetchAccounts(): Promise<{
    accounts: MinimalPrivyAccount[];
    userCount: number;
  }> {
    const accounts = new Map<string, MinimalPrivyAccount>();
    const authorization = Buffer.from(
      `${this.appId}:${this.appSecret}`,
    ).toString("base64");
    let cursor = "";
    let userCount = 0;
    for (let page = 0; page < 10_000; page += 1) {
      const url = new URL("https://api.privy.io/v1/users");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const body = await this.fetchPage(url, authorization);
      const users = Array.isArray(body.data) ? body.data : [];
      userCount += users.length;
      for (const user of users) {
        const github = (user.linked_accounts ?? [])
          .filter(account => account.type === "github_oauth")
          .sort(
            (left, right) =>
              (right.latest_verified_at ?? right.verified_at ?? 0) -
              (left.latest_verified_at ?? left.verified_at ?? 0),
          )[0];
        const githubLogin = this.githubLogin(github?.username);
        if (!githubLogin || !user.id) continue;
        const createdAt = this.epochDate(user.created_at) ?? new Date();
        const firstSeenAt =
          this.epochDate(github?.first_verified_at) ?? createdAt;
        const lastSeenAt =
          this.epochDate(github?.latest_verified_at ?? github?.verified_at) ??
          firstSeenAt;
        const subjectHash = this.subjectHash(user.id);
        accounts.set(subjectHash, {
          privyId: user.id,
          subjectHash,
          githubLogin,
          githubUserId: String(github?.subject ?? ""),
          firstSeenAt,
          lastSeenAt,
        });
      }
      cursor = body.next_cursor ?? "";
      if (!cursor) return { accounts: [...accounts.values()], userCount };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Privy pagination exceeded safety limit");
  }

  private async fetchPage(url: URL, authorization: string): Promise<PrivyPage> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(url, {
        headers: {
          authorization: `Basic ${authorization}`,
          "privy-app-id": this.appId,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return (await response.json()) as PrivyPage;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Privy users endpoint returned ${response.status}`);
      }
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(30_000, 1_000 * 2 ** attempt)),
      );
    }
    throw new Error("Privy users endpoint retry budget exhausted");
  }

  private async replaceAccounts(
    accounts: MinimalPrivyAccount[],
  ): Promise<void> {
    await this.postgres.transaction(async manager => {
      await this.ensureSchema(manager);
      await manager.query(`
        CREATE TEMP TABLE jobstash_privy_accounts_sync (
          privy_id text NOT NULL,
          privy_subject_hash text PRIMARY KEY,
          github_login text NOT NULL,
          github_user_id text NOT NULL,
          first_seen_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL
        ) ON COMMIT DROP
      `);
      for (let offset = 0; offset < accounts.length; offset += 250) {
        await this.insertAccountBatch(
          manager,
          accounts.slice(offset, offset + 250),
        );
      }
      await manager.query(`
        INSERT INTO threat_intel.jobstash_privy_accounts (
          privy_subject_hash, github_login, github_user_id, first_seen_at,
          last_seen_at, jobstash_user_node_id, active, synced_at
        )
        SELECT
          sync.privy_subject_hash, sync.github_login, sync.github_user_id,
          sync.first_seen_at, sync.last_seen_at,
          (
            SELECT id FROM graph_nodes
            WHERE label = 'User' AND properties ->> 'privyId' = sync.privy_id
            ORDER BY id LIMIT 1
          ),
          true, now()
        FROM jobstash_privy_accounts_sync sync
        ON CONFLICT (privy_subject_hash) DO UPDATE SET
          github_login = EXCLUDED.github_login,
          github_user_id = EXCLUDED.github_user_id,
          first_seen_at = LEAST(
            threat_intel.jobstash_privy_accounts.first_seen_at,
            EXCLUDED.first_seen_at
          ),
          last_seen_at = GREATEST(
            threat_intel.jobstash_privy_accounts.last_seen_at,
            EXCLUDED.last_seen_at
          ),
          jobstash_user_node_id = COALESCE(
            EXCLUDED.jobstash_user_node_id,
            threat_intel.jobstash_privy_accounts.jobstash_user_node_id
          ),
          active = true,
          synced_at = now();

        UPDATE threat_intel.jobstash_privy_accounts account
        SET active = false, synced_at = now()
        WHERE account.active
          AND NOT EXISTS (
            SELECT 1
            FROM jobstash_privy_accounts_sync current
            WHERE current.privy_subject_hash = account.privy_subject_hash
          )
      `);
    });
  }

  private async insertAccountBatch(
    manager: EntityManager,
    accounts: MinimalPrivyAccount[],
  ): Promise<void> {
    if (!accounts.length) return;
    const parameters: unknown[] = [];
    const values = accounts.map((account, index) => {
      const start = index * 6;
      parameters.push(
        account.privyId,
        account.subjectHash,
        account.githubLogin,
        account.githubUserId,
        account.firstSeenAt,
        account.lastSeenAt,
      );
      return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6})`;
    });
    await manager.query(
      `INSERT INTO jobstash_privy_accounts_sync
         (privy_id, privy_subject_hash, github_login, github_user_id, first_seen_at, last_seen_at)
       VALUES ${values.join(", ")}`,
      parameters,
    );
  }

  private githubLogin(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const login = value.trim().replace(/^@/, "").toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{0,99}$/.test(login) ? login : null;
  }

  private subjectHash(privyId: string): string {
    return createHash("sha256").update(`privy:${privyId}`).digest("hex");
  }

  private dateMillis(value: unknown): number {
    return this.dateValue(value)?.valueOf() ?? 0;
  }

  private dateValue(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.valueOf())) return date;
    }
    return null;
  }

  private async ensureSchema(manager: EntityManager): Promise<void> {
    await manager.query(`
      CREATE SCHEMA IF NOT EXISTS threat_intel;
      CREATE TABLE IF NOT EXISTS threat_intel.jobstash_privy_accounts (
        privy_subject_hash text PRIMARY KEY,
        github_login text NOT NULL,
        github_user_id text NOT NULL DEFAULT '',
        jobstash_user_node_id bigint,
        first_seen_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        active boolean NOT NULL DEFAULT true,
        synced_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE threat_intel.jobstash_privy_accounts
        ADD COLUMN IF NOT EXISTS jobstash_user_node_id bigint;
      CREATE INDEX IF NOT EXISTS jobstash_privy_accounts_github_idx
        ON threat_intel.jobstash_privy_accounts (lower(github_login))
        WHERE active;
    `);
  }

  private epochDate(value: unknown): Date | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return null;
    const date = new Date(value * 1_000);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
}
