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
import { MagicAuthStrategy } from "./magic/magic-auth.strategy";
import { Request, Response as ExpressResponse } from "express";
import { Roles } from "src/shared/decorators/role.decorator";
import { RBACGuard } from "./rbac.guard";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import {
  Response,
  ResponseWithNoData,
  User,
  UserProfile,
} from "src/shared/interfaces";
import { UserService } from "../user/user.service";
import { SendVerificationEmailInput } from "./dto/send-verification-email.input";
import { AuthGuard } from "@nestjs/passport";
import { AuthUser } from "src/shared/decorators/auth-user.decorator";
import { AuthService } from "./auth.service";
import { WalletAdminMappingDto } from "../user/dto/wallet-admin-mapping-request.dto";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ProfileService } from "./profile/profile.service";

@Controller("auth")
export class AuthController {
  private logger = new CustomLogger(AuthController.name);
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    private strategy: MagicAuthStrategy,
  ) {}

  @Post("magic/login")
  @UseGuards(RBACGuard)
  @Roles(
    CheckWalletRoles.ANON,
    CheckWalletRoles.ADMIN,
    CheckWalletRoles.DEV,
    CheckWalletRoles.ORG,
  )
  @ApiOkResponse({
    description: "Generates and sends email verification link",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async sendMagicLink(
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Body(new ValidationPipe({ transform: true }))
    body: SendVerificationEmailInput,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    const result = await this.userService.addUserEmail(
      address as string,
      body.destination,
    );
    if (result.success) {
      this.strategy.send(req, res);
      return {
        success: result.success,
        message: result.message,
      };
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return result;
    }
  }

  @Get("magic/login/callback")
  @UseGuards(AuthGuard("magic"))
  @ApiOkResponse({
    description: "Generates and sends email verification link",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async verifyMagicLink(
    @AuthUser() user: User,
  ): Promise<Response<UserProfile>> {
    const profile = (await this.profileService.getUserProfile(
      user.wallet,
    )) as Response<UserProfile>;

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
      data: profile.data,
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
