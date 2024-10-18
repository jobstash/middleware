import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { PrivySession } from "src/shared/decorators";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PrivyGuard } from "./privy.guard";
import { User, WalletWithMetadata } from "@privy-io/server-auth";
import { AuthService } from "../auth.service";
import { SessionObject } from "src/shared/interfaces";
import { UserService } from "src/user/user.service";
import { PermissionService } from "src/user/permission.service";

@Controller("privy")
export class PrivyController {
  private readonly logger = new CustomLogger(PrivyController.name);
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get("check-wallet")
  @UseGuards(PrivyGuard)
  @HttpCode(HttpStatus.OK)
  async checkWallet(
    @PrivySession() user: User,
  ): Promise<SessionObject & { token: string }> {
    this.logger.log("/privy/check-wallet " + JSON.stringify(user));
    const embeddedWallet = (
      user.linkedAccounts.find(
        x => x.type === "wallet" && x.walletClientType === "privy",
      ) as WalletWithMetadata
    )?.address;
    if (embeddedWallet) {
      const result = await this.userService.createPrivyUser(
        user,
        embeddedWallet,
      );
      if (result.success) {
        const cryptoNative =
          (await this.userService.getCryptoNativeStatus(embeddedWallet)) ??
          false;
        const permissions = (
          await this.permissionService.getPermissionsForWallet(embeddedWallet)
        ).map(x => x.name);
        const token = this.authService.createToken({
          address: embeddedWallet,
          permissions,
          cryptoNative,
        });
        return {
          token,
          cryptoNative,
          permissions,
        };
      } else {
        throw new BadRequestException(result);
      }
    } else {
      return {
        token: this.authService.createToken({
          address: null,
          cryptoNative: false,
          permissions: [],
        }),
        cryptoNative: false,
        permissions: [],
      };
    }
  }
}
