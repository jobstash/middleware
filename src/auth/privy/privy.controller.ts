import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { PrivyService } from "./privy.service";
import { RBACGuard } from "../rbac.guard";
import { PrivyUser, Roles } from "src/shared/decorators";
import { CheckWalletRoles } from "src/shared/constants";
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
    this.logger.log("/privy/check-wallet");
    const embeddedWallet = (
      user.linkedAccounts.find(
        x => x.type === "wallet" && x.walletClientType === "privy",
      ) as WalletWithMetadata
    )?.address;
    await this.userService.createPrivyUser(
      user,
      embeddedWallet,
      CheckWalletRoles.DEV,
    );
    const cryptoNative = await this.userService.getCryptoNativeStatus(
      embeddedWallet,
    );
    const flow = await this.userService.getWalletFlow(embeddedWallet);
    const token = this.authService.createToken({
      address: embeddedWallet,
      role: CheckWalletRoles.DEV,
      flow: flow.getName(),
      cryptoNative,
    });
    return {
      role: CheckWalletRoles.DEV,
      flow: flow.getName(),
      token,
      cryptoNative,
    };
  }

  @Get("check-org-wallet")
  @UseGuards(PrivyGuard)
  @HttpCode(HttpStatus.OK)
  async checkOrgWallet(
    @PrivyUser() user: User,
  ): Promise<SessionObject & { token: string }> {
    this.logger.log("/privy/check-org-wallet");
    const embeddedWallet = (
      user.linkedAccounts.find(
        x => x.type === "wallet" && x.walletClientType === "privy",
      ) as WalletWithMetadata
    )?.address;
    await this.userService.createPrivyUser(
      user,
      embeddedWallet,
      CheckWalletRoles.ORG,
    );
    const cryptoNative = await this.userService.getCryptoNativeStatus(
      embeddedWallet,
    );
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
