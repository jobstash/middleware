import {
  Body,
  Controller,
  Get,
  HttpStatus,
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
  PaginatedData,
  Response,
  ResponseWithNoData,
  UserProfile,
} from "src/shared/interfaces";
import { UpdateUserProfileInput } from "./dto/update-profile.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ReviewListParams } from "./dto/review-list.input";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { RateOrgInput } from "./dto/rate-org.input";
import { ReviewOrgInput } from "./dto/review-org.input";

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
      $ref: getSchemaPath(Response<UserProfile>),
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

  @Post("info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in user",
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
  @Post("reviews/salary")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the org reviews of the currently logged in user",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Response<UserProfile>),
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
      $ref: getSchemaPath(Response<UserProfile>),
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
      $ref: getSchemaPath(Response<UserProfile>),
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
}
