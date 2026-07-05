import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse } from "express";
import {
  emailBuilder,
  raw,
  responseSchemaWrapper,
  text,
} from "src/shared/helpers";
import {
  data,
  Response,
  SessionObject,
  UserProfile,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PBACGuard } from "../../pbac.guard";
import { ProfileService } from "../profile.service";
import { MailService } from "src/mail/mail.service";
import { ConfigService } from "@nestjs/config";
import { UserService } from "src/user/user.service";
import * as Sentry from "@sentry/node";
import { RpcService } from "../../../user/rpc.service";
import { JobsService } from "src/jobs/jobs.service";
import { PrivyService } from "../../privy/privy.service";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";

const SOCIAL_LABELS = [
  "Website",
  "Lens",
  "LinkedIn",
  "X",
  "Telegram",
  "Discord",
  "Github",
  "Farcaster",
];

type ApplyStatusResponse =
  | { status: "can_apply"; applyUrl: string }
  | { status: "already_applied"; applyUrl: string }
  | { status: "ineligible"; missing: string[] };

type ApplyResponse =
  | { status: "applied" }
  | { status: "eligible"; applyUrl: string }
  | { status: "already_applied"; applyUrl: string }
  | { status: "ineligible"; missing: string[] }
  | { status: "not_found" }
  | { status: "error" };

@Controller("v2/profile")
export class ProfileV2Controller {
  private logger = new CustomLogger(ProfileV2Controller.name);
  constructor(
    private readonly rpcService: RpcService,
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly privyService: PrivyService,
  ) {}

  private async getEligibilityMissing(address: string): Promise<string[]> {
    const missing: string[] = [];

    const showcase = data(
      await this.profileService.getUserShowCase(address),
    );

    // Resume check
    const hasResume = showcase?.some(item => item.label === "CV");
    if (!hasResume) {
      missing.push("resume");
    }

    // Socials check: must have "Email" AND at least one other social
    const hasEmail = showcase?.some(item => item.label === "Email");
    const hasOtherSocial = showcase?.some(item =>
      SOCIAL_LABELS.includes(item.label),
    );
    if (!hasEmail || !hasOtherSocial) {
      missing.push("socials");
    }

    // Linked accounts check
    const privyId = await this.profileService.getPrivyId(address);
    if (!privyId) {
      missing.push("linked_accounts");
      return missing;
    }

    const privyUser = await this.privyService.getUserById(privyId);
    if (!privyUser?.linkedAccounts) {
      missing.push("linked_accounts");
      return missing;
    }

    const nonEmbeddedAccounts = privyUser.linkedAccounts.filter(
      account =>
        !(
          account.type === "wallet" &&
          (account as { walletClientType?: string }).walletClientType ===
            "privy"
        ),
    );

    if (nonEmbeddedAccounts.length === 0) {
      missing.push("linked_accounts");
    }

    return missing;
  }

  @Get("jobs/apply/status/:shortUUID")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Checks apply eligibility for a protected job for the currently logged in user",
  })
  async getApplyStatus(
    @Session() { address }: SessionObject,
    @Param("shortUUID") shortUUID: string,
  ): Promise<ApplyStatusResponse> {
    this.logger.log(`/v2/profile/jobs/apply/status/${shortUUID}`);

    const job = await this.jobsService.getJobDetailsByUuid(
      shortUUID,
      undefined,
      false,
    );

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const hasApplied = await this.profileService.verifyApplyInteraction(
      address,
      shortUUID,
    );

    if (hasApplied) {
      return { status: "already_applied", applyUrl: job.url };
    }

    if (job.access === "protected") {
      const missing = await this.getEligibilityMissing(address);
      if (missing.length > 0) {
        return { status: "ineligible", missing };
      }
    }

    return { status: "can_apply", applyUrl: job.url };
  }

  @Post("jobs/apply")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Logs the apply interaction on a job for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async logApplyInteraction(
    @Res({ passthrough: true }) res: ExpressResponse,
    @Session() { address }: SessionObject,
    @Body("shortUUID") shortUUID: string,
  ): Promise<ApplyResponse> {
    this.logger.log(`/v2/profile/jobs/apply`);

    try {
      const job = await this.jobsService.getJobDetailsByUuid(
        shortUUID,
        undefined,
        false,
      );

      if (!job) {
        return { status: "not_found" };
      }

      const hasApplied = await this.profileService.verifyApplyInteraction(
        address,
        shortUUID,
      );

      if (hasApplied) {
        return { status: "already_applied", applyUrl: job.url };
      }

      if (job.access === "protected") {
        const missing = await this.getEligibilityMissing(address);
        if (missing.length > 0) {
          return { status: "ineligible", missing };
        }

        await this.profileService.logApplyInteraction(address, shortUUID);
        return { status: "eligible", applyUrl: job.url };
      } else {
        const orgId = await this.userService.findOrgIdByJobShortUUID(shortUUID);

        const orgProfile = data(
          await this.userService.findOrgOwnerProfileByOrgId(orgId),
        );

        const jobs = await this.jobsService.getJobsByOrgId(orgId, undefined);

        const matchedJob = jobs.find(x => x.shortUUID === shortUUID);

        if (orgProfile && orgProfile.linkedAccounts?.email) {
          const ecosystems = await this.rpcService.getEcosystemsForWallet(
            address as string,
          );
          await this.mailService.sendEmail(
            emailBuilder({
              from: this.configService.getOrThrow<string>("EMAIL"),
              to: orgProfile.linkedAccounts?.email,
              subject: "New Applicant for Your Job Listing on JobStash",
              title: "Hi there,",
              bodySections: [
                text(
                  "A new applicant has applied to your job listing on JobStash. Please review the details below and follow up accordingly.",
                ),
                raw(`
                  Details:
                  <ul>
                    <li>Job Title: ${matchedJob.title}</li>
                    <li>Job URL: ${matchedJob.url}</li>
                  </ul>
                `),
                raw(`
                    ${
                      ecosystems.length > 0
                        ? `This candidate holds activations for the following ecosystems:
                          <ul>${ecosystems.map(x => `<li>${x}</li>`).join("")}</ul>`
                        : ""
                    }
                `),
                text(
                  "If you have any questions or need assistance, please don't hesitate to reach out to us.",
                ),
              ],
              footer: `Thank you for using JobStash,
              The JobStash Team
              `,
            }),
          );
          this.logger.log(`Email sent`);
        }
        await this.profileService.logApplyInteraction(address, shortUUID);
        return { status: "applied" };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profile-v2.controller",
        });
        scope.setExtra("input", { wallet: address });
        Sentry.captureException(err);
      });
      this.logger.log(`/v2/profile/jobs/apply ${JSON.stringify(err)}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return { status: "error" };
    }
  }
}
