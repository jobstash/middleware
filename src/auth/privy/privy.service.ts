import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import {
  PrivyClient,
  User,
  LinkedAccount,
  NotFoundError,
} from "@privy-io/node";
import { UserCreateParams } from "@privy-io/node/resources";

@Injectable()
export class PrivyService {
  private readonly logger = new CustomLogger(PrivyService.name);
  private readonly privy: PrivyClient;
  constructor(private readonly configService: ConfigService) {
    this.privy = new PrivyClient({
      appId: this.configService.get<string>("PRIVY_APP_ID"),
      appSecret: this.configService.get<string>("PRIVY_APP_SECRET"),
    });
  }

  async createUser(data: {
    wallets: string[];
    email: string | null;
    github: string | null;
    name: string;
  }): Promise<User> {
    const client = this.privy;
    type X = UserCreateParams["linked_accounts"][number];
    const linkedAccounts: X[] = [];

    if (data.wallets.length > 0) {
      linkedAccounts.push(
        ...data.wallets.map(
          x =>
            ({
              type: "wallet",
              wallet_client_type: "rainbow",
              address: x,
              chain_type: "ethereum",
              connector_type: "wallet_connect",
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
      const user = await client.users().create({
        linked_accounts: linkedAccounts,
        wallets: [{ chain_type: "ethereum" }],
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

  async getOrCreateUserEmbeddedWallet(user: User): Promise<string | undefined> {
    const embeddedWallet = this.extractEmbeddedWallet(user);
    if (embeddedWallet) {
      return embeddedWallet;
    } else {
      try {
        const { address: newEmbeddedWallet } = await this.privy
          .wallets()
          .create({
            chain_type: "ethereum",
            owner: { user_id: user.id },
          });
        return newEmbeddedWallet;
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "privy.service",
          });
          Sentry.captureException(error);
        });
        this.logger.error(
          `PrivyService::getOrCreateUserEmbeddedWallet ${error.message}`,
        );
        return undefined;
      }
    }
  }

  private extractEmbeddedWallet(user: User): string | undefined {
    if (user?.linked_accounts) {
      return (
        user.linked_accounts.find(
          x => x.type === "wallet" && x.wallet_client_type === "privy",
        ) as Extract<LinkedAccount, { type: "wallet" }>
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
      user = await this.privy.users()._get(userId);
      if (!user?.linked_accounts) {
        this.logger.warn(`User has no linked accounts`);
      } else {
        this.logger.log(
          `Fetched user after ${attempts + 1} attempt${
            attempts > 1 ? "s" : ""
          }`,
        );
      }
    } catch (err) {
      if (err instanceof NotFoundError) {
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
      user = await this.privy.users().getByEmailAddress({ address: email });
      if (!user?.linked_accounts) {
        this.logger.warn(`User has no linked accounts`);
      } else {
        this.logger.log(
          `Fetched user after ${attempts + 1} attempt${
            attempts > 1 ? "s" : ""
          }`,
        );
      }
    } catch (err) {
      if (err instanceof NotFoundError) {
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
    if (user?.linked_accounts) {
      return user.linked_accounts
        .filter(
          (account): account is Extract<LinkedAccount, { type: "wallet" }> =>
            account.type === "wallet" && account.wallet_client_type !== "privy",
        )
        .map(account => account.address);
    } else {
      return [];
    }
  }

  async getUsers(attempts = 1): Promise<User[]> {
    let users: User[];
    try {
      users = [];
      for await (const user of this.privy.users().list()) users.push(user);
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
    await this.privy
      .users()
      .delete(userId)
      .catch(err => {
        if (err instanceof NotFoundError) return;
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "privy.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`PrivyService::deletePrivyUser ${err.message}`);
        throw err;
      });
  }

  getClient(): Promise<PrivyClient> {
    return Promise.resolve(this.privy);
  }
}
