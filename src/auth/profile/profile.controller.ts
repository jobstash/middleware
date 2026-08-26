import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse } from "express";
import { OrganizationsService } from "src/organizations/organizations.service";
import {
  emailBuilder,
  raw,
  responseSchemaWrapper,
  text,
} from "src/shared/helpers";
import {
  data,
  JobPreferences,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
  UserOrg,
  UserProfile,
  UserRepo,
  UserVerificationStatus,
  UserVerifiedOrg,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PBACGuard } from "../pbac.guard";
import { RateOrgInput } from "./dto/rate-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";
import { ProfileService } from "./profile.service";
import { ReportInput } from "./dto/report.input";
import { MailService } from "src/mail/mail.service";
import { ConfigService } from "@nestjs/config";
import { UserService } from "src/user/user.service";
import * as Sentry from "@sentry/node";
import { RpcService } from "../../user/rpc.service";
import { JobsService } from "src/jobs/jobs.service";
import { UpdateDevLocationInput } from "./dto/update-dev-location.input";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { Throttle } from "@nestjs/throttler";
import { StripeService } from "src/stripe/stripe.service";
import { UpdateJobPreferencesInput } from "./dto/update-job-preferences.input";
import { RecordJobActivityInput } from "./dto/record-job-activity.input";
import { PrivyService } from "../privy/privy.service";

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

@Controller("profile")
export class ProfileController {
  private logger = new CustomLogger(ProfileController.name);
  constructor(
    private readonly rpcService: RpcService,
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly organizationsService: OrganizationsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly stripeService: StripeService,
    private readonly privyService: PrivyService,
  ) {}

  private async getEligibilityMissing(address: string): Promise<string[]> {
    const showcase = data(await this.profileService.getUserShowCase(address));
    const missing: string[] = [];
    if (!showcase?.some(item => item.label === "CV")) missing.push("resume");
    const hasEmail = showcase?.some(item => item.label === "Email");
    const hasSocial = showcase?.some(item =>
      SOCIAL_LABELS.includes(item.label),
    );
    if (!hasEmail || !hasSocial) missing.push("socials");

    const privyId = await this.profileService.getPrivyId(address);
    if (!privyId) return [...missing, "linked_accounts"];
    const privyUser = await this.privyService.getUserById(privyId);
    const externalAccounts = privyUser?.linkedAccounts?.filter(
      account =>
        !(
          account.type === "wallet" &&
          (account as { walletClientType?: string }).walletClientType ===
            "privy"
        ),
    );
    if (!externalAccounts?.length) missing.push("linked_accounts");
    return missing;
  }

  @Get("job-preferences")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  getJobPreferences(
    @Session() { address }: SessionObject,
  ): Promise<JobPreferences | null> {
    return this.profileService.getJobPreferences(address);
  }

  @Patch("job-preferences")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  updateJobPreferences(
    @Session() { address }: SessionObject,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateJobPreferencesInput,
  ): Promise<JobPreferences | null> {
    return this.profileService.updateJobPreferences(address, body);
  }

  @Get("info")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async getUserProfile(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    this.logger.log(`/profile/info`);
    return this.profileService.getUserProfile(address);
  }

  @Get("repositories")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the repos of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(PaginatedData<UserRepo>),
    }),
  })
  async getUserRepos(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true })) params: RepoListParams,
  ): Promise<PaginatedData<UserRepo> | ResponseWithNoData> {
    this.logger.log(`/profile/repositories`);

    return this.profileService.getUserRepos(address, params);
  }

  @Get("verification/status")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Returns the verification status of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserVerificationStatus>),
    }),
  })
  async getUserVerificationStatus(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<UserVerificationStatus>> {
    this.logger.log(`/profile/verification/status`);
    return this.profileService.getUserVerificationStatus(address);
  }

  @Get("organizations")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the organizations of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserOrg[]>),
    }),
  })
  async getUserOrgs(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<UserOrg[]>> {
    this.logger.log(`/profile/organizations`);

    return this.profileService.getUserOrgs(address);
  }

  @Get("organizations/verified")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Returns the verified organizations of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserVerifiedOrg[]>),
    }),
  })
  async getUserVerifiedOrgs(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<UserVerifiedOrg[]>> {
    this.logger.log(`/profile/organizations/verified`);

    return this.profileService.getUserVerifications(address);
  }

  @Get("showcase")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the showcase of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<{ label: string; url: string }[]>),
    }),
  })
  async getUserShowCase(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<{ label: string; url: string }[]>> {
    this.logger.log(`/profile/showcase`);

    return this.profileService.getUserShowCase(address);
  }

  @Get("skills")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the skills of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(
        Response<
          {
            id: string;
            name: string;
            normalizedName: string;
            canTeach: boolean;
          }[]
        >,
      ),
    }),
  })
  async getUserSkills(@Session() { address }: SessionObject): Promise<
    ResponseWithOptionalData<
      {
        id: string;
        name: string;
        normalizedName: string;
        canTeach: boolean;
      }[]
    >
  > {
    this.logger.log(`/profile/skills`);

    return this.profileService.getUserSkills(address);
  }

  @Post("availability")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Updates the availability of the currently logged in dev user",
  })
  async setUserAvailability(
    @Session() { address }: SessionObject,
    @Body("availability") availability: boolean,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/availability`);

    return this.profileService.updateUserAvailability(address, availability);
  }

  @Post("location")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Updates the location of the currently logged in dev user",
  })
  async setUserLocationInfo(
    @Session() { address }: SessionObject,
    @Body() body: UpdateDevLocationInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/location`);
    return this.profileService.updateUserLocationInfo(address, body);
  }

  @Post("showcase")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Updates the work credentials of the currently logged in user",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async updateUserShowCase(
    @Session() { address }: SessionObject,
    @Body() body: UpdateUserShowCaseInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/showcase`);

    return this.profileService.updateUserShowCase(address, body);
  }

  @Post("skills")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Updates the work credentials of the currently logged in user",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async updateUserSkills(
    @Session() { address }: SessionObject,
    @Body() body: UpdateUserSkillsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/skills`);

    return this.profileService.updateUserSkills(address, body);
  }

  @Post("delete")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Updates the profile of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async deleteUserAccount(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/delete ${address}`);

    const activeSubIds = await this.userService.getActiveSubscriptions(address);
    for (const subId of activeSubIds) {
      await this.stripeService.deleteSubscription(subId);
    }

    return this.userService.deletePrivyUser(address);
  }

  @Post("reviews/salary")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async reviewOrgSalary(
    @Session() { address }: SessionObject,
    @Body() params: ReviewOrgSalaryInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/reviews/salary`);

    const org = await this.organizationsService.findByOrgId(params.orgId);
    if (org) {
      return this.profileService.reviewOrgSalary(address, params);
    } else {
      return {
        success: false,
        message: "Invalid orgId or orgId not found",
      };
    }
  }

  @Post("reviews/rating")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async rateOrg(
    @Session() { address }: SessionObject,
    @Body() params: RateOrgInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/reviews/rating`);

    const org = await this.organizationsService.findByOrgId(params.orgId);
    if (org) {
      return this.profileService.rateOrg(address, params);
    } else {
      return {
        success: false,
        message: "Invalid orgId or orgId not found",
      };
    }
  }

  @Post("reviews/review")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async reviewOrg(
    @Session() { address }: SessionObject,
    @Body() params: ReviewOrgInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/reviews/review`);

    const org = await this.organizationsService.findByOrgId(params.orgId);
    if (org) {
      return this.profileService.reviewOrg(address, params);
    } else {
      return {
        success: false,
        message: "Invalid orgId or orgId not found",
      };
    }
  }

  @Post("report")
  @Throttle({
    default: {
      ttl: 60000,
      limit: 5,
    },
  })
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Generates and sends email reporting info from the user",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async reportReview(
    @Res({ passthrough: true }) res: ExpressResponse,
    @Session() session: SessionObject,
    @Body(new ValidationPipe({ transform: true }))
    body: ReportInput,
  ): Promise<ResponseWithNoData> {
    const { subject, description, ctx, attachments } = body;
    this.logger.log(
      `/profile/report ${JSON.stringify({ description, subject, ctx })}`,
    );
    const parsedUrl = new URL(ctx.url);
    const allowedHosts = this.configService
      .get<string>("ALLOWED_ORIGINS")
      .split(",")
      .map(origin => new URL(origin).host);
    if (allowedHosts.includes(parsedUrl.host)) {
      await this.mailService.sendEmail({
        ...emailBuilder({
          from: this.configService.getOrThrow<string>("EMAIL"),
          to: this.configService.getOrThrow<string>("REPORT_CONTENT_TO_EMAIL"),
          title: "User generated report",
          subject: subject,
          bodySections: [
            text(`Description: ${description}`),
            raw(`Relevant Information: <ul>
            <li>UI: ${ctx.ui}</li>
            <li>URL: ${ctx.url}</li>
            <li>User Address: ${session.address ?? "N/A"}</li>
            <li>User Permissions: ${session.permissions.join(", ")}</li>
            <li>Wallet Connected: ${session.address !== undefined}</li>
            <li>Signed In: ${session.address !== undefined}</li>
            <li>Other Info: ${JSON.stringify(
              ctx.other !== "" ? JSON.parse(ctx.other) : {},
              undefined,
              2,
            )}</li>
            <li>Time: ${new Date(ctx.ts).toDateString()}</li>
          </ul>`),
          ],
        }),
        attachments: attachments.map((x, index) => {
          const content = x.path.replace(/^data:image\/png;base64,/, "");
          return {
            content: content,
            filename: `attachment${index + 1}.png`,
            contentId: `${index + 1}`,
            disposition: "attachment",
          };
        }),
      });
      return {
        success: true,
        message: "Report filed successfully",
      };
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Invalid url",
      };
    }
  }

  @Post("repositories/contribution")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async updateRepoContribution(
    @Session() { address }: SessionObject,
    @Body() params: UpdateRepoContributionInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/repositories/contribution`);

    return this.profileService.updateRepoContribution(address, params);
  }

  @Post("repositories/tags")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async updateRepoTagsUsed(
    @Session() { address }: SessionObject,
    @Body() params: UpdateRepoTagsUsedInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/repositories/tags`);

    return this.profileService.updateRepoTagsUsed(address, params);
  }

  @Post("jobs/block-org/:orgId")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Blocks jobs from the passed org for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async blockOrgJobs(
    @Session() { address }: SessionObject,
    @Param("orgId") orgId: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/block-org`);

    const org = await this.organizationsService.findByOrgId(orgId);
    if (org) {
      return this.profileService.blockOrgJobs(address, orgId);
    } else {
      return {
        success: false,
        message: "Invalid orgId or orgId not found",
      };
    }
  }

  @Post("jobs/apply")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Logs the apply interaction on a job for the currently logged in user",
  })
  async logApplyInteraction(
    @Res({ passthrough: true }) res: ExpressResponse,
    @Session() { address }: SessionObject,
    @Body("shortUUID") shortUUID: string,
  ): Promise<ApplyResponse> {
    this.logger.log(`/profile/jobs/apply`);
    try {
      const job = await this.jobsService.getJobDetailsByUuid(
        shortUUID,
        undefined,
        false,
      );
      if (!job) return { status: "not_found" };
      if (
        await this.profileService.verifyApplyInteraction(address, shortUUID)
      ) {
        return { status: "already_applied", applyUrl: job.url };
      }
      if (job.access === "protected") {
        const missing = await this.getEligibilityMissing(address);
        if (missing.length > 0) return { status: "ineligible", missing };
        await this.profileService.logApplyInteraction(address, shortUUID);
        return { status: "eligible", applyUrl: job.url };
      }

      const orgId = await this.userService.findOrgIdByJobShortUUID(shortUUID);
      const orgProfile = data(
        await this.userService.findOrgOwnerProfileByOrgId(orgId),
      );
      if (orgProfile?.linkedAccounts?.email) {
        const ecosystems =
          await this.rpcService.getEcosystemsForWallet(address);
        await this.mailService.sendEmail(
          emailBuilder({
            from: this.configService.getOrThrow<string>("EMAIL"),
            to: orgProfile.linkedAccounts.email,
            subject: "New Applicant for Your Job Listing on JobStash",
            title: "Hi there,",
            bodySections: [
              text("A candidate applied to your job listing on JobStash."),
              raw(
                `<ul><li>Job Title: ${job.title}</li><li>Job URL: ${job.url}</li></ul>`,
              ),
              ecosystems.length
                ? raw(
                    `<p>Verified ecosystems:</p><ul>${ecosystems
                      .map(item => `<li>${item}</li>`)
                      .join("")}</ul>`,
                  )
                : text("No verified ecosystem activations were supplied."),
            ],
            footer: "Thank you for using JobStash,\nThe JobStash Team",
          }),
        );
      }
      await this.profileService.logApplyInteraction(address, shortUUID);
      return { status: "applied" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profile.controller",
        });
        scope.setExtra("input", { wallet: address });
        Sentry.captureException(err);
      });
      this.logger.log(`/profile/jobs/apply ${JSON.stringify(err)}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return { status: "error" };
    }
  }

  @Get("jobs/apply/status/:shortUUID")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  async getApplyStatus(
    @Session() { address }: SessionObject,
    @Param("shortUUID") shortUUID: string,
  ): Promise<ApplyStatusResponse> {
    const job = await this.jobsService.getJobDetailsByUuid(
      shortUUID,
      undefined,
      false,
    );
    if (!job) throw new NotFoundException("Job not found");
    if (await this.profileService.verifyApplyInteraction(address, shortUUID)) {
      return { status: "already_applied", applyUrl: job.url };
    }
    if (job.access === "protected") {
      const missing = await this.getEligibilityMissing(address);
      if (missing.length > 0) return { status: "ineligible", missing };
    }
    return { status: "can_apply", applyUrl: job.url };
  }

  @Post("jobs/view")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  logViewInteraction(
    @Session() { address }: SessionObject,
    @Body("shortUUID") shortUUID: string,
  ): Promise<ResponseWithNoData> {
    if (!shortUUID || shortUUID.length > 128) {
      return Promise.resolve({
        success: false,
        message: "Invalid job identifier",
      });
    }
    return this.profileService.logViewDetailsInteraction(address, shortUUID);
  }

  @Post("jobs/activity")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  recordJobActivity(
    @Session() { address }: SessionObject,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: RecordJobActivityInput,
  ): Promise<ResponseWithNoData> {
    return this.profileService.recordJobActivity(address, body);
  }

  @Post("jobs/bookmark")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description:
      "Logs the bookmark interaction on a job for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async logBookmarkInteraction(
    @Session() { address }: SessionObject,
    @Body("shortUUID") job: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/bookmark`);
    const isBookmarked = await this.profileService.verifyBookmarkInteraction(
      address,
      job,
    );
    if (isBookmarked) {
      return {
        success: false,
        message: "Job is already bookmarked for this user",
      };
    } else {
      return this.profileService.logBookmarkInteraction(address, job);
    }
  }

  @Delete("jobs/bookmark")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiOkResponse({
    description: "Removes a bookmark on a job for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async removeBookmarkInteraction(
    @Session() { address }: SessionObject,
    @Body("shortUUID") job: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/bookmark`);
    return this.profileService.removeBookmarkInteraction(address, job);
  }
}
