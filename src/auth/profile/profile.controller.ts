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
import { Roles } from "src/shared/decorators/role.decorator";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  OrgUserProfile,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserOrg,
  UserProfile,
  UserRepo,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { AuthService } from "../auth.service";
import { RBACGuard } from "../rbac.guard";
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
import { UpdateDevUserProfileInput } from "./dto/update-dev-profile.input";
import { UpdateOrgUserProfileInput } from "./dto/update-org-profile.input";
import { UserService } from "src/user/user.service";
import { addMonths, isBefore } from "date-fns";
import * as Sentry from "@sentry/node";
import { RpcService } from "../../user/rpc.service";
import { ScorerService } from "src/scorer/scorer.service";
import { JobsService } from "src/jobs/jobs.service";

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
    private readonly scorerService: ScorerService,
    private readonly jobsService: JobsService,
  ) {}

  @Get("dev/info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in dev user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async getDevUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    this.logger.log(`/profile/dev/info`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getDevUserProfile(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("org/info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in org user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async getOrgUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<OrgUserProfile>> {
    this.logger.log(`/profile/org/info`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getOrgUserProfile(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("repositories")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.getUserRepos(address as string, params);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("organizations")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the organizations of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserOrg[]>),
    }),
  })
  async getUserOrgs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<UserOrg[]> | ResponseWithNoData> {
    this.logger.log(`/profile/organizations`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserOrgs(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("showcase")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.getUserShowCase(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("skills")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.getUserSkills(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("dev/info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates the profile of the currently logged in dev user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async setDevUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateDevUserProfileInput,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
    this.logger.log(`/profile/dev/info ${JSON.stringify(body)}`);
    const { address, flow } = await this.authService.getSession(req, res);
    if (address) {
      const preferredContactData = body.contact[body.preferred];
      if (preferredContactData) {
        if ((flow as string) === CheckWalletFlows.ONBOARD_PROFILE) {
          await this.userService.setWalletFlow({
            flow: CheckWalletFlows.SIGNUP_COMPLETE,
            wallet: address as string,
          });
        }
        return this.profileService.updateDevUserProfile(
          address as string,
          body,
        );
      } else {
        return {
          success: false,
          message: "Contact data is required for preferred contact type",
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

  @Post("org/info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates the profile of the currently logged in org user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<OrgUserProfile>),
    }),
  })
  async setOrgUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateOrgUserProfileInput,
  ): Promise<ResponseWithOptionalData<OrgUserProfile>> {
    this.logger.log(`/profile/org/info ${JSON.stringify(body)}`);
    const { address, flow } = await this.authService.getSession(req, res);
    if (address) {
      if ((flow as string) === CheckWalletFlows.ORG_PROFILE) {
        await this.userService.setWalletFlow({
          flow: CheckWalletFlows.ORG_APPROVAL_PENDING,
          wallet: address as string,
        });
      }
      return this.profileService.updateOrgUserProfile(address as string, body);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("showcase")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.updateUserShowCase(address as string, body);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("skills")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.updateUserSkills(address as string, body);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("delete")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
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
      return this.profileService.deleteUserAccount(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("reviews/salary")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
        return this.profileService.reviewOrgSalary(address as string, params);
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
        return this.profileService.rateOrg(address as string, params);
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
        return this.profileService.reviewOrg(address as string, params);
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
  @UseGuards(RBACGuard)
  @Roles(
    CheckWalletRoles.ANON,
    CheckWalletRoles.ADMIN,
    CheckWalletRoles.DEV,
    CheckWalletRoles.ORG,
  )
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
            <li>User Role: ${session.role ?? "N/A"}</li>
            <li>User Flow: ${session.flow ?? "N/A"}</li>
            <li>Wallet Connected: ${session.nonce !== undefined}</li>
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.updateRepoContribution(
        address as string,
        params,
      );
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("repositories/tags")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.updateRepoTagsUsed(address as string, params);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("jobs/block-org/:orgId")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
        return this.profileService.blockOrgJobs(address as string, orgId);
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
            address as string,
            shortUUID,
          );

          if (hasApplied) {
            return {
              success: true,
              message: "Job has already been applied to by this user",
            };
          } else {
            const userProfile = data(
              await this.profileService.getDevUserProfile(address as string),
            );
            if (job.access === "protected") {
              if (userProfile.username) {
                const stats = await this.scorerService.getLeanStats([
                  { github: userProfile.username, wallet: address as string },
                ]);
                if (stats[0].is_native) {
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
                return {
                  success: false,
                  message: "User github username not found",
                };
              }
            } else {
              const CACHE_VALIDITY_THRESHOLD = this.configService.get<number>(
                "CACHE_VALIDITY_THRESHOLD",
              );

              const userCacheLock = await this.profileService.getUserCacheLock(
                address as string,
              );

              const userCacheLockIsValid =
                (userCacheLock !== -1 || userCacheLock !== null) &&
                isBefore(
                  new Date(),
                  addMonths(new Date(userCacheLock), CACHE_VALIDITY_THRESHOLD),
                );

              if (!userCacheLockIsValid) {
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

                if (orgProfile && orgProfile.email) {
                  const communities =
                    await this.rpcService.getCommunitiesForWallet(
                      userProfile.wallet,
                    );
                  await this.mailService.sendEmail({
                    from: this.configService.getOrThrow<string>("EMAIL"),
                    to: orgProfile.email.find(x => x.main)?.email,
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
                  if (userProfile && userProfile.username) {
                    await this.profileService.refreshUserCacheLock([
                      userProfile.wallet,
                    ]);

                    const workHistory = await this.scorerService.getWorkHistory(
                      [userProfile.username],
                    );

                    const leanStats = await this.scorerService.getLeanStats([
                      {
                        github: userProfile.username,
                        wallet: address as string,
                      },
                    ]);

                    await this.profileService.refreshWorkHistoryCache(
                      userProfile.wallet,
                      workHistory.find(x => x.user === userProfile.username)
                        ?.workHistory ?? [],
                      leanStats.find(
                        x => x.actor_login === userProfile.username,
                      ) ?? null,
                    );
                  }
                }
              }
              return await this.profileService.logApplyInteraction(
                address as string,
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
        scope.setExtra("input", { wallet: address as string });
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
        address as string,
        job,
      );
      if (isBookmarked) {
        return {
          success: false,
          message: "Job is already bookmarked for this user",
        };
      } else {
        return this.profileService.logBookmarkInteraction(
          address as string,
          job,
        );
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
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.removeBookmarkInteraction(
        address as string,
        job,
      );
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }
}
