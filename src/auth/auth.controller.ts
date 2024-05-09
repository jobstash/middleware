import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse, Request } from "express";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import { AuthUser } from "src/shared/decorators/auth-user.decorator";
import { Roles } from "src/shared/decorators/role.decorator";
import {
  OrgUserProfile,
  Response,
  ResponseWithNoData,
  User,
  UserProfile,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { WalletAdminMappingDto } from "../user/dto/wallet-admin-mapping-request.dto";
import { UserService } from "../user/user.service";
import { AuthService } from "./auth.service";
import { SendVerificationEmailInput } from "./dto/send-verification-email.input";
import { DevMagicAuthStrategy } from "./magic/dev.magic-auth.strategy";
import { OrgMagicAuthStrategy } from "./magic/org.magic-auth.strategy";
import { ProfileService } from "./profile/profile.service";
import { RBACGuard } from "./rbac.guard";

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
        address as string,
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
        address as string,
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
    @AuthUser() user: User,
  ): Promise<Response<UserProfile>> {
    const profile = data(
      await this.profileService.getDevUserProfile(user.wallet),
    );

    await this.userService.setWalletFlow({
      flow: CheckWalletFlows.ONBOARD_PROFILE,
      wallet: user.wallet,
    });
    await this.userService.setWalletRole({
      role: CheckWalletRoles.DEV,
      wallet: user.wallet,
    });

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
    @AuthUser() user: User,
  ): Promise<Response<OrgUserProfile>> {
    const profile = data(
      await this.profileService.getOrgUserProfile(user.wallet),
    );

    await this.userService.setWalletFlow({
      flow: CheckWalletFlows.ORG_PROFILE,
      wallet: user.wallet,
    });
    await this.userService.setWalletRole({
      role: CheckWalletRoles.ORG,
      wallet: user.wallet,
    });

    return {
      success: true,
      message: "Signed in with email successfully",
      data: profile,
    };
  }

  @Post("set-role/admin")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async setAdminRole(
    @Body() walletDto: WalletAdminMappingDto,
  ): Promise<ResponseWithNoData> {
    const { wallet } = walletDto;
    this.logger.log(
      `/auth/set-role/admin: Setting admin priviledges for ${wallet}`,
    );
    const user = await this.userService.findByWallet(wallet);

    if (user) {
      this.userService.setWalletRole({
        role: CheckWalletRoles.ADMIN,
        wallet: user.getWallet(),
      });
      this.userService.setWalletFlow({
        flow: CheckWalletFlows.ADMIN_COMPLETE,
        wallet: user.getWallet(),
      });

      this.logger.log(`admin priviliedges set for ${wallet}`);
      return { success: true, message: "Wallet is now admin" };
    } else {
      return { success: false, message: "No user associated with wallet" };
    }
  }
}
