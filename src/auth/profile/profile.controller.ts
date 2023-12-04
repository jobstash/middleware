import {
  Body,
  Controller,
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
import { ProfileService } from "./profile.service";
import { Roles } from "src/shared/decorators/role.decorator";
import { CheckWalletRoles } from "src/shared/enums";
import { RBACGuard } from "../rbac.guard";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";
import { AuthService } from "../auth.service";
import { Request, Response as ExpressResponse } from "express";
import {
  OrgReview,
  OrganizationWithRelations,
  PaginatedData,
  Response,
  ResponseWithNoData,
  UserProfile,
  UserRepo,
} from "src/shared/interfaces";
import { UpdateUserProfileInput } from "./dto/update-profile.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ReviewListParams } from "./dto/review-list.input";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { RateOrgInput } from "./dto/rate-org.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";

@Controller("profile")
export class ProfileController {
  private logger = new CustomLogger(ProfileController.name);
  constructor(
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
  ) {}

  @Get("info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async getUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
    this.logger.log(`/profile/info`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getUserProfile(address as string);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("reviews")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(PaginatedData<OrgReview>),
    }),
  })
  async getOrgReviews(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Query(new ValidationPipe({ transform: true })) params: ReviewListParams,
  ): Promise<PaginatedData<OrgReview> | ResponseWithNoData> {
    this.logger.log(`/profile/reviews`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.getOrgReviews(address as string, params);
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
      $ref: getSchemaPath(Response<OrganizationWithRelations[]>),
    }),
  })
  async getUserOrgs(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<OrganizationWithRelations[]> | ResponseWithNoData> {
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

  @Post("info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Updates the profile of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
    }),
  })
  async setUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateUserProfileInput,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
    this.logger.log(`/profile/info ${JSON.stringify(body)}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.updateUserProfile(address as string, body);
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
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
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
      return this.profileService.reviewOrgSalary(address as string, params);
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
      return this.profileService.rateOrg(address as string, params);
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
      return this.profileService.reviewOrg(address as string, params);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
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
      return this.profileService.blockOrgJobs(address as string, orgId);
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
    @Body("shortUUID") job: string,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/profile/job/apply`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.logApplyInteraction(address as string, job);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
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
    this.logger.log(`/profile/job/apply`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      return this.profileService.logBookmarkInteraction(address as string, job);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }
}
