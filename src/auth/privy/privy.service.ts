import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { PrivyClient, User, WalletWithMetadata } from "@privy-io/server-auth";

@Injectable()
export class PrivyService {
  private logger = new CustomLogger(PrivyService.name);
  private privy: PrivyClient;
  constructor(private readonly configService: ConfigService) {
    this.privy = new PrivyClient(
      this.configService.get<string>("PRIVY_APP_ID"),
      this.configService.get<string>("PRIVY_APP_SECRET"),
    );
  }

  async getUser(userId: string, attempts = 0): Promise<User | undefined> {
    let user: User;
    try {
      user = await this.privy.getUser(userId);
      if (!user?.linkedAccounts) {
        this.logger.warn(`User ${userId} has no linked accounts`);
        this.logger.warn(user);
      } else {
        this.logger.log(
          `Fetched user after ${attempts + 1} attempt${
            attempts > 1 ? "s" : ""
          }`,
        );
      }
    } catch (err) {
      if (err.message === "User not found") {
        return undefined;
      } else {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "privy.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`PrivyService::getUser ${err.message}`);
        const backOffTime = Math.min(360000, Math.pow(2, attempts) * 1000); // Cap back-off time to 60 seconds
        this.logger.warn(
          `Rate limited on get user request. Retrying after ${
            backOffTime / 1000
          } seconds...`,
        );
        await new Promise(resolve => setTimeout(resolve, backOffTime));
        return this.getUser(userId, attempts + 1);
      }
    }
    return user;
  }

  async getUserLinkedWallets(userId: string): Promise<string[]> {
    const user = await this.getUser(userId);
    if (user?.linkedAccounts) {
      return user.linkedAccounts
        .filter(x => x.type === "wallet" && x.walletClientType !== "privy")
        .map(x => (x as WalletWithMetadata).address);
    } else {
      return [];
    }
  }

  async getUsers(attempts = 1): Promise<User[]> {
    let users: User[];
    try {
      users = await this.privy.getUsers();
      if (!users) {
        this.logger.warn(`Users could not be fetched`);
      } else {
        this.logger.log(
          `Fetched users after ${attempts + 1} attempt${
            attempts > 1 ? "s" : ""
          }`,
        );
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "privy.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`PrivyService::getUsers ${err.message}`);
      const backOffTime = Math.min(360000, Math.pow(2, attempts) * 1000); // Cap back-off time to 60 seconds
      this.logger.warn(
        `Rate limited on get users request. Retrying after ${
          backOffTime / 1000
        } seconds...`,
      );
      await new Promise(resolve => setTimeout(resolve, backOffTime));
      return this.getUsers(attempts + 1);
    }
    return users;
  }

  async deletePrivyUser(userId: string): Promise<void> {
    await this.privy.deleteUser(userId).catch(err => {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "privy.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`PrivyService::deletePrivyUser ${err.message}`);
    });
  }
}
