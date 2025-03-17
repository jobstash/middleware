import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
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
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
  UserOrg,
  UserProfile,
  UserRepo,
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
  ) {}

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
    this.logger.log(`/profile/dev/info`);
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

    return this.profileService.getUserVerifiedOrgs(address, true);
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
        Response<{ id: string; name: string; canTeach: boolean }[]>,
      ),
    }),
  })
  async getUserSkills(
    @Session() { address }: SessionObject,
  ): Promise<
    ResponseWithOptionalData<{ id: string; name: string; canTeach: boolean }[]>
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
    this.logger.log(
      `/profile/dev/availability ${JSON.stringify(availability)}`,
    );

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
    this.logger.log(`/profile/dev/info ${JSON.stringify(body)}`);
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
    this.logger.log(`/profile/showcase ${JSON.stringify(body)}`);

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
    this.logger.log(`/profile/skills ${JSON.stringify(body)}`);

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
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async logApplyInteraction(
    @Res({ passthrough: true }) res: ExpressResponse,
    @Session() { address }: SessionObject,
    @Body("shortUUID") shortUUID: string,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/profile/jobs/apply`);

    try {
      const job = await this.jobsService.getJobDetailsByUuid(
        shortUUID,
        undefined,
        false,
      );

      if (job) {
        const hasApplied = await this.profileService.verifyApplyInteraction(
          address,
          shortUUID,
        );

        if (hasApplied) {
          return {
            success: true,
            message: "Job has already been applied to by this user",
          };
        } else {
          if (job.access === "protected") {
            const isCryptoNative = await this.userService.getCryptoNativeStatus(
              address as string,
            );
            if (isCryptoNative) {
              return {
                success: true,
                message: "User is a crypto native",
                data: job.url,
              };
            } else {
              return {
                success: false,
                message: "User is not a crypto native",
              };
            }
          } else {
            const orgId =
              await this.userService.findOrgIdByJobShortUUID(shortUUID);

            const orgProfile = data(
              await this.userService.findOrgOwnerProfileByOrgId(orgId),
            );

            const jobs = await this.jobsService.getJobsByOrgId(
              orgId,
              undefined,
            );

            const job = jobs.find(x => x.shortUUID === shortUUID);

            if (orgProfile && orgProfile.linkedAccounts?.email) {
              const communities = await this.rpcService.getCommunitiesForWallet(
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
                        <li>Job Title: ${job.title}</li>
                        <li>Job URL: ${job.url}</li>
                      </ul>
                    `),
                    raw(`
                        ${
                          communities.length > 0
                            ? `This candidate is part of the following communities: 
                              <ul>${communities.map(x => `<li>${x}</li>`).join("")}</ul>`
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
              this.logger.log(
                `Email sent to ${orgProfile.linkedAccounts?.email}`,
              );
            }
            return await this.profileService.logApplyInteraction(
              address,
              shortUUID,
            );
          }
        }
      } else {
        return {
          success: false,
          message: "Job not found",
        };
      }
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
      return {
        success: false,
        message: "Error processing your application",
      };
    }
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
