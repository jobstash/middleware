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

  async createUser(data: {
    wallets: string[];
    email: string | null;
    github: string | null;
    name: string;
  }): Promise<User> {
    const client = this.privy;
    type X = Parameters<typeof client.importUser>[0]["linkedAccounts"][0];
    const linkedAccounts: X[] = [];

    if (data.wallets.length > 0) {
      linkedAccounts.push(
        ...data.wallets.map(
          x =>
            ({
              type: "wallet",
              walletClientType: "rainbow",
              address: x,
              chainType: "ethereum",
              connectorType: "wallet_connect",
            }) as X,
        ),
      );
    }

    if (data.email) {
      linkedAccounts.push({
        type: "email",
        address: data.email,
      });
    }

    if (data.github) {
      linkedAccounts.push({
        type: "github_oauth",
        username: data.github,
        subject: "-1",
        email: data.email,
        name: data.name,
      });
    }

    try {
      const user = await client.importUser({
        linkedAccounts,
        createEthereumWallet: true,
        createSolanaWallet: false,
      });
      return user;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "privy.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`PrivyService::createUser ${err.message}`);
    }
  }

  async getUserEmbeddedWallet(userId: string): Promise<string | undefined> {
    const user = await this.getUserById(userId);
    if (user?.linkedAccounts) {
      return (
        user.linkedAccounts.find(
          x => x.type === "wallet" && x.walletClientType === "privy",
        ) as WalletWithMetadata
      )?.address;
    }
    return undefined;
  }

  async extractEmbeddedWallet(user: User): Promise<string | undefined> {
    if (user?.linkedAccounts) {
      return (
        user.linkedAccounts.find(
          x => x.type === "wallet" && x.walletClientType === "privy",
        ) as WalletWithMetadata
      )?.address;
    }
    return undefined;
  }

  async getUserById(userId: string, attempts = 0): Promise<User | undefined> {
    let user: User;
    if (attempts > 5) {
      this.logger.warn(
        `PrivyService::getUserById rate limited, returning undefined after ${attempts} attempts`,
      );
      return undefined;
    }
    try {
      user = await this.privy.getUserById(userId);
      if (!user?.linkedAccounts) {
        this.logger.warn(`User has no linked accounts`);
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
        return this.getUserById(userId, attempts + 1);
      }
    }
    return user;
  }

  async getUserByEmail(email: string, attempts = 0): Promise<User | undefined> {
    let user: User;
    if (attempts > 5) {
      this.logger.warn(
        `PrivyService::getUserByEmail rate limited, returning undefined after ${attempts} attempts`,
      );
      return undefined;
    }
    try {
      user = await this.privy.getUserByEmail(email);
      if (!user?.linkedAccounts) {
        this.logger.warn(`User has no linked accounts`);
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
        return this.getUserByEmail(email, attempts + 1);
      }
    }
    return user;
  }

  async getUserLinkedWallets(userId: string): Promise<string[]> {
    const user = await this.getUserById(userId);
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

  async getClient(): Promise<PrivyClient> {
    return this.privy;
  }
}
