import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse, Request } from "express";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import { Session } from "src/shared/decorators/session.decorator";
import { Roles } from "src/shared/decorators/role.decorator";
import {
  OrgUserProfile,
  Response,
  ResponseWithNoData,
  SessionObject,
  UserProfile,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "../user/user.service";
import { AuthService } from "./auth.service";
import { SendVerificationEmailInput } from "./dto/send-verification-email.input";
import { DevMagicAuthStrategy } from "./magic/dev.magic-auth.strategy";
import { OrgMagicAuthStrategy } from "./magic/org.magic-auth.strategy";
import { ProfileService } from "./profile/profile.service";
import { RBACGuard } from "./rbac.guard";
import { responseSchemaWrapper } from "src/shared/helpers";
import { isEmail } from "validator";

@Controller("auth")
export class AuthController {
  private logger = new CustomLogger(AuthController.name);
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    private devStrategy: DevMagicAuthStrategy,
    private orgStrategy: OrgMagicAuthStrategy,
  ) {}

  @Post("magic/dev/login")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Generates and sends email verification link for devs",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async sendDevMagicLink(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body(new ValidationPipe({ transform: true }))
    body: SendVerificationEmailInput,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const result = await this.userService.addUserEmail(
        address,
        body.destination,
      );
      if (result.success) {
        this.devStrategy.send(req, res);
        return {
          success: result.success,
          message: result.message,
        };
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return result;
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }

  @Post("magic/org/login")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Generates and sends email verification link for orgs",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async sendOrgMagicLink(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body(new ValidationPipe({ transform: true }))
    body: SendVerificationEmailInput,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const result = await this.userService.addUserEmail(
        address,
        body.destination,
      );
      if (result.success) {
        this.orgStrategy.send(req, res);
        return {
          success: result.success,
          message: result.message,
        };
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return result;
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }

  @Get("magic/dev/login/callback")
  @UseGuards(AuthGuard("dev-magic"))
  @ApiOkResponse({
    description: "Callback for email verification link for devs",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async verifyDevMagicLink(
    @Session() session: SessionObject,
  ): Promise<Response<UserProfile>> {
    const profile = data(
      await this.profileService.getDevUserProfile(session.address),
    );

    await this.userService.setWalletFlow({
      flow: CheckWalletFlows.ONBOARD_PROFILE,
      wallet: session.address,
    });
    await this.userService.setWalletRole({
      role: CheckWalletRoles.DEV,
      wallet: session.address,
    });

    await this.profileService.runUserDataFetchingOps(session.address, true);

    return {
      success: true,
      message: "Signed in with email successfully",
      data: profile,
    };
  }

  @Get("magic/org/login/callback")
  @UseGuards(AuthGuard("org-magic"))
  @ApiOkResponse({
    description: "Callback for email verification link for orgs",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async verifyOrgMagicLink(
    @Session() session: SessionObject,
  ): Promise<Response<OrgUserProfile>> {
    const profile = data(
      await this.profileService.getOrgUserProfile(session.address),
    );

    await this.userService.setWalletFlow({
      flow: CheckWalletFlows.ORG_PROFILE,
      wallet: session.address,
    });
    await this.userService.setWalletRole({
      role: CheckWalletRoles.ORG,
      wallet: session.address,
    });

    return {
      success: true,
      message: "Signed in with email successfully",
      data: profile,
    };
  }

  @Post("update-main-email")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Updates a users primary email",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateUserMainEmail(
    @Query("email") email: string,
    @Session() session: SessionObject,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithNoData> {
    if (isEmail(email)) {
      this.logger.log(`/user/update-email/${email}`);
      const { address } = session;
      if (address) {
        const result = await this.userService.updateUserMainEmail(
          address as string,
          email,
        );
        if (result.success) {
          return {
            success: result.success,
            message: result.message,
          };
        } else {
          res.status(HttpStatus.BAD_REQUEST);
          return result;
        }
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          success: false,
          message: "Bad Request",
        };
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }

  @Delete("remove-email")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.DEV, CheckWalletRoles.ORG)
  @ApiOkResponse({
    description: "Removes an email from a user's profile",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async removeUserEmail(
    @Query("email") email: string,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Session() session: SessionObject,
  ): Promise<ResponseWithNoData> {
    if (isEmail(email)) {
      this.logger.log(`/user/remove-email/${email}`);
      const { address } = session;
      if (address) {
        const result = await this.userService.removeUserEmail(
          address as string,
          email,
        );
        if (result.success) {
          return {
            success: result.success,
            message: result.message,
          };
        } else {
          res.status(HttpStatus.BAD_REQUEST);
          return result;
        }
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          success: false,
          message: "Bad Request",
        };
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }
}
