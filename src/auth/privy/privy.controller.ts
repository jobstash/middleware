import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { PrivyService } from "./privy.service";
import { RBACGuard } from "../rbac.guard";
import { PrivyUser, Roles } from "src/shared/decorators";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
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
        CheckWalletRoles.DEV,
      );
      if (result.success) {
        const cryptoNative =
          (await this.userService.getCryptoNativeStatus(embeddedWallet)) ??
          false;
        const role = await this.userService.getWalletRole(embeddedWallet);
        const flow = await this.userService.getWalletFlow(embeddedWallet);
        const token = this.authService.createToken({
          address: embeddedWallet,
          role: role.getName(),
          flow: flow.getName(),
          cryptoNative,
        });
        return {
          role: role.getName(),
          flow: flow.getName(),
          token,
          cryptoNative,
        };
      } else {
        throw new BadRequestException(result);
      }
    } else {
      return {
        role: CheckWalletRoles.ANON,
        flow: CheckWalletFlows.LOGIN,
        token: this.authService.createToken({
          address: null,
          role: CheckWalletRoles.ANON,
          flow: CheckWalletFlows.LOGIN,
          cryptoNative: false,
        }),
        cryptoNative: false,
      };
    }
  }

  @Get("check-org-wallet")
  @UseGuards(PrivyGuard)
  @HttpCode(HttpStatus.OK)
  async checkOrgWallet(
    @PrivyUser() user: User,
  ): Promise<SessionObject & { token: string }> {
    this.logger.log("/privy/check-org-wallet " + JSON.stringify(user));
    const embeddedWallet = (
      user.linkedAccounts.find(
        x => x.type === "wallet" && x.walletClientType === "privy",
      ) as WalletWithMetadata
    )?.address;
    if (embeddedWallet) {
      const result = await this.userService.createPrivyUser(
        user,
        embeddedWallet,
        CheckWalletRoles.ORG,
      );

      if (result.success) {
        const cryptoNative =
          (await this.userService.getCryptoNativeStatus(embeddedWallet)) ??
          false;
        const flow = await this.userService.getWalletFlow(embeddedWallet);
        const token = this.authService.createToken({
          address: embeddedWallet,
          role: CheckWalletRoles.ORG,
          flow: flow.getName(),
          cryptoNative,
        });
        return {
          role: CheckWalletRoles.ORG,
          flow: flow.getName(),
          token,
          cryptoNative,
        };
      } else {
        throw new BadRequestException(result);
      }
    } else {
      return {
        role: CheckWalletRoles.ANON,
        flow: CheckWalletFlows.LOGIN,
        token: this.authService.createToken({
          address: null,
          role: CheckWalletRoles.ANON,
          flow: CheckWalletFlows.LOGIN,
          cryptoNative: false,
        }),
        cryptoNative: false,
      };
    }
  }

  @Get("migrate-users")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async migrateUsers(): Promise<void> {
    this.logger.log("/privy/migrate-users");
    this.privyService.unsafe___________migrateUsers();
  }

  @Get("delete-migrated-users")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
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
