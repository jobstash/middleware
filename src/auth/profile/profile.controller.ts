import {
  Controller,
  Get,
  HttpStatus,
  Req,
  Res,
  UseGuards,
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
  Response,
  ResponseWithNoData,
  UserProfile,
} from "src/shared/interfaces";

@Controller("profile")
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
  ) {}

  @Get("info")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ADMIN)
  @ApiOkResponse({
    description: "Returns the profile of the currently logged in user",
    schema: responseSchemaWrapper({ $ref: getSchemaPath(String) }),
  })
  async getUserProfile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
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
}
