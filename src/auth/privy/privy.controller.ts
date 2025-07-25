import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
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
import { PrivyService } from "./privy.service";
import { ConfigService } from "@nestjs/config";
import {
  PrivyWebhookPayload,
  PrivyTestPayload,
  PrivyUpdateEventPayload,
  PrivyTransferEventPayload,
  PrivyCreateEventPayload,
} from "./dto/webhook.payload";
import { TelemetryService } from "src/telemetry/telemetry.service";
import { CheckWalletPermissions } from "src/shared/constants";

@Controller("privy")
export class PrivyController {
  private readonly logger = new CustomLogger(PrivyController.name);
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly privyService: PrivyService,
    private readonly configService: ConfigService,
    private readonly telemetryService: TelemetryService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get("check-wallet")
  @UseGuards(PrivyGuard)
  @HttpCode(HttpStatus.OK)
  async checkWallet(
    @PrivySession() user: User,
  ): Promise<SessionObject & { token: string }> {
    const embeddedWallet = user.linkedAccounts
      ? (
          user.linkedAccounts.find(
            x => x.type === "wallet" && x.walletClientType === "privy",
          ) as WalletWithMetadata
        )?.address
      : null;
    const result = await this.userService.upsertPrivyUser(user, embeddedWallet);
    if (embeddedWallet && result.success) {
      this.logger.log("/privy/check-wallet " + embeddedWallet);
      const cryptoNative =
        (await this.userService.getCryptoNativeStatus(embeddedWallet)) ?? false;
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

  @Post("webhook")
  async handleWebhook(
    @Body() body: PrivyWebhookPayload | PrivyTestPayload,
    @Headers("svix-id") id: string,
    @Headers("svix-timestamp") timestamp: string,
    @Headers("svix-signature") signature: string,
  ): Promise<void> {
    this.logger.log(`/privy/webhook ${body.type}`);
    const client = await this.privyService.getClient();
    try {
      const verifiedPayload: PrivyWebhookPayload | PrivyTestPayload =
        (await client.verifyWebhook(
          body,
          { id, timestamp, signature },
          this.configService.getOrThrow<string>("PRIVY_WEBHOOK_KEY"),
        )) as PrivyWebhookPayload | PrivyTestPayload;

      if (verifiedPayload.type === "privy.test") {
        this.logger.log(`Webhook test: ${verifiedPayload.message}`);
      } else if (
        [
          "user.linked_account",
          "user.updated_account",
          "user.unlinked_account",
        ].includes(verifiedPayload.type)
      ) {
        const payload = verifiedPayload as PrivyUpdateEventPayload;
        const embeddedWallet = await this.userService.getEmbeddedWallet(
          payload.user.id,
        );
        if (embeddedWallet) {
          const accountType = payload.account.type.replace("_", " ");
          this.logger.log(
            `User ${verifiedPayload.type
              .replace("user.", "")
              .replace("_", ` ${accountType} `)} - ${embeddedWallet}`,
          );
          await this.userService.syncUserLinkedWallets(
            embeddedWallet,
            payload.user,
          );
          await this.userService.updateLinkedAccounts(payload, embeddedWallet);
        } else {
          this.logger.warn(`User not found`);
        }
      } else if (verifiedPayload.type === "user.authenticated") {
        const embeddedWallet = await this.userService.getEmbeddedWallet(
          (verifiedPayload as PrivyUpdateEventPayload).user.id,
        );
        if (embeddedWallet) {
          this.logger.log(`User authenticated: ${embeddedWallet}`);
          await this.telemetryService.logUserLoginEvent(
            verifiedPayload.user.id,
          );
          const permissions =
            await this.permissionService.getPermissionsForWallet(
              embeddedWallet,
            );

          if (permissions.length === 0) {
            await this.permissionService.syncUserPermissions(embeddedWallet, [
              CheckWalletPermissions.USER,
            ]);
          }
        } else {
          this.logger.warn(`User not found`);
        }
      } else if (verifiedPayload.type === "user.transferred_account") {
        const payload = verifiedPayload as PrivyTransferEventPayload;
        const fromEmbeddedWallet = await this.userService.getEmbeddedWallet(
          payload.fromUser.id,
        );
        const toEmbeddedWallet = await this.userService.getEmbeddedWallet(
          payload.toUser.id,
        );
        if (fromEmbeddedWallet && toEmbeddedWallet) {
          this.logger.log(
            `User transferred linked ${verifiedPayload.account.type} account: ${fromEmbeddedWallet} to ${toEmbeddedWallet} `,
          );
          await this.userService.transferLinkedAccount(
            payload,
            fromEmbeddedWallet,
            toEmbeddedWallet,
          );
        } else {
          this.logger.warn(`User not found`);
        }
      } else if (verifiedPayload.type === "user.created") {
        const payload = verifiedPayload as PrivyCreateEventPayload;
        const embeddedWallet = await this.userService.getEmbeddedWallet(
          payload.user.id,
        );
        if (embeddedWallet) {
          this.logger.log(`User created: ${embeddedWallet}`);
          await this.userService.syncUserLinkedWallets(
            embeddedWallet,
            payload.user,
          );
          await this.userService.updateLinkedAccounts(payload, embeddedWallet);
        } else {
          this.logger.warn(`User not found`);
        }
      } else {
        this.logger.warn(
          `Unsupported webhook event type ${verifiedPayload.type}`,
        );
      }
    } catch (err) {
      this.logger.error(`PrivyController::handleWebhook ${err.message}`);
      throw new BadRequestException({
        success: false,
        message: "Invalid webhook call",
      });
    }
  }
}
