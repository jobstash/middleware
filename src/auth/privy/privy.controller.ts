import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { PrivyService } from "./privy.service";
import { PBACGuard } from "../pbac.guard";
import { PrivyUser, Permissions } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { PrivyGuard } from "./privy.guard";
import { User, WalletWithMetadata } from "@privy-io/server-auth";
import { AuthService } from "../auth.service";
import { SessionObject } from "src/shared/interfaces";
import { UserService } from "src/user/user.service";

@Controller("privy")
export class PrivyController {
  private readonly logger = new CustomLogger(PrivyController.name);
  constructor(
    private readonly privyService: PrivyService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Get("check-wallet")
  @UseGuards(PrivyGuard)
  @HttpCode(HttpStatus.OK)
  async checkWallet(
    @PrivyUser() user: User,
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
        const token = this.authService.createToken({
          address: embeddedWallet,
          permissions: [],
          cryptoNative,
        });
        return {
          token,
          cryptoNative,
          permissions: [],
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

  @Get("migrate-users")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async migrateUsers(): Promise<void> {
    this.logger.log("/privy/migrate-users");
    this.privyService.unsafe___________migrateUsers(this.userService);
  }

  @Get("delete-migrated-users")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async deleteMigratedUsers(): Promise<void> {
    this.logger.log("/privy/delete-migrated-users");
    this.privyService.unsafe__________deleteMigratedUsers();
  }

  // @Get("check-relevant-unmigrated-users")
  // @HttpCode(HttpStatus.ACCEPTED)
  // async checkRelevantUnMigratedUsers(): Promise<void> {
  //   this.logger.log("/privy/check-relevant-unmigrated-users");
  //   this.privyService.checkRelevantUnMigratedUsers();
  // }
}
