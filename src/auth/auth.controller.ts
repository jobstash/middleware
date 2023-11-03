import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { MagicAuthStrategy } from "./magic/magic-auth.strategy";
import { Request, Response } from "express";
import { Roles } from "src/shared/decorators/role.decorator";
import { RBACGuard } from "./rbac.guard";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/enums";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { ResponseWithNoData, User } from "src/shared/interfaces";
import { UserService } from "./user/user.service";
import { SendVerificationEmailInput } from "./dto/send-verification-email.input";
import { AuthGuard } from "@nestjs/passport";
import { AuthUser } from "src/shared/decorators/auth-user.decorator";
import { AuthService } from "./auth.service";
import { WalletAdminMappingDto } from "./user/dto/wallet-admin-mapping-request.dto";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Controller("auth")
export class AuthController {
  private logger = new CustomLogger(AuthController.name);
  constructor(
    private readonly userService: UserService,
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
    @Res() res: Response,
    @Body(new ValidationPipe({ transform: true }))
    body: SendVerificationEmailInput,
  ): Promise<void> {
    const { address } = await this.authService.getSession(req, res);
    await this.userService.addUserEmail(address as string, body.destination);
    return this.strategy.send(req, res);
  }

  @Get("magic/login/callback")
  @UseGuards(AuthGuard("magiclogin"))
  @ApiOkResponse({
    description: "Generates and sends email verification link",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async verifyMagicLink(@AuthUser() user: User): Promise<User> {
    return user;
  }

  @Post("set-role/admin")
  // @UseGuards(RBACGuard)
  // @Roles(CheckWalletRoles.ADMIN)
  async setAdminRole(
    @Body() walletDto: WalletAdminMappingDto,
  ): Promise<ResponseWithNoData> {
    const { wallet } = walletDto;
    this.logger.log(
      `/auth/set-role/admin: Setting admin priviledges for ${wallet}`,
    );
    const user = await this.userService.findByWallet(wallet);

    if (user) {
      this.userService.setRole(CheckWalletRoles.ADMIN, user);
      this.userService.setFlow(CheckWalletFlows.ADMIN_COMPLETE, user);

      this.logger.log(`admin priviliedges set.`);
      return { success: true, message: "Wallet is now admin" };
    } else {
      return { success: false, message: "No user associated with wallet" };
    }
  }
}
