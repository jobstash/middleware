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
import { CheckWalletRoles } from "src/shared/enums";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { ResponseWithNoData, User } from "src/shared/interfaces";
import { UserService } from "./user/user.service";
import { SendVerificationEmailInput } from "./dto/send-verification-email.input";
import { AuthGuard } from "@nestjs/passport";
import { AuthUser } from "src/shared/decorators/auth-user.decorator";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
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
}
