import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  UserAvailableForWork,
  UserAvailableForWorkEntity,
  ResponseWithNoData,
  ResponseWithOptionalData,
  User,
  UserEntity,
  UserProfile,
  UserProfileEntity,
  data,
  UserPermission,
  TalentListWithUsers,
  TalentListWithUsersEntity,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { CreateUserDto } from "./dto/create-user.dto";
import { ModelService } from "src/model/model.service";
import { instanceToNode, randomToken, slugify } from "src/shared/helpers";
import { randomUUID } from "crypto";
import { GetAvailableUsersInput } from "./dto/get-available-users.input";
import { ConfigService } from "@nestjs/config";
import { ProfileService } from "src/auth/profile/profile.service";
import {
  User as PrivyUser,
  WalletWithMetadata,
  LinkedAccountWithMetadata,
} from "@privy-io/server-auth";
import { PrivyService } from "src/auth/privy/privy.service";
import { PermissionService } from "./permission.service";
import { CheckWalletPermissions } from "src/shared/constants";
import { Subscription } from "src/shared/interfaces/org";
import { uniq } from "lodash";
import {
  PrivyTransferEventPayload,
  PrivyUpdateEventPayload,
  PrivyCreateEventPayload,
} from "src/auth/privy/dto/webhook.payload";
import { UpdateTalentListInput } from "./dto/update-talent-list.input";
import { CreateTalentListInput } from "./dto/create-talent-list.input";
import { TalentList, TalentListEntity } from "src/shared/types";
import { UpdateTalentListNameInput } from "./dto/update-talent-list-name.input";
import { sort } from "fast-sort";

@Injectable()
export class UserService {
  private readonly logger = new CustomLogger(UserService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly privyService: PrivyService,
    private readonly permissionService: PermissionService,
  ) {}

  async findByWallet(wallet: string): Promise<UserEntity | undefined> {
    return this.models.Users.findOne({ where: { wallet } })
      .then(res => (res ? new UserEntity(instanceToNode(res)) : undefined))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::findByWallet ${err.message}`);
        return undefined;
      });
  }

  async findProfileByWallet(wallet: string): Promise<UserProfile | undefined> {
    return this.profileService.getUserProfile(wallet).catch(err => {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::findProfileByWallet ${err.message}`);
      return undefined;
    });
  }

  async findOrgOwnerProfileByOrgId(
    orgId: string,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    const result = await this.neogma.queryRunner.run(
      `
          MATCH (user:User)-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(:Organization {orgId: $orgId})
          RETURN user.wallet as wallet
        `,
      { orgId },
    );
    const wallet = result.records[0]?.get("wallet");
    return this.profileService.getUserProfile(wallet).catch(err => {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::findProfileByWallet ${err.message}`);
      return undefined;
    });
  }

  async findByGithubNodeId(nodeId: string): Promise<UserEntity | undefined> {
    return this.models.Users.findRelationships({
      where: { target: { nodeId } },
      alias: "githubUser",
      limit: 1,
    })
      .then(res =>
        res[0]?.source
          ? new UserEntity(instanceToNode(res[0].source))
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::findByNodeId ${err.message}`);
        return undefined;
      });
  }

  async findOrgIdByMemberUserWallet(wallet: string): Promise<string | null> {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(org:Organization)
        RETURN org.orgId as orgId
      `,
      { wallet },
    );

    return result.records[0]?.get("orgId") as string;
  }

  async findOrgIdByJobShortUUID(shortUUID: string): Promise<string | null> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(:StructuredJobpost {shortUUID: $shortUUID})
        RETURN org.orgId as orgId
      `,
        { shortUUID },
      );

      return result.records[0]?.get("orgId") as string;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::findOrgIdByJobShortUUID ${err.message}`);
      return null;
    }
  }

  async getUserEmails(
    wallet: string,
  ): Promise<{ email: string; main: boolean }[]> {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (user:User {wallet: $wallet})-[:HAS_EMAIL]->(email:UserEmail)
        RETURN email { .* } as email
      `,
      { wallet },
    );

    return result.records.map(record => ({
      email: record.get("email").email,
      main: record.get("email").main ?? false,
    }));
  }

  async userHasEmail(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    const result = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS((:User)-[:HAS_EMAIL]->(:UserEmail {normalized: $normalizedEmail})) AS hasEmail
      `,
      { normalizedEmail },
    );

    return result.records[0]?.get("hasEmail") as boolean;
  }

  async isOrgMember(wallet: string, orgId: string): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        RETURN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(:Organization {orgId: $orgId})) AS hasOrgAuthorization
      `,
        { wallet, orgId },
      );

      return result.records[0]?.get("hasOrgAuthorization") as boolean;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::isOrgMember ${err.message}`);
      return false;
    }
  }

  async isOrgOwner(wallet: string, orgId: string): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        RETURN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(:Organization {orgId: $orgId})) AS hasOrgAuthorization
      `,
        { wallet, orgId },
      );

      return result.records[0]?.get("hasOrgAuthorization") as boolean;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::isOrgOwner ${err.message}`);
      return false;
    }
  }

  async orgHasOwner(orgId: string): Promise<boolean> {
    const result = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(:Organization {orgId: $orgId})) AS hasOrgAuthorization
      `,
      { orgId },
    );

    return result.records[0]?.get("hasOrgAuthorization") as boolean;
  }

  async userAuthorizedForJobFolder(
    wallet: string,
    id: string,
  ): Promise<boolean> {
    const result = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS((:User {wallet: $wallet})-[:CREATED_FOLDER]->(:JobpostFolder {id: $id})) AS hasFolderAuthorization
      `,
      { wallet, id },
    );

    return result.records[0]?.get("hasFolderAuthorization") as boolean;
  }

  normalizeEmail(original: string | null): string | null {
    const specialChars = "!@#$%^&*<>()-+=,";
    if (!original) {
      return null;
    }
    const normalized = original
      .split("")
      .map(x => {
        if (specialChars.includes(x)) {
          return "";
        } else {
          return x;
        }
      })
      .join("");
    return normalized.toLowerCase();
  }

  async addUserEmail(
    wallet: string,
    email: string,
  ): Promise<ResponseWithOptionalData<UserEntity>> {
    if (await this.userHasEmail(email)) {
      return {
        success: false,
        message: "Email already has a user associated with it",
      };
    } else {
      const normalizedEmail = this.normalizeEmail(email);
      const result = await this.neogma.queryRunner
        .run(
          `
          MATCH (u:User {wallet: $wallet})
          MERGE (u)-[:HAS_EMAIL]->(email:UserUnverifiedEmail {email: $email, normalized: $normalizedEmail})
          RETURN u
        `,
          {
            wallet,
            email,
            normalizedEmail,
          },
        )
        .then(res =>
          res.records.length
            ? {
                success: true,
                message: "User email added successfully",
                data: new UserEntity(res.records[0].get("u")),
              }
            : {
                success: false,
                message: "Failed to add user email",
              },
        )
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "user.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(`UserService::addUserEmail ${err.message}`);
          return {
            success: false,
            message: "Failed to add user email",
          };
        });
      return result;
    }
  }

  async updateUserMainEmail(
    wallet: string,
    email: string,
  ): Promise<ResponseWithOptionalData<UserEntity>> {
    if (!(await this.userHasEmail(email))) {
      return {
        success: false,
        message: "Email is not associated with this user",
      };
    } else {
      const normalizedEmail = this.normalizeEmail(email);

      const userEmails = await this.getUserEmails(wallet);

      if (userEmails.find(x => x.email === email && x.main === true)) {
        return {
          success: false,
          message: "Email is already associated with this user as main",
        };
      }

      const oldMainEmail = userEmails.find(x => x.main === true);

      const normalizedOldMainEmail = this.normalizeEmail(oldMainEmail?.email);

      await this.neogma.queryRunner
        .run(
          `
        MATCH (u:User {wallet: $wallet})-[:HAS_EMAIL]->(oldMain:UserEmail {email: $email, normalized: $normalizedEmail})
        SET oldMain.main = false
        `,
          {
            wallet,
            email: oldMainEmail?.email,
            normalizedEmail: normalizedOldMainEmail,
          },
        )
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "user.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(`UserService::updateUserMainEmail ${err.message}`);
          return undefined;
        });

      return this.neogma.queryRunner
        .run(
          `
          MATCH (u:User {wallet: $wallet})-[:HAS_EMAIL]->(email:UserEmail {email: $email, normalized: $normalizedEmail})
          SET email.main = true
          RETURN u
        `,
          { wallet, email, normalizedEmail },
        )
        .then(res =>
          res.records.length
            ? {
                success: true,
                message: "User main email updated successfully",
                data: new UserEntity(res.records[0].get("u")),
              }
            : {
                success: false,
                message: "Failed to update user main email",
              },
        )
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "user.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(`UserService::updateUserMainEmail ${err.message}`);
          return {
            success: false,
            message: "Failed to update user main email",
          };
        });
    }
  }

  async removeUserEmail(
    wallet: string,
    email: string,
  ): Promise<ResponseWithOptionalData<UserEntity>> {
    if (!(await this.userHasEmail(email))) {
      return {
        success: false,
        message: "Email is not associated with this user",
      };
    } else {
      const normalizedEmail = this.normalizeEmail(email);
      const result = await this.neogma.queryRunner
        .run(
          `
          MATCH (u:User {wallet: $wallet})
          MATCH (u)-[:HAS_EMAIL]->(email:UserEmail {email: $email, normalized: $normalizedEmail})
          DETACH DELETE email
          RETURN u
        `,
          { wallet, email, normalizedEmail },
        )
        .then(res =>
          res.records.length
            ? {
                success: true,
                message: "User email removed successfully",
                data: new UserEntity(res.records[0].get("u")),
              }
            : {
                success: false,
                message: "Failed to remove user email",
              },
        )
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "user.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(`UserService::removeUserEmail ${err.message}`);
          return {
            success: false,
            message: "Failed to remove user email",
          };
        });

      await this.profileService.getUserWorkHistory(wallet);

      return result;
    }
  }

  async getUserWallet(email: string): Promise<string | undefined> {
    const normalizedEmail = this.normalizeEmail(email);
    const result = await this.neogma.queryRunner
      .run(
        `
          MATCH (u:User)-[r:HAS_EMAIL]->(email:UserUnverifiedEmail {normalized: $normalizedEmail})
          RETURN u.wallet as wallet
        `,
        { normalizedEmail },
      )
      .then(res =>
        res.records.length ? res.records[0].get("wallet") : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::getUserWallet ${err.message}`);
        return undefined;
      });
    return result;
  }

  async getEmbeddedWalletByLinkedWallet(
    linkedWallet: string,
  ): Promise<string | undefined> {
    const result = await this.neogma.queryRunner
      .run(
        `
          MATCH (u:User)-[r:HAS_LINKED_WALLET]->(:LinkedWallet {address: $linkedWallet})
          RETURN u.wallet as wallet
        `,
        { linkedWallet },
      )
      .then(res =>
        res.records.length ? res.records[0].get("wallet") : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(
          `UserService::getUserWalletByLinkedWallet ${err.message}`,
        );
        return undefined;
      });
    return result;
  }

  async getPrivyId(wallet: string): Promise<string | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet:$wallet})
          RETURN u.privyId as privyId
        `,
        { wallet },
      )
      .then(res =>
        res.records.length ? res.records[0].get("privyId") : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::getPrivyId ${err.message}`);
        return undefined;
      });
  }

  async getEmbeddedWallet(privyId: string): Promise<string | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {privyId:$privyId})
          RETURN u.wallet as wallet
        `,
        { privyId },
      )
      .then(res =>
        res.records.length ? res.records[0].get("wallet") : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::getEmbeddedWallet ${err.message}`);
        return undefined;
      });
  }

  async verifyUserEmail(email: string): Promise<UserEntity | undefined> {
    const normalizedEmail = this.normalizeEmail(email);

    const result = await this.neogma.queryRunner
      .run(
        `
          MATCH (u:User)-[r:HAS_EMAIL]->(email:UserUnverifiedEmail {normalized: $normalizedEmail})
          CREATE (u)-[:HAS_EMAIL]->(:UserEmail {email: $email, normalized: $normalizedEmail})
          DELETE r, email
          RETURN u
        `,
        { email, normalizedEmail },
      )
      .then(res =>
        res.records.length
          ? new UserEntity(res.records[0].get("u"))
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::verifyUserEmail ${err.message}`);
        return undefined;
      });
    return result;
  }

  async syncUserLinkedWallets(
    wallet: string,
    privyUser: PrivyUser,
  ): Promise<void> {
    try {
      const wallets =
        privyUser?.linkedAccounts
          ?.filter(x => x.type === "wallet" && x.walletClientType !== "privy")
          ?.map(x => (x as WalletWithMetadata).address) ?? [];
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        UNWIND $wallets as wallet
        MERGE (user)-[:HAS_LINKED_WALLET]->(newWallet:LinkedWallet {address: wallet})
        ON CREATE
          SET newWallet.id = randomUUID(),
            newWallet.createdTimestamp = timestamp()
        ON MATCH
          SET newWallet.updatedTimestamp = timestamp()
        RETURN user
        `,
        { wallet, wallets },
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::syncUserLinkedWallets ${err.message}`);
    }
  }

  private async create(dto: CreateUserDto): Promise<UserEntity> {
    return this.models.Users.createOne(
      {
        id: randomUUID(),
        privyId: dto.privyId ?? null,
        name: dto.name ?? null,
        available: false,
        wallet: dto.wallet,
        createdTimestamp: new Date().getTime(),
        updatedTimestamp: new Date().getTime(),
      },
      {
        validate: false,
      },
    )
      .then(res => (res ? new UserEntity(instanceToNode(res)) : undefined))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          scope.setExtra("input", dto);
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::create ${err.message}`);
        return undefined;
      });
  }

  async upsertPrivyUser(
    user: PrivyUser,
    embeddedWallet: string,
  ): Promise<ResponseWithOptionalData<User>> {
    try {
      const storedUser = await this.findByWallet(embeddedWallet);

      if (storedUser) {
        this.logger.log(`User ${embeddedWallet} already exists.`);
        return {
          success: true,
          message: "User already exists",
          data: storedUser.getProperties(),
        };
      } else {
        const newUserDto = {
          wallet: embeddedWallet,
          privyId: user.id,
          name:
            user.farcaster?.displayName ??
            user.google?.name ??
            user.apple?.subject ??
            user.github?.name ??
            (user.telegram
              ? `${user.telegram.firstName} ${user.telegram.lastName}`
              : null) ??
            user.discord?.subject ??
            user.twitter?.name ??
            null,
        };

        this.logger.log(
          `/user/createPrivyUser: Creating privy user with wallet ${embeddedWallet}`,
        );

        const newUser = await this.create(newUserDto);

        if (newUser) {
          await this.permissionService.syncUserPermissions(embeddedWallet, [
            CheckWalletPermissions.USER,
          ]);

          return {
            success: true,
            message: "User created successfully",
            data: newUser.getProperties(),
          };
        } else {
          this.logger.error(`UserService::createPrivyUser error creating user`);
          return {
            success: false,
            message: "Error creating user",
          };
        }
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "user.service",
        });
        scope.setExtra("input", embeddedWallet);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::createPrivyUser ${err.message}`);
      return undefined;
    }
  }

  async getActiveSubscriptions(wallet: string): Promise<string[]> {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (user:User {wallet: $wallet})-[:OCCUPIES]->(seat:OrgUserSeat {seatType: "owner"})<-[:HAS_USER_SEAT]-(org:Organization)-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
        WHERE subscription.status = "active"
        RETURN org.orgId as orgId
      `,
      { wallet },
    );
    return result.records.map(x => x.get("orgId"));
  }

  async deletePrivyUser(wallet: string): Promise<ResponseWithNoData> {
    try {
      const userId = await this.getPrivyId(wallet);
      this.logger.log(`/user/deletePrivyUser ${userId}`);
      this.privyService.deletePrivyUser(userId);
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        OPTIONAL MATCH (user)-[:OCCUPIES]->(seat:OrgUserSeat {seatType: "owner"})<-[:HAS_USER_SEAT]-(:Organization)-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)-[:HAS_QUOTA|HAS_PAYMENT|HAS_SERVICE]->(node)
        OPTIONAL MATCH (user)-[:HAS_PENDING_PAYMENT|MADE_SUBSCRIPTION_PAYMENT|USED_QUOTA]->(nodes)
        OPTIONAL MATCH (user)-[cr:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        OPTIONAL MATCH (user)-[lw:HAS_LINKED_WALLET]->(wallet:LinkedWallet)
        OPTIONAL MATCH (user)-[pcr:HAS_PREFERRED_CONTACT_INFO]->(preferred: UserPreferredContactInfo)
        OPTIONAL MATCH (user)-[rr:LEFT_REVIEW]->(:OrgReview)
        OPTIONAL MATCH (user)-[gr:HAS_GITHUB_USER]->(:GithubUser)
        OPTIONAL MATCH (user)-[scr:HAS_SHOWCASE]->(showcase:UserShowCase)
        OPTIONAL MATCH (user)-[ul:HAS_LOCATION]->(location:UserLocation)
        OPTIONAL MATCH (user)-[sr:HAS_SKILL]->(:LegacyTag)
        OPTIONAL MATCH (user)-[er:HAS_EMAIL]->(email:UserEmail|UserUnverifiedEmail)
        OPTIONAL MATCH (user)-[ja:APPLIED_TO|BOOKMARKED|VIEWED_DETAILS]->()
        OPTIONAL MATCH (user)-[ds:DID_SEARCH]->(search:SearchHistory)
        OPTIONAL MATCH (user)-[cl:HAS_CACHE_LOCK]->(lock:UserCacheLock)
        OPTIONAL MATCH (user)-[oa:OCCUPIES]->()
        OPTIONAL MATCH (user)-[:HAS_ADJACENT_REPO]->(adjacentRepo: UserAdjacentRepo)
        OPTIONAL MATCH (user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount)
        OPTIONAL MATCH (user)-[:HAS_WORK_HISTORY]->(wh:UserWorkHistory)-[:WORKED_ON_REPO]->(whr:UserWorkHistoryRepo)
        DETACH DELETE user, lw, wallet, pcr, cr, preferred, contact, rr, gr, scr, showcase, ul, location, sr, er, email, ja, ds, cl, search, lock, oa, wh, whr, adjacentRepo, account, seat, subscription, node, nodes
      `,
        { wallet },
      );
      return {
        success: true,
        message: "User account deleted successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::deletePrivyUser ${err.message}`);
      return {
        success: false,
        message: "Error deleting user account",
      };
    }
  }

  async getOrgUserCount(orgId: string): Promise<number> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (u:User)-[:OCCUPIES|HAS_USER_SEAT]->(:Organization {orgId: $orgId})
          RETURN COUNT(u) AS count
        `,
        { orgId },
      );
      return Number(result.records[0]?.get("count") ?? 0);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::getOrgUserCount ${err.message}`);
      return 0;
    }
  }

  async addOrgUser(
    orgId: string,
    wallet: string,
    subscription: Subscription,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log(`Adding org user ${wallet} to org`);
      if (subscription.isActive()) {
        this.logger.log("Org subscription is active");
        this.logger.log("Checking org user count");
        const userCount = await this.getOrgUserCount(orgId);
        if (userCount < subscription.totalSeats) {
          this.logger.log("Org user count is less than max seats");
          this.logger.log("Checking if org owner");
          const isOwner = !(await this.orgHasOwner(orgId));
          const seatId = randomToken(8);
          const verifications = data(
            await this.profileService.getUserVerifications(wallet),
          );
          const org = verifications.find(x => x.id === orgId);

          if (org) {
            if (org.credential === "email") {
              this.logger.log("User is verified for org by email");
              await this.neogma.queryRunner.run(
                `
                  CREATE (seat: OrgUserSeat {id: randomUUID(), seatType: $seatType, seatId: $seatId})

                  WITH seat
                  MATCH (org:Organization {orgId: $orgId}), (user:User {wallet: $wallet})
                  MERGE (user)-[:OCCUPIES]->(seat)<-[:HAS_USER_SEAT]-(org)
                  ON CREATE SET
                    seat.createdTimestamp = timestamp()
                  ON MATCH SET
                    seat.updatedTimestamp = timestamp()
                `,
                {
                  seatType: isOwner ? "owner" : "member",
                  seatId,
                  orgId,
                  wallet,
                },
              );
              const userPermissions =
                await this.permissionService.getPermissionsForWallet(wallet);

              this.logger.log("Syncing user permissions");

              await this.syncUserPermissions(
                wallet,
                [
                  ...userPermissions.map(x => x.name),
                  CheckWalletPermissions.ORG_MEMBER,
                  isOwner ? CheckWalletPermissions.ORG_OWNER : null,
                ].filter(Boolean),
              );
              this.logger.log("Synced user permissions");
              return {
                success: true,
                message: `User signed up to org ${isOwner ? "owner" : "member"} seat successfully`,
              };
            } else {
              this.logger.log("User is not authorized to join org");
              return {
                success: false,
                message: `User not authorized to join org`,
              };
            }
          } else {
            this.logger.log("User cannot own or join org");
            return {
              success: false,
              message: "User not authorized to join this org",
            };
          }
        } else {
          this.logger.log("Org user count is greater than max seats");
          return {
            success: false,
            message: `Organization has reached its maximum number of members`,
          };
        }
      } else {
        this.logger.log("Org subscription is not active");
        return {
          success: false,
          message:
            "Organization cannot have users without an active subscription",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::addOrgUser ${err.message}`);
      return {
        success: false,
        message: "Error adding org user",
      };
    }
  }

  async removeOrgUser(orgId: string, wallet: string): Promise<void> {
    await this.neogma.queryRunner.run(
      `
        MATCH (user:User {wallet: $wallet})-[r:OCCUPIES]->(:OrgUserSeat)-[:HAS_USER_SEAT]->(:Organization {orgId: $orgId})
        DELETE r
      `,
      { orgId, wallet },
    );
  }

  async transferOrgSeat(
    orgId: string,
    fromWallet: string,
    toWallet: string,
  ): Promise<void> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $fromWallet})-[r:OCCUPIES]->(seat:OrgUserSeat)-[:HAS_USER_SEAT]->(:Organization {orgId: $orgId})
        DELETE r

        WITH seat
        MATCH (user2:User {wallet: $toWallet})
        MERGE (user2)-[:OCCUPIES]->(seat)
        RETURN seat
      `,
        { orgId, fromWallet, toWallet },
      );
      const seat = result.records[0]?.get("seat");
      if (seat) {
        const fromPermissions = (await this.getUserPermissions(fromWallet))
          .map(x => x.name)
          .filter(x => !["ORG_MEMBER", "ORG_OWNER"].includes(x));
        const toPermissions = (await this.getUserPermissions(toWallet))
          .map(x => x.name)
          .filter(x => !["ORG_MEMBER", "ORG_OWNER"].includes(x));
        await this.syncUserPermissions(fromWallet, fromPermissions);
        await this.syncUserPermissions(
          toWallet,
          [
            ...toPermissions,
            CheckWalletPermissions.ORG_MEMBER,
            seat.seatType === "owner" ? CheckWalletPermissions.ORG_OWNER : null,
          ].filter(Boolean),
        );
      } else {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "domain",
            source: "user.service",
          });
          scope.setExtra("input", { orgId, fromWallet, toWallet });
          Sentry.captureMessage("Failled seat transfer");
        });
        this.logger.warn(`UserService::transferOrgSeat Failed seat transfer`);
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        scope.setExtra("input", { orgId, fromWallet, toWallet });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::transferOrgSeat ${err.message}`);
    }
  }

  async getCryptoNativeStatus(wallet: string): Promise<boolean | undefined> {
    const initial = await this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet: $wallet})
          RETURN u.cryptoNative as cryptoNative
        `,
        { wallet },
      )
      .then(res =>
        res.records.length
          ? (res.records[0].get("cryptoNative") as boolean)
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::getCryptoNativeStatus ${err.message}`);
        return undefined;
      });

    if (initial === undefined) {
      await this.profileService.getUserWorkHistory(wallet);
      return this.getCryptoNativeStatus(wallet);
    } else {
      return initial;
    }
  }

  async getUserPermissions(wallet: string): Promise<UserPermission[]> {
    return this.permissionService.getPermissionsForWallet(wallet);
  }

  async syncUserPermissions(
    wallet: string,
    permissions: string[],
  ): Promise<void> {
    return this.permissionService.syncUserPermissions(wallet, permissions);
  }

  async getTalentLists(
    orgId: string,
  ): Promise<ResponseWithOptionalData<TalentList[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (org:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList)
        RETURN list { .* } as list
      `,
        { orgId },
      );
      return {
        success: true,
        message: "Talent lists retrieved successfully",
        data: result.records.map(record =>
          new TalentListEntity(record.get("list")).getProperties(),
        ),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`UserService::getTalentLists ${error.message}`);
      return {
        success: false,
        message: "Error retrieving talent lists",
      };
    }
  }

  async createTalentList(
    orgId: string,
    body: CreateTalentListInput,
  ): Promise<ResponseWithOptionalData<TalentList>> {
    const { name } = body;
    const normalizedName = slugify(name);

    try {
      const existing = await this.neogma.queryRunner.run(
        `
        MATCH (:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList {normalizedName: $normalizedName})
        RETURN list
      `,
        { orgId, normalizedName },
      );

      if (existing.records.length > 0) {
        throw new BadRequestException({
          success: false,
          message: "A talent list with that name already exists",
        });
      }

      const result = await this.neogma.queryRunner.run(
        `
        MATCH (org:Organization {orgId: $orgId})
        MERGE (list:TalentList {normalizedName: $normalizedName})
        ON CREATE SET
          list.id = randomUUID(),
          list.name = $name,
          list.description = $description,
          list.createdTimestamp = timestamp()
        ON MATCH SET
          list.updatedTimestamp = timestamp()
        MERGE (org)-[:HAS_TALENT_LIST]->(list)
        RETURN list { .* } as list
      `,
        { orgId, ...body, normalizedName },
      );

      return {
        success: true,
        message: "Talent list created successfully",
        data: new TalentListEntity(
          result.records[0].get("list"),
        ).getProperties(),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        scope.setExtra("input", { orgId, ...body, normalizedName });
        Sentry.captureException(error);
      });
      this.logger.error(`UserService::createTalentList ${error.message}`);
      return {
        success: false,
        message: `Error creating talent list: ${error.message}`,
      };
    }
  }

  async getTalentList(
    orgId: string,
    normalizedName: string,
  ): Promise<ResponseWithOptionalData<TalentListWithUsers>> {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (org:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList {normalizedName: $normalizedName})
            
        OPTIONAL MATCH (list)-[:HAS_TALENT]->(user:User)
        WHERE user.available
          AND NOT EXISTS { (user)-[:VERIFIED_FOR_ORG]->(org) }
            
        WITH list, org, user
            
        OPTIONAL MATCH (user)-[app:APPLIED_TO]->(job:StructuredJobpost)
        WITH list, org,
            collect(DISTINCT user) AS users,
            collect(DISTINCT job) AS jobs,
            max(app.createdTimestamp) AS lastAppliedTimestamp
            
        CALL {
          WITH jobs
          UNWIND jobs AS j
          OPTIONAL MATCH (j)-[:HAS_CLASSIFICATION]->(c:JobpostClassification)
          WITH collect(c.name) AS names
          RETURN apoc.map.fromPairs(
            [n IN apoc.coll.toSet(names) |
              [n, size([x IN names WHERE x = n])]]
            ) AS classFreq
        }

        CALL {
          WITH jobs
          UNWIND jobs AS j
          OPTIONAL MATCH (j)-[:HAS_TAG]->(tag:LegacyTag)
          OPTIONAL MATCH (tag)-[:HAS_TAG_DESIGNATION]->(d:TagDesignation)
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(syn:LegacyTag)-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
          OPTIONAL MATCH (tag)-[:IS_PAIR_OF]->(pair:LegacyTag)-[:HAS_TAG_DESIGNATION]->(:PairedDesignation)
          WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:LegacyTag)--(:BlockedDesignation)
            AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
            AND (d:AllowedDesignation OR d:DefaultDesignation)
          WITH collect(
            CASE
              WHEN syn  IS NOT NULL THEN syn.name
              WHEN pair IS NOT NULL THEN pair.name
              ELSE tag.name
            END) AS names
          RETURN apoc.map.fromPairs(
                [n IN apoc.coll.toSet(names) |
                  [n, size([x IN names WHERE x = n])]]
              ) AS tagFreq
        }

        CALL {
          WITH users, lastAppliedTimestamp, classFreq, tagFreq
          UNWIND users AS user
          RETURN collect({
              id: user.id,
              wallet: user.wallet,
              cryptoNative: user.cryptoNative,
              cryptoAdjacent: user.cryptoAdjacent,
              attestations: {upvotes: null, downvotes: null},
              note: [
                (user)-[:HAS_RECRUITER_NOTE]->(n:RecruiterNote)
                <-[:HAS_TALENT_NOTE]-(org) | n.note
              ][0],
              availableForWork: user.available,
              name: user.name,
              githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
              alternateEmails: [(user)-[:HAS_EMAIL]->(e:UserEmail) | e.email],
              linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(a) | a { .* }][0],
              wallets: [(user)-[:HAS_LINKED_WALLET]->(w) | w.address],
              location: [(user)-[:HAS_LOCATION]->(loc:UserLocation) | loc { .* }][0],
              skills: apoc.coll.toSet([
                (user)-[r:HAS_SKILL]->(t:LegacyTag) |
                  t { .*, canTeach: r.canTeach }
              ]),
              showcases: apoc.coll.toSet([
                (user)-[:HAS_SHOWCASE]->(s) | s { .* }
              ]),
              workHistory: apoc.coll.toSet([
                (user)-[:HAS_WORK_HISTORY]->(wh:UserWorkHistory) |
                  wh {
                    .*, 
                    repositories: apoc.coll.toSet([
                      (wh)-[:WORKED_ON_REPO]->(r:UserWorkHistoryRepo) | r { .* }
                    ])
                  }
              ]),
              jobCategoryInterests: [
                k IN keys(classFreq) |
                  {classification: k, frequency: classFreq[k]}
              ],
              tags: [
                k IN keys(tagFreq) |
                  {tag: k, frequency: tagFreq[k]}
              ],
              lastAppliedTimestamp: lastAppliedTimestamp
            }) AS parsedUsers
        }
        WITH list, parsedUsers
        RETURN list { .*, users: parsedUsers }
      `,
      { orgId, normalizedName },
    );

    const list = result.records[0]?.get("list");

    if (list) {
      return {
        success: true,
        message: "Talent list retrieved successfully",
        data: new TalentListWithUsersEntity(list).getProperties(),
      };
    } else {
      throw new NotFoundException({
        success: false,
        message: "Talent list not found",
      });
    }
  }

  async updateTalentList(
    orgId: string,
    normalizedName: string,
    body: UpdateTalentListNameInput,
  ): Promise<ResponseWithOptionalData<TalentList>> {
    const { name, description } = body;
    const newNormalizedName = slugify(name);

    const existing = await this.neogma.queryRunner.run(
      `
        MATCH (:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList {normalizedName: $normalizedName})
        RETURN list
      `,
      { orgId, normalizedName: newNormalizedName },
    );

    if (existing.records.length > 0 && normalizedName !== newNormalizedName) {
      return {
        success: false,
        message: "A talent list with that name already exists",
      };
    }

    const result = await this.neogma.queryRunner.run(
      `
        MATCH (:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList {normalizedName: $normalizedName})
        SET list.name = $name, list.normalizedName = $newNormalizedName, list.description = $description, list.updatedTimestamp = timestamp()
        RETURN list { .* } as list
      `,
      { orgId, normalizedName, name, newNormalizedName, description },
    );

    if (result.records.length === 0) {
      throw new NotFoundException({
        success: false,
        message: "Talent list not found",
      });
    }

    return {
      success: true,
      message: "Talent list updated successfully",
      data: new TalentListEntity(result.records[0].get("list")).getProperties(),
    };
  }

  async deleteTalentList(
    orgId: string,
    normalizedName: string,
  ): Promise<ResponseWithNoData> {
    await this.neogma.queryRunner.run(
      `
        MATCH (:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList {normalizedName: $normalizedName})
        DETACH DELETE list
      `,
      { orgId, normalizedName },
    );

    return {
      success: true,
      message: "Talent list deleted successfully",
    };
  }

  async updateOrgTalentList(
    orgId: string,
    normalizedName: string,
    body: UpdateTalentListInput,
  ): Promise<ResponseWithOptionalData<TalentListWithUsers>> {
    const { wallets } = body;
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_TALENT_LIST]->(list:TalentList {normalizedName: $normalizedName})
          OPTIONAL MATCH (list)-[r:HAS_TALENT]->(user:User)
          DELETE r

          WITH list
          UNWIND $wallets AS wallet
          MATCH (user:User {wallet: wallet, available: true})
          MERGE (list)-[:HAS_TALENT]->(user)
        `,
        { orgId, wallets, normalizedName },
      );
      const updated = await this.getTalentList(orgId, normalizedName);
      return {
        success: updated.success,
        message: updated.success
          ? "Talent list updated successfully"
          : updated.message,
        data: data(updated),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`UserService::updateOrgTalentList ${error.message}`);
      return {
        success: false,
        message: "Error updating talent list",
      };
    }
  }

  async findAll(): Promise<UserProfile[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)
          RETURN user {
            .*,
            githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
            location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0],
            linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account { .* }][0],
            wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address]
          } as user
        `,
      )
      .then(res =>
        res.records.map(record => {
          const user = record.get("user");
          return new UserProfileEntity({
            ...user,
            linkedAccounts: {
              ...user.linkedAccounts,
              wallets: user.wallets,
            },
          }).getProperties();
        }),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::findAll ${err.message}`);
        return [];
      });
  }

  async getUsersAvailableForWork(
    params: GetAvailableUsersInput,
    orgId: string | null,
  ): Promise<ResponseWithOptionalData<UserAvailableForWork[]>> {
    try {
      const paramsPassed = {
        city: params.city ? new RegExp(params.city, "gi") : null,
        country: params.country ? new RegExp(params.country, "gi") : null,
      };

      const { city, country } = paramsPassed;

      const locationFilter = (dev: UserAvailableForWork): boolean => {
        const cityMatch = city ? city.test(dev.location?.city) : true;
        const countryMatch = country
          ? country.test(dev.location?.country)
          : true;
        return cityMatch && countryMatch;
      };

      const users = await this.neogma.queryRunner
        .run(
          `
            MATCH (user:User)
            WHERE user.available = true
              AND (
                $orgId IS NULL
                OR NOT EXISTS { (user)-[:VERIFIED_FOR_ORG]->(:Organization {orgId:$orgId}) }
              )
            OPTIONAL MATCH (user)-[app:APPLIED_TO]->(job:StructuredJobpost)
            WITH DISTINCT user,
                coalesce(collect(DISTINCT job), []) AS jobs,
                max(app.createdTimestamp) AS lastAppliedTimestamp
            CALL {
              WITH jobs
              WITH CASE WHEN size(jobs) = 0 THEN [NULL] ELSE jobs END AS jlist
              UNWIND jlist AS job
              OPTIONAL MATCH (job)-[:HAS_CLASSIFICATION]->(c:JobpostClassification)
              WITH collect(c.name) AS names
              RETURN apoc.map.fromPairs(
                [n IN apoc.coll.toSet(names) |
                  [n, size([x IN names WHERE x = n])]]
              ) AS classificationFrequencies
            }
            CALL {
              WITH jobs
              WITH CASE WHEN size(jobs) = 0 THEN [NULL] ELSE jobs END AS jlist
              UNWIND jlist AS job
              OPTIONAL MATCH (job)-[:HAS_TAG]->(tag:LegacyTag)
              OPTIONAL MATCH (tag)-[:HAS_TAG_DESIGNATION]->(d:TagDesignation)
              OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(syn:LegacyTag)-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
              OPTIONAL MATCH (tag)-[:IS_PAIR_OF]->(pair:LegacyTag)-[:HAS_TAG_DESIGNATION]->(:PairedDesignation)
              WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:LegacyTag)--(:BlockedDesignation)
                AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
                AND (d:AllowedDesignation OR d:DefaultDesignation)
              WITH collect(
                CASE
                  WHEN syn IS NOT NULL THEN syn.name
                  WHEN pair IS NOT NULL THEN pair.name
                  ELSE tag.name
                END
              ) AS names
              RETURN apoc.map.fromPairs(
                [n IN apoc.coll.toSet(names) |
                  [n, size([x IN names WHERE x = n])]]
              ) AS tagFrequencies
            }
            WITH DISTINCT user, lastAppliedTimestamp, classificationFrequencies, tagFrequencies
            RETURN {
              wallet: user.wallet,
              cryptoNative: user.cryptoNative,
              cryptoAdjacent: user.cryptoAdjacent,
              attestations: { upvotes: null, downvotes: null },
              note: [
                (user)-[:HAS_RECRUITER_NOTE]->(n:RecruiterNote)
                <-[:HAS_TALENT_NOTE]-(:Organization {orgId:$orgId}) | n.note
              ][0],
              availableForWork: user.available,
              name: user.name,
              githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
              alternateEmails: [(user)-[:HAS_EMAIL]->(e:UserEmail) | e.email],
              linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(a) | a { .* }][0],
              wallets: [(user)-[:HAS_LINKED_WALLET]->(w) | w.address],
              location: [(user)-[:HAS_LOCATION]->(loc:UserLocation) | loc { .* }][0],
              skills: apoc.coll.toSet([
                (user)-[r:HAS_SKILL]->(t:LegacyTag) |
                  t { .*, canTeach: r.canTeach }
              ]),
              showcases: apoc.coll.toSet([
                (user)-[:HAS_SHOWCASE]->(s) | s { .* }
              ]),
              workHistory: apoc.coll.toSet([
                (user)-[:HAS_WORK_HISTORY]->(wh:UserWorkHistory) |
                  wh {
                    .*, 
                    repositories: apoc.coll.toSet([
                      (wh)-[:WORKED_ON_REPO]->(r:UserWorkHistoryRepo) | r { .* }
                    ])
                  }
              ]),
              jobCategoryInterests: [
                k IN keys(classificationFrequencies) |
                  { classification: k, frequency: classificationFrequencies[k] }
              ],
              tags: [
                k IN keys(tagFrequencies) |
                  { tag: k, frequency: tagFrequencies[k] }
              ],
              lastAppliedTimestamp: lastAppliedTimestamp
            } AS user
          `,
          { orgId: orgId ?? null },
        )
        .then(res => res.records.map(x => x.get("user")).filter(locationFilter))
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "user.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(
            `UserService::getDevsAvailableForWork ${err.message}`,
          );
          return [];
        });

      return {
        success: true,
        message: "Users available for work retrieved successfully",
        data: sort(
          users.map(user =>
            new UserAvailableForWorkEntity({
              ...user,
              linkedAccounts: {
                ...user.linkedAccounts,
                wallets: user.wallets,
              },
              ecosystemActivations: [],
            }).getProperties(),
          ),
        ).by([
          { desc: (user): boolean => user.cryptoNative },
          { desc: (user): boolean => user.cryptoAdjacent },
          { desc: (user): number => user.workHistory.length ?? 0 },
        ]),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::getDevsAvailableForWork ${err.message}`);
      return {
        success: false,
        message: "Error retrieving users available for work",
      };
    }
  }

  async getTopUsers(
    orgId: string,
  ): Promise<ResponseWithOptionalData<UserAvailableForWork[]>> {
    try {
      const base = await this.getUsersAvailableForWork(
        {
          city: null,
          country: null,
          page: null,
          limit: null,
        },
        orgId,
      );
      if (!base.success) {
        return base;
      }
      const users = data(base);
      const topUsers = sort(users).by([
        { desc: (user): boolean => user.cryptoNative },
        { desc: (user): boolean => user.cryptoAdjacent },
        { desc: (user): number => user.attestations.upvotes ?? 0 },
        { asc: (user): number => user.attestations.downvotes ?? 0 },
        { desc: (user): number => user.workHistory.length ?? 0 },
        { desc: (user): number => user.lastAppliedTimestamp ?? 0 },
      ]);
      return {
        success: true,
        message: "Top users retrieved successfully",
        data: topUsers.slice(0, 50),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::getDevsAvailableForWork ${err.message}`);
      return {
        success: false,
        message: "Error retrieving users available for work",
      };
    }
  }

  async addUserNote(
    wallet: string,
    note: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    return (
      this.neogma.queryRunner
        .run(
          `
          MATCH (u:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
          MERGE (u)-[:HAS_RECRUITER_NOTE]->(note:RecruiterNote)<-[:HAS_TALENT_NOTE]-(org)
          ON CREATE SET
            note.id = randomUUID(),
            note.note = $note,
            note.createdTimestamp = timestamp()
          ON MATCH SET
            note.note = $note,
            note.updatedTimestamp = timestamp()

        `,
          { wallet, note, orgId },
        )
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .then(_ => {
          return {
            success: true,
            message: "Set user note successfully",
          };
        })
        .catch(err => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "user.service",
            });
            Sentry.captureException(err);
          });
          this.logger.error(`UserService::addUserNote ${err.message}`);
          return {
            success: false,
            message: "Setting user note failed",
          };
        })
    );
  }

  async updateLinkedAccounts(
    dto: PrivyUpdateEventPayload | PrivyCreateEventPayload,
    embeddedWallet: string,
  ): Promise<void> {
    const user = dto.user;
    this.logger.log(`Syncing linked accounts for ${embeddedWallet}`);
    const account = (
      type: LinkedAccountWithMetadata["type"],
    ): LinkedAccountWithMetadata | undefined => {
      return user?.["linkedAccounts"]?.find(x => x.type === type);
    };
    const contact = {
      discord: account("discord_oauth")?.["username"] ?? null,
      telegram: account("telegram")?.["username"] ?? null,
      twitter: account("twitter_oauth")?.["username"] ?? null,
      email: account("email")?.["address"] ?? null,
      farcaster: account("farcaster")?.["username"] ?? null,
      github: account("github_oauth")?.["username"] ?? null,
      google: account("google_oauth")?.["email"] ?? null,
      apple: account("apple_oauth")?.["email"] ?? null,
    };
    let updateVerificationStatus =
      await this.profileService.updateUserVerificationStatus(
        embeddedWallet,
        "PENDING",
      );
    if (updateVerificationStatus.success) {
      this.logger.log(
        `User verification status updated to PENDING for ${embeddedWallet}`,
      );
    } else {
      this.logger.error(
        `User verification status not updated to PENDING for ${embeddedWallet}: ${updateVerificationStatus.message}`,
      );
    }

    try {
      await this.profileService
        .updateUserLinkedAccounts(embeddedWallet, contact)
        .then(result => {
          if (result.success) {
            this.logger.log(`Linked accounts updated for ${embeddedWallet}`);
          } else {
            this.logger.error(
              `Linked accounts not updated for ${embeddedWallet}: ${result.message}`,
            );
            return result;
          }
        });
      if (
        dto.type === "user.wallet_created" ||
        ["github_oauth", "email", "wallet", "google_oauth"].includes(
          dto.account.type,
        )
      ) {
        await this.profileService.getUserWorkHistory(embeddedWallet, true);
        await this.profileService.getUserVerifications(embeddedWallet, true);
      }
      updateVerificationStatus =
        await this.profileService.updateUserVerificationStatus(
          embeddedWallet,
          "VERIFIED",
          Date.now(),
        );
      if (updateVerificationStatus.success) {
        this.logger.log(
          `User verification status updated to VERIFIED for ${embeddedWallet}`,
        );
      } else {
        this.logger.error(
          `User verification status not updated to VERIFIED for ${embeddedWallet}: ${updateVerificationStatus.message}`,
        );
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        scope.setExtra("input", {
          dto,
          embeddedWallet,
        });
        Sentry.captureException(error);
      });
      this.logger.error(`UserService::updateLinkedAccounts ${error.message}`);
      updateVerificationStatus =
        await this.profileService.updateUserVerificationStatus(
          embeddedWallet,
          "REJECTED",
          Date.now(),
        );
      if (updateVerificationStatus.success) {
        this.logger.log(
          `User verification status updated to REJECTED for ${embeddedWallet}`,
        );
      } else {
        this.logger.error(
          `User verification status not updated to REJECTED for ${embeddedWallet}: ${updateVerificationStatus.message}`,
        );
      }
    }
  }

  async transferLinkedAccount(
    dto: PrivyTransferEventPayload,
    fromEmbeddedWallet: string,
    toEmbeddedWallet: string,
  ): Promise<void> {
    if (dto.account.type === "email" || dto.account.type === "google_oauth") {
      const fromVerifiedOrgs = data(
        await this.profileService.getUserVerifications(fromEmbeddedWallet),
      );

      const toVerifiedOrgs = data(
        await this.profileService.getUserVerifications(toEmbeddedWallet),
      );

      for (const org of fromVerifiedOrgs) {
        const existingRelation = toVerifiedOrgs.find(x => x.id === org.id);
        if (
          existingRelation &&
          ((existingRelation.isMember === true && org.isMember === false) ||
            existingRelation.isOwner)
        ) {
          await this.transferOrgSeat(
            org.id,
            fromEmbeddedWallet,
            toEmbeddedWallet,
          );
        }
      }
    }

    if (!dto.deletedUser) {
      const fromUser = await this.privyService.getUserById(dto.fromUser.id);
      if (fromUser) {
        await this.profileService.getUserWorkHistory(fromEmbeddedWallet, true);
        await this.updateLinkedAccounts(
          {
            type: "user.unlinked_account",
            account: dto.account,
            user: fromUser,
          },
          fromEmbeddedWallet,
        );
      }
    } else {
      const oldPermissions = await this.getUserPermissions(fromEmbeddedWallet);
      const currentPermissions =
        await this.getUserPermissions(toEmbeddedWallet);
      const permissions = uniq([
        ...oldPermissions
          .filter(x => !["ORG_MEMBER", "ORG_OWNER", "USER"].includes(x.name))
          .map(x => x.name),
        ...currentPermissions.map(x => x.name),
      ]);
      await this.syncUserPermissions(toEmbeddedWallet, permissions);
      await this.deletePrivyUser(fromEmbeddedWallet);
    }
    await this.updateLinkedAccounts(
      {
        type: "user.linked_account",
        account: dto.account,
        user: dto.toUser,
      },
      toEmbeddedWallet,
    );
  }
}
