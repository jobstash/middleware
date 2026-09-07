import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { createHash, randomBytes } from "node:crypto";
import { MailService } from "src/mail/mail.service";
import {
  EmailDigestRepository,
  EmailDigestState,
} from "src/postgres/email-digest.repository";
import { button, emailBuilder, text } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ProfileService } from "./profile.service";
import { isRecentWeeklyJob, weeklyJobsEmail } from "./weekly-jobs-email";

const CONFIRMATION_LIFETIME_MS = 48 * 60 * 60 * 1000;
const WEEKLY_DIGEST_CRON = "0 8 * * 1";

const token = (): string => randomBytes(32).toString("base64url");
const tokenHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class EmailDigestService {
  private readonly logger = new CustomLogger(EmailDigestService.name);
  private readonly from: string;
  private readonly frontend: string;

  constructor(
    private readonly repository: EmailDigestRepository,
    private readonly profileService: ProfileService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {
    this.from = this.config.getOrThrow<string>("EMAIL");
    this.frontend = this.config
      .getOrThrow<string>("FE_DOMAIN")
      .replace(/\/$/, "");
  }

  getState(wallet: string): Promise<EmailDigestState> {
    return this.repository.getState(wallet);
  }

  async requestConfirmation(wallet: string): Promise<EmailDigestState> {
    const confirmationToken = token();
    const confirmationHash = tokenHash(confirmationToken);
    const requested = await this.repository.requestConfirmation(
      wallet,
      confirmationHash,
      new Date(Date.now() + CONFIRMATION_LIFETIME_MS),
    );
    if (!requested) return this.repository.getState(wallet);

    const confirmationUrl = `${this.frontend}/email/confirm?token=${encodeURIComponent(confirmationToken)}`;
    try {
      await this.mailService.sendEmail(
        emailBuilder({
          from: this.from,
          to: requested.email,
          subject: "Confirm your weekly JobStash email",
          previewText: "Confirm weekly job matches from JobStash.",
          title: "Confirm weekly jobs",
          bodySections: [
            text("One email a week with fresh jobs selected for you."),
            button("Confirm weekly email", confirmationUrl),
            text("This link expires in 48 hours."),
          ],
        }),
      );
    } catch (error) {
      await this.repository.cancelPending(confirmationHash);
      throw error;
    }
    return this.repository.getState(wallet);
  }

  confirm(confirmationToken: string): Promise<boolean> {
    return this.repository.confirm(tokenHash(confirmationToken));
  }

  unsubscribeWallet(wallet: string): Promise<boolean> {
    return this.repository.unsubscribeWallet(wallet);
  }

  unsubscribeToken(unsubscribeToken: string): Promise<boolean> {
    return this.repository.unsubscribeToken(tokenHash(unsubscribeToken));
  }

  @Cron(WEEKLY_DIGEST_CRON, {
    name: "weekly-user-job-digest",
    timeZone: "Europe/Amsterdam",
  })
  async sendWeeklyDigests(): Promise<void> {
    if (process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1") return;
    if (this.config.get<string>("ENVIRONMENT") !== "production") return;

    const recipients = await this.repository.getRecipients();
    for (let index = 0; index < recipients.length; index += 5) {
      await Promise.all(
        recipients
          .slice(index, index + 5)
          .map(async recipient => this.sendDigest(recipient)),
      );
    }
  }

  private async sendDigest(recipient: {
    userNodeId: string;
    wallet: string;
    email: string;
  }): Promise<void> {
    let sent = false;
    let claimed = false;
    try {
      claimed = await this.repository.claimWeek(recipient.userNodeId);
      if (!claimed) return;
      const recommendations = await this.profileService.getRecommendedJobs(
        recipient.wallet,
        3,
        "weekly_email",
      );
      const now = Date.now();
      const jobs = recommendations.jobs
        .map(({ job }) => job)
        .filter(job => isRecentWeeklyJob(job, now))
        .slice(0, 3);
      if (jobs.length === 0) {
        await this.repository.releaseWeek(recipient.userNodeId);
        return;
      }

      const unsubscribeToken = token();
      const stillSubscribed = await this.repository.setUnsubscribeToken(
        recipient.userNodeId,
        tokenHash(unsubscribeToken),
        recipient.email,
      );
      if (!stillSubscribed) return;
      const unsubscribeUrl = `${this.frontend}/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
      const oneClickUnsubscribeUrl = `${this.frontend}/api/email-digest/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
      const message = weeklyJobsEmail({
        from: this.from,
        to: recipient.email,
        frontend: this.frontend,
        unsubscribeUrl,
        jobs,
      });
      message.headers = {
        ...message.headers,
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
      await this.mailService.sendEmail(message);
      sent = true;
      await this.repository.markSent(
        recipient.userNodeId,
        jobs.map(job => job.shortUUID),
        recommendations.rankingVersion,
        tokenHash(unsubscribeToken),
      );
    } catch (error) {
      // Never resend a delivered message because recording its receipt failed.
      if (claimed && !sent)
        await this.repository
          .releaseWeek(recipient.userNodeId)
          .catch(() => undefined);
      this.logger.error(
        `Weekly digest failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
