import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { chunk } from "lodash";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { PrivyClient, WalletWithMetadata } from "@privy-io/server-auth";
import extractDomain from "src/shared/helpers/extract-domain";
import { notStringOrNull } from "src/shared/helpers";
import axios from "axios";
import { UserService } from "src/user/user.service";
// import { ScorerService } from "src/scorer/scorer.service";
// import { UNMIGRATED_USERS } from "src/shared/constants/unmigrated-users";
// import { ProfileService } from "../profile/profile.service";
// import { UserLeanStats } from "src/shared/interfaces";

type CreateResult = {
  results: Array<
    | {
        action: string;
        index: number;
        success: true;
        id: string;
      }
    | {
        action: string;
        index: number;
        success: false;
        code: number;
        error: string;
        cause: string;
      }
  >;
};

type ImportUserInput = {
  linked_accounts: {
    type: "wallet" | "email" | "github_oauth";
    chain_type?: string;
    address?: string;
    subject?: string;
    email?: string;
    name?: string;
    username?: string;
  }[];
  create_ethereum_wallet: boolean;
};

@Injectable()
export class PrivyService {
  private running = false;
  private logger = new CustomLogger(PrivyService.name);
  private privy: PrivyClient;
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly configService: ConfigService, // private readonly scorerService: ScorerService, // private readonly profileService: ProfileService,
    private readonly userService: UserService,
  ) {
    this.privy = new PrivyClient(
      this.configService.get<string>("PRIVY_APP_ID"),
      this.configService.get<string>("PRIVY_APP_SECRET"),
    );
  }

  async getUserLinkedWallets(userId: string): Promise<string[]> {
    const user = await this.privy.getUser(userId);
    return user.linkedAccounts
      .filter(x => x.type === "wallet" && x.walletClientType !== "privy")
      .map(x => (x as WalletWithMetadata).address);
  }

  async getUserEmbeddedWallet(userId: string): Promise<string> {
    const user = await this.privy.getUser(userId);
    return (
      user.linkedAccounts.find(
        x => x.type === "wallet" && x.walletClientType === "privy",
      ) as WalletWithMetadata
    )?.address;
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

  async unsafe__________deleteMigratedUsers(): Promise<void> {
    try {
      let counter = 0;
      const users = await this.privy.getUsers();
      this.logger.log(`Found ${users.length} users to delete`);
      for (const user of users) {
        this.logger.log(`Deleting user ${counter}/${users.length}`);
        await this.privy.deleteUser(user.id);
        counter++;
      }
      this.logger.log(`Deleted ${users.length} users`);
    } catch (error) {
      this.logger.error(`PrivyService::deleteMigratedUsers ${error}`);
    }
  }

  async sendChunk(
    users: ImportUserInput[],
    counter: number,
    attempts = 1,
  ): Promise<void> {
    try {
      this.logger.log(`Sending chunk ${counter} to privy. Attempt ${attempts}`);
      const response = await axios.post<CreateResult>(
        `https://auth.privy.io/api/v1/users/import`,
        {
          users,
        },
        {
          headers: {
            "privy-app-id": this.configService.get<string>("PRIVY_APP_ID"),
          },
          auth: {
            username: this.configService.get<string>("PRIVY_APP_ID"),
            password: this.configService.get<string>("PRIVY_APP_SECRET"),
          },
        },
      );
      if (response.status === 200) {
        await Promise.all(
          response.data.results.map(async (result, index) => {
            if (result.success === false) {
              if (result.code === 100) {
                this.logger.error(
                  `User with wallet ${
                    users[index].linked_accounts.find(x => x.type === "wallet")
                      ?.address
                  } failed to migrate on chunk ${counter} due to unknown error`,
                );
                this.logger.error(result);
              } else {
                this.logger.log(
                  `User with wallet ${
                    users[index].linked_accounts.find(x => x.type === "wallet")
                      ?.address
                  } failed to migrate on chunk ${counter} because it already exists. Skipping...`,
                );
              }
            } else {
              this.logger.log(
                `User with wallet ${
                  users[index].linked_accounts.find(x => x.type === "wallet")
                    ?.address
                } migrated successfully on chunk ${counter}`,
              );
              this.logger.log(`Storing their privy id and new wallet...`);
              const newWallet = await this.getUserEmbeddedWallet(result.id);
              await this.neogma.queryRunner.run(
                `
                MATCH (user:User {wallet: $wallet})
                SET user.wallet = $newWallet
                SET user.privyId = $privyId
                RETURN user
              `,
                {
                  wallet: users[index].linked_accounts.find(
                    x => x.type === "wallet",
                  )?.address,
                  newWallet,
                  privyId: result.id,
                },
              );
              const newUser = await this.privy.getUser(result.id);
              const role = await this.userService.getWalletRole(newWallet);
              await this.userService.createPrivyUser(
                newUser,
                newWallet,
                role.getName(),
              );
              this.logger.log(`Done!`);
            }
          }),
        );
      } else if (response.status === 429) {
        const backOffTime = Math.min(60000, Math.pow(2, attempts) * 1000); // Cap back-off time to 60 seconds
        this.logger.warn(
          `Rate limited on chunk ${counter}. Retrying after ${
            backOffTime / 1000
          } seconds...`,
        );
        await new Promise(resolve => setTimeout(resolve, backOffTime));
        await this.sendChunk(users, counter, attempts + 1);
      } else {
        this.logger.log(`Response status code was ${response.status}`);
        this.logger.log(response);
      }
      return;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "external-service-call",
          source: "privy.service",
        });
        Sentry.captureException(err);
      });
      this.logger.log(users);
      this.logger.error(`PrivyService::sendChunk ${err.message}`);
    }
  }

  async unsafe___________migrateUsers(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger.log("Starting privy migration");
    let counter = 1;
    this.logger.log(`Fetching org website hosts`);
    const orgWebsiteHosts = (
      await this.neogma.queryRunner.run(
        `
        MATCH (org:Organization)-[:HAS_WEBSITE]->(website:Website)
        RETURN apoc.data.url(website.url).host as host
      `,
      )
    ).records.map(record => record.get("host"));
    this.logger.log(`Found ${orgWebsiteHosts.length} org website hosts`);
    this.logger.log(`Fetching users from db`);
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (user:User)
        RETURN {
          wallet: user.wallet,
          email: apoc.coll.toSet([
            (user)-[:HAS_EMAIL]->(email:UserEmail) | email.email
          ]),
          github: [
            (user)-[:HAS_GITHUB_USER]->(gh:GithubUser) | gh {
              id: gh.id,
              login: gh.login,
              email: gh.email,
              name: gh.name
            }
          ][0]
        } as user
      `,
    );
    this.logger.log(`Found ${result.records.length} users`);
    this.logger.log(`Mapping users to privy format`);
    const users = result.records.map(record => {
      const user = record.get("user") as {
        wallet: string;
        email: string[];
        github: {
          id: string;
          login: string;
          email: string;
          name: string;
        } | null;
      };

      const linkedAccounts: ImportUserInput["linked_accounts"] = [
        {
          type: "wallet",
          chain_type: "ethereum",
          address: user.wallet,
        },
      ];

      if (user.email.length > 0) {
        let chosen = null;
        for (const email of user.email) {
          if (chosen === null) {
            if (email.includes("gmail")) {
              chosen = {
                type: "email" as const,
                address: email,
              };
            } else {
              if (user.email.length === 1) {
                chosen = {
                  type: "email" as const,
                  address: email,
                };
              } else {
                if (
                  !orgWebsiteHosts.includes(extractDomain(email, { tld: true }))
                ) {
                  chosen = {
                    type: "email" as const,
                    address: email,
                  };
                }
              }
            }
          }
        }
        if (chosen !== null) {
          linkedAccounts.push(chosen);
        }
      }

      if (user.github) {
        linkedAccounts.push({
          type: "github_oauth" as const,
          subject: user.github.id,
          email: notStringOrNull(user.github.email) ?? undefined,
          name: notStringOrNull(user.github.name) ?? undefined,
          username: user.github.login,
        });
      }

      return {
        linked_accounts: linkedAccounts,
        create_ethereum_wallet: true,
      };
    });

    this.logger.log(`Chunking users into batches of 20`);

    const chunks = chunk(users, 20);

    this.logger.log(`Found ${chunks.length} chunks`);

    this.logger.log(`Sending users to privy`);

    for (const chunk of chunks) {
      // this.logger.log(chunk);
      await this.sendChunk(chunk, counter);
      counter++;
    }

    this.logger.log(`Completed privy migration of ${users.length} users`);

    this.running = false;
  }

  // async checkRelevantUnMigratedUsers(): Promise<void> {
  //   this.logger.log(`Fetching lean stats for ${UNMIGRATED_USERS.length} users`);
  //   const all = UNMIGRATED_USERS.map(x => ({
  //     github: x.user.login,
  //     wallet: x.user.wallet,
  //   }));

  //   const chunks = chunk(all, 20);
  //   const cryptoNatives = [];
  //   const cryptoAjacents = [];
  //   for (const chunk of chunks) {
  //     const leanStats = await this.scorerService.getLeanStats(chunk);
  //     cryptoNatives.push(...leanStats.filter(x => x.is_native));
  //     cryptoAjacents.push(...leanStats.filter(x => x.is_adjacent));
  //   }
  //   const users: UserLeanStats[] = [...cryptoNatives, ...cryptoAjacents];
  //   this.logger.log(`Lean stats fetched`);
  //   this.logger.log(`Fetching work history for ${users.length} users`);
  //   const workHistories = await this.scorerService.getWorkHistory(
  //     users.map(x => x.actor_login),
  //   );
  //   this.logger.log(`Work history fetched`);
  //   this.logger.log(`Refreshing user cache lock, work history and lean stats`);
  //   for (const user of users) {
  //     const { wallet, actor_login: username } = user;
  //     await this.profileService.refreshUserCacheLock([wallet]);

  //     const leanStats = user;

  //     await this.profileService.refreshWorkHistoryCache(
  //       wallet,
  //       workHistories.find(x => x.user === username)?.workHistory ?? [],
  //       leanStats,
  //     );

  //     const orgs = await this.scorerService.getUserOrgs(username);

  //     await this.profileService.refreshUserRepoCache(wallet, orgs);
  //   }
  //   this.logger.log(`Mission accomplished`);
  // }
}
