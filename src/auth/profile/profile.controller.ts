import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse, Request } from "express";
import { OrganizationsService } from "src/organizations/organizations.service";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserOrg,
  UserProfile,
  UserRepo,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AuthService } from "../auth.service";
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
import { Throttle } from "@nestjs/throttler";
import { UserService } from "src/user/user.service";
import * as Sentry from "@sentry/node";
import { RpcService } from "../../user/rpc.service";
import { JobsService } from "src/jobs/jobs.service";
import { UpdateDevLocationInput } from "./dto/update-dev-location.input";

@Controller("profile")
export class ProfileController {
  private logger = new CustomLogger(ProfileController.name);
  constructor(
    private readonly authService: AuthService,
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
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async getUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    this.logger.log(`/profile/dev/info`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserProfile(address);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("repositories")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the repos of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(PaginatedData<UserRepo>),
    }),
  })
  async getUserRepos(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Query(new ValidationPipe({ transform: true })) params: RepoListParams,
  ): Promise<PaginatedData<UserRepo> | ResponseWithNoData> {
    this.logger.log(`/profile/repositories`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserRepos(address, params);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("organizations")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the organizations of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserOrg[]>),
    }),
  })
  async getUserOrgs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<UserOrg[]>> {
    this.logger.log(`/profile/organizations`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserOrgs(address);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("organizations/verified")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description:
      "Returns the verified organizations of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserOrg[]>),
    }),
  })
  async getUserVerifiedOrgs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<{ id: string; name: string }[]>> {
    this.logger.log(`/profile/organizations/verified`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserVerifiedOrgs(address);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("showcase")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the showcase of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<{ label: string; url: string }[]>),
    }),
  })
  async getUserShowCase(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<{ label: string; url: string }[]> | ResponseWithNoData> {
    this.logger.log(`/profile/showcase`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserShowCase(address);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("skills")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the skills of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(
        Response<{ id: string; name: string; canTeach: boolean }[]>,
      ),
    }),
  })
  async getUserSkills(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<
    | Response<{ id: string; name: string; canTeach: boolean }[]>
    | ResponseWithNoData
  > {
    this.logger.log(`/profile/skills`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserSkills(address);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("availability")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Updates the availability of the currently logged in dev user",
  })
  async setUserAvailability(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body("availability") availability: boolean,
  ): Promise<ResponseWithNoData> {
    this.logger.log(
      `/profile/dev/availability ${JSON.stringify(availability)}`,
    );
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateUserAvailability(address, availability);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("location")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Updates the location of the currently logged in dev user",
  })
  async setUserLocationInfo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateDevLocationInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/dev/info ${JSON.stringify(body)}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateUserLocationInfo(address, body);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("showcase")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Updates the work credentials of the currently logged in user",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async updateUserShowCase(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateUserShowCaseInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/showcase ${JSON.stringify(body)}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateUserShowCase(address, body);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("skills")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Updates the work credentials of the currently logged in user",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async updateUserSkills(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateUserSkillsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/skills ${JSON.stringify(body)}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateUserSkills(address, body);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("delete")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Updates the profile of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async deleteUserAccount(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    this.logger.log(`/profile/delete ${address}`);
    if (address) {
      return this.userService.deletePrivyUser(address);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("reviews/salary")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async reviewOrgSalary(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() params: ReviewOrgSalaryInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/reviews/salary`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const org = await this.organizationsService.findByOrgId(params.orgId);
      if (org) {
        return this.profileService.reviewOrgSalary(address, params);
      } else {
        return {
          success: false,
          message: "Invalid orgId or orgId not found",
        };
      }
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("reviews/rating")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async rateOrg(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() params: RateOrgInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/reviews/rating`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const org = await this.organizationsService.findByOrgId(params.orgId);
      if (org) {
        return this.profileService.rateOrg(address, params);
      } else {
        return {
          success: false,
          message: "Invalid orgId or orgId not found",
        };
      }
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("reviews/review")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(ResponseWithNoData),
    }),
  })
  async reviewOrg(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() params: ReviewOrgInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/reviews/review`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const org = await this.organizationsService.findByOrgId(params.orgId);
      if (org) {
        return this.profileService.reviewOrg(address, params);
      } else {
        return {
          success: false,
          message: "Invalid orgId or orgId not found",
        };
      }
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body(new ValidationPipe({ transform: true }))
    body: ReportInput,
  ): Promise<ResponseWithNoData> {
    const { subject, description, ctx, attachments } = body;
    this.logger.log(
      `/profile/report ${JSON.stringify({ description, subject, ctx })}`,
    );
    const session = await this.authService.getSession(req, res);
    const parsedUrl = new URL(ctx.url);
    const allowedHosts = this.configService
      .get<string>("ALLOWED_ORIGINS")
      .split(",")
      .map(origin => new URL(origin).host);
    if (allowedHosts.includes(parsedUrl.host)) {
      await this.mailService.sendEmail({
        from: this.configService.getOrThrow<string>("EMAIL"),
        to: this.configService.getOrThrow<string>("REPORT_CONTENT_TO_EMAIL"),
        subject: subject,
        html: `
          <h2>User generated report</h2>
          <p>${description}</p>
          <h4>Relevant Information</h4>
          <ul>
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
          </ul>
        `,
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
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async updateRepoContribution(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() params: UpdateRepoContributionInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/repositories/contribution`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateRepoContribution(address, params);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("repositories/tags")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async updateRepoTagsUsed(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() params: UpdateRepoTagsUsedInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/repositories/tags`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateRepoTagsUsed(address, params);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("jobs/block-org/:orgId")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description:
      "Blocks jobs from the passed org for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async blockOrgJobs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Param("orgId") orgId: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/block-org`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const org = await this.organizationsService.findByOrgId(orgId);
      if (org) {
        return this.profileService.blockOrgJobs(address, orgId);
      } else {
        return {
          success: false,
          message: "Invalid orgId or orgId not found",
        };
      }
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("jobs/apply")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description:
      "Logs the apply interaction on a job for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async logApplyInteraction(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body("shortUUID") shortUUID: string,
  ): Promise<ResponseWithOptionalData<string>> {
    this.logger.log(`/profile/jobs/apply`);
    const { address } = await this.authService.getSession(req, res);
    try {
      if (address) {
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
              const isCryptoNative =
                await this.userService.getCryptoNativeStatus(address as string);
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
              const orgId = await this.userService.findOrgIdByJobShortUUID(
                shortUUID,
              );

              const orgProfile = await this.userService.findProfileByOrgId(
                orgId,
              );

              const org = await this.organizationsService.getOrgDetailsById(
                orgId,
                undefined,
              );

              const job = org.jobs.find(x => x.shortUUID === shortUUID);

              if (orgProfile && orgProfile.linkedAccounts?.email) {
                const communities =
                  await this.rpcService.getCommunitiesForWallet(
                    address as string,
                  );
                await this.mailService.sendEmail({
                  from: this.configService.getOrThrow<string>("EMAIL"),
                  to: orgProfile.linkedAccounts?.email,
                  subject: `JobStash ATS: New Applicant for ${job.title}`,
                  html: `
                    Dear ${org.name},
                    
                    You have a new applicant.

                    Please sign in to your <a href="https://jobstash.xyz/profile/org/applicants">JobStash ATS</a> account to see the full details and to manage your workflow.

                    ${
                      communities.length > 0
                        ? `This candidate is part of the following communities: ${communities.join(
                            ", ",
                          )}`
                        : ""
                    }

                    Role: ${job.title}

                    Thank you for using JobStash ATS!
                    The JobStash Team
                  `,
                });
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
      } else {
        res.status(HttpStatus.FORBIDDEN);
        return {
          success: false,
          message: "Access denied for unauthenticated user",
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
  @ApiOkResponse({
    description:
      "Logs the bookmark interaction on a job for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async logBookmarkInteraction(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body("shortUUID") job: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/bookmark`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
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
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Delete("jobs/bookmark")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Removes a bookmark on a job for the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async removeBookmarkInteraction(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body("shortUUID") job: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/bookmark`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.removeBookmarkInteraction(address, job);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }
}
