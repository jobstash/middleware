import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MailService } from "src/mail/mail.service";
import { button, emailBuilder, slugify, text } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AgencyAlertsRepository } from "./agency-alerts.repository";
import {
  AgencyAlertState,
  AlertClaim,
  AlertOrganizationSearch,
} from "./agency-alerts.types";

const escape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AgencyAlertsService {
  private readonly logger = new CustomLogger(AgencyAlertsService.name);
  private running = false;

  constructor(
    private readonly repository: AgencyAlertsRepository,
    private readonly access: AccessWorkspacesRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private async membership(
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    const authorization = await this.access.authorize(workspaceId, userId);
    if (!authorization)
      throw new ForbiddenException("Workspace membership is required");
    return authorization.alertsEnabled;
  }

  async state(workspaceId: string, userId: string): Promise<AgencyAlertState> {
    const enabled = await this.membership(workspaceId, userId);
    const [recipient, follows] = await Promise.all([
      this.repository.recipient(userId),
      this.repository.follows(workspaceId, userId),
    ]);
    return {
      recipientEmail: recipient?.email ?? null,
      emailAvailable: Boolean(recipient),
      enabled,
      follows: follows.map(follow => ({
        ...follow,
        deliveryPaused: follow.deliveryPaused || !enabled,
      })),
      followCount: follows.length,
    };
  }
  async search(
    workspaceId: string,
    userId: string,
    query: string,
  ): Promise<AlertOrganizationSearch> {
    if (!(await this.membership(workspaceId, userId)))
      throw new ForbiddenException(
        "Platform-admin approval is required for Alert",
      );
    return {
      organizations: await this.repository.search(
        workspaceId,
        userId,
        query.trim().slice(0, 100),
      ),
    };
  }

  async follow(
    workspaceId: string,
    userId: string,
    organizationId: string,
  ): Promise<AgencyAlertState> {
    if (!(await this.membership(workspaceId, userId)))
      throw new ForbiddenException(
        "Platform-admin approval is required for Alert",
      );
    if (!(await this.repository.recipient(userId))) {
      throw new BadRequestException(
        "Verify an account email before following organizations",
      );
    }
    if (!(await this.repository.follow(workspaceId, userId, organizationId))) {
      throw new NotFoundException(
        "Organization or eligible recipient is no longer available",
      );
    }
    return this.state(workspaceId, userId);
  }

  async unfollow(
    workspaceId: string,
    userId: string,
    organizationId?: string,
  ): Promise<AgencyAlertState> {
    await this.membership(workspaceId, userId);
    await this.repository.unfollow(workspaceId, userId, organizationId);
    return this.state(workspaceId, userId);
  }

  private signature(target: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("JWT_SECRET"))
      .update(`agency-alert-unsubscribe:${target}`)
      .digest("base64url");
  }

  unsubscribeToken(workspaceId: string, userId: string): string {
    const target = `${workspaceId}.${Buffer.from(userId).toString("base64url")}`;
    return `${target}.${this.signature(target)}`;
  }

  private tokenTarget(token: string): { workspaceId: string; userId: string } {
    const [workspaceId, encodedUser, signature, extra] = token.split(".");
    if (
      !UUID.test(workspaceId ?? "") ||
      !/^[\w-]{1,267}$/.test(encodedUser ?? "") ||
      !/^[\w-]{43}$/.test(signature ?? "") ||
      extra !== undefined
    ) {
      throw new BadRequestException("Invalid unsubscribe link");
    }
    const target = `${workspaceId}.${encodedUser}`;
    if (
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(this.signature(target)),
      )
    ) {
      throw new BadRequestException("Invalid unsubscribe link");
    }
    return {
      workspaceId,
      userId: Buffer.from(encodedUser, "base64url").toString("utf8"),
    };
  }

  unsubscribePage(token: string): string {
    this.tokenTarget(token);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Stop JobStash alerts</title></head><body><main><h1>Stop organization alerts</h1><p>This stops all your organization follows in the agency workspace for this email. It does not change other members’ follows.</p><form method="post"><button type="submit">Stop my alerts</button></form></main></body></html>`;
  }

  async unsubscribe(token: string): Promise<void> {
    const target = this.tokenTarget(token);
    await this.repository.unfollow(target.workspaceId, target.userId);
  }

  @Cron("* * * * *", { name: "agency-organization-alerts" })
  async deliver(): Promise<void> {
    if (
      this.running ||
      process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1" ||
      this.config.get<string>("ENVIRONMENT") !== "production"
    )
      return;
    this.running = true;
    try {
      // Bound each tick, without polling the jobs catalogue or running matching/inference.
      for (let index = 0; index < 20; index++) {
        const claim = await this.repository.claim();
        if (!claim) break;
        await this.send(claim);
      }
    } catch (error) {
      this.logger.error(
        `Agency alert worker failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async send(claim: AlertClaim): Promise<void> {
    let accepted = false;
    try {
      const jobs = await this.repository.prepare(claim);
      if (!jobs) {
        await this.repository.finish(claim.id, "skipped");
        return;
      }
      const frontend = this.config
        .getOrThrow<string>("FE_DOMAIN")
        .replace(/\/$/, "");
      const admin = this.config
        .getOrThrow<string>("ORG_ADMIN_DOMAIN")
        .replace(/\/$/, "");
      const middleware = this.config
        .getOrThrow<string>("MW_DOMAIN")
        .replace(/\/$/, "");
      const unsubscribeUrl = `${middleware}/agency-alerts/unsubscribe?token=${encodeURIComponent(this.unsubscribeToken(claim.workspaceId, claim.userId))}`;
      const roleLinks = jobs.map(job => ({
        ...job,
        href: `${frontend}/${slugify(`${job.title}-${claim.organizationName}`)}/${encodeURIComponent(job.shortUUID)}?utm_source=agency_alert&utm_medium=email`,
      }));
      const intro = `${claim.organizationName}: ${jobs.length} new ${jobs.length === 1 ? "role" : "roles"} found on JobStash.`;
      const message = emailBuilder({
        from: this.config.getOrThrow<string>("EMAIL"),
        to: claim.recipientEmail,
        subject: `${claim.organizationName}: new roles on JobStash`,
        title: escape(intro),
        bodySections: [
          text(
            "You receive these alerts because you chose to follow this organization.",
          ),
          ...roleLinks.map(job =>
            text(
              `<a href="${escape(job.href)}">${escape(job.title || "Open role")}</a>${job.location ? ` — ${escape(job.location)}` : ""}`,
            ),
          ),
          button("Manage my follows", `${admin}/alerts`),
          text(
            `<a href="${escape(unsubscribeUrl)}">Stop all my alerts in this workspace</a>`,
          ),
        ],
      });
      message.text = `${intro}\n\n${roleLinks.map(job => `${job.title}${job.location ? ` — ${job.location}` : ""}\n${job.href}`).join("\n\n")}\n\nManage follows: ${admin}/alerts\nStop alerts: ${unsubscribeUrl}`;
      message.headers = {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
      await this.mail.sendEmail(message);
      accepted = true;
      await this.repository.finish(claim.id, "accepted");
    } catch (error) {
      // Never reopen a claim: provider errors/timeouts can happen after acceptance.
      if (!accepted)
        await this.repository
          .finish(claim.id, "failed_unknown")
          .catch(() => undefined);
      this.logger.error(
        `Agency alert ${claim.id} ${accepted ? "receipt recording" : "delivery"} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
