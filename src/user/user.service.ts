import { Injectable } from "@nestjs/common";
import {
  UserAvailableForWork,
  UserAvailableForWorkEntity,
  ResponseWithNoData,
  ResponseWithOptionalData,
  User,
  UserEntity,
  UserProfile,
  UserProfileEntity,
  UserOrgAffiliationRequest,
  data,
  UserPermission,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { CreateUserDto } from "./dto/create-user.dto";
import { ModelService } from "src/model/model.service";
import { instanceToNode, nonZeroOrNull, randomToken } from "src/shared/helpers";
import { randomUUID } from "crypto";
import { GetAvailableUsersInput } from "./dto/get-available-users.input";
import { ScorerService } from "src/scorer/scorer.service";
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
} from "src/auth/privy/dto/webhook.payload";

@Injectable()
export class UserService {
  private readonly logger = new CustomLogger(UserService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
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
        this.logger.log(`User ${embeddedWallet} already exists. Updating...`);
        this.syncUserLinkedWallets(embeddedWallet, user);

        const permissions =
          await this.permissionService.getPermissionsForWallet(embeddedWallet);

        if (permissions.length === 0) {
          await this.permissionService.syncUserPermissions(embeddedWallet, [
            CheckWalletPermissions.USER,
          ]);
        }

        const contact = {
          discord: user?.discord?.username ?? null,
          telegram: user?.telegram?.username ?? null,
          twitter: user?.twitter?.username ?? null,
          email: user?.email?.address ?? null,
          farcaster: user?.farcaster?.username ?? null,
          github: user?.github?.username ?? null,
          google: user?.google?.email ?? null,
          apple: user?.apple?.email ?? null,
        };

        if (Object.values(contact).filter(Boolean).length > 0) {
          this.logger.log(`Adding contact info for ${embeddedWallet}`);
          this.profileService
            .updateUserLinkedAccounts(embeddedWallet, contact)
            .then(result => {
              if (result.success) {
                this.logger.log(`Contact info added to user`);
              } else {
                this.logger.error(
                  `Contact info not added to user: ${result.message}`,
                );
                return result;
              }
            });
        }

        await this.profileService.getUserWorkHistory(embeddedWallet, true);
        await this.profileService.getUserVerifications(embeddedWallet, true);
        return {
          success: true,
          message: "User already exists",
          data: storedUser.getProperties(),
        };
      }

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
        this.syncUserLinkedWallets(embeddedWallet, user);

        const contact = {
          discord: user.discord?.username ?? null,
          telegram: user.telegram?.username ?? null,
          twitter: user.twitter?.username ?? null,
          email: user.email?.address ?? null,
          farcaster: user.farcaster?.username ?? null,
          github: user.github?.username ?? null,
          google: user.google?.email ?? null,
          apple: user.apple?.email ?? null,
        };

        if (Object.values(contact).filter(Boolean).length > 0) {
          this.logger.log(`Adding contact info for ${embeddedWallet}`);
          this.profileService
            .updateUserLinkedAccounts(embeddedWallet, contact)
            .then(result => {
              if (result.success) {
                this.logger.log(`Contact info added to user`);
              } else {
                this.logger.error(
                  `Contact info not added to user: ${result.message}`,
                );
                return result;
              }
            });
        }

        await this.permissionService.syncUserPermissions(embeddedWallet, [
          CheckWalletPermissions.USER,
        ]);

        await this.profileService.getUserWorkHistory(embeddedWallet, true);
        await this.profileService.getUserVerifications(embeddedWallet, true);

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

  async deletePrivyUser(wallet: string): Promise<ResponseWithNoData> {
    try {
      const userId = await this.getPrivyId(wallet);
      this.logger.log(`/user/deletePrivyUser ${userId}`);
      this.privyService.deletePrivyUser(userId);
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        OPTIONAL MATCH (user)-[cr:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        OPTIONAL MATCH (user)-[lw:HAS_LINKED_WALLET]->(wallet:LinkedWallet)
        OPTIONAL MATCH (user)-[pcr:HAS_PREFERRED_CONTACT_INFO]->(preferred: UserPreferredContactInfo)
        OPTIONAL MATCH (user)-[rr:LEFT_REVIEW]->(:OrgReview)
        OPTIONAL MATCH (user)-[gr:HAS_GITHUB_USER]->(:GithubUser)
        OPTIONAL MATCH (user)-[scr:HAS_SHOWCASE]->(showcase:UserShowCase)
        OPTIONAL MATCH (user)-[ul:HAS_LOCATION]->(location:UserLocation)
        OPTIONAL MATCH (user)-[sr:HAS_SKILL]->(:Tag)
        OPTIONAL MATCH (user)-[er:HAS_EMAIL]->(email:UserEmail|UserUnverifiedEmail)
        OPTIONAL MATCH (user)-[ja:APPLIED_TO|BOOKMARKED|VIEWED_DETAILS]->()
        OPTIONAL MATCH (user)-[ds:DID_SEARCH]->(search:SearchHistory)
        OPTIONAL MATCH (user)-[cl:HAS_CACHE_LOCK]->(lock:UserCacheLock)
        OPTIONAL MATCH (user)-[oa:OCCUPIES]->()
        OPTIONAL MATCH (user)-[:HAS_ADJACENT_REPO]->(adjacentRepo: UserAdjacentRepo)
        OPTIONAL MATCH (user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount)
        OPTIONAL MATCH (user)-[:HAS_WORK_HISTORY]->(wh:UserWorkHistory)-[:WORKED_ON_REPO]->(whr:UserWorkHistoryRepo)
        DETACH DELETE user, lw, wallet, pcr, cr, preferred, contact, rr, gr, scr, showcase, ul, location, sr, er, email, ja, ds, cl, search, lock, oa, wh, whr, adjacentRepo, account
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
      if (subscription.status === "active") {
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

  async getUsersVerifiedOrgs(
    wallets: string[],
  ): Promise<{ wallet: string; orgs: string[] }[]> {
    return Promise.all(
      wallets.map(async wallet => {
        const orgs = data(
          await this.profileService.getUserVerifications(wallet),
        );
        return {
          wallet,
          orgs: orgs.map(x => x.id),
        };
      }),
    );
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

          OPTIONAL MATCH (user)-[app:APPLIED_TO]->(job:StructuredJobpost)
          WITH user, job, app.timestamp AS timestamp
          WITH user, collect(DISTINCT job) AS jobs, max(timestamp) AS lastAppliedTimestamp

          CALL {
            WITH user, jobs
            UNWIND jobs AS job
            OPTIONAL MATCH (job)-[:HAS_CLASSIFICATION]->(jc:JobpostClassification)
            WITH user, jc.name AS cname
            WITH user, collect(cname) AS rawClassifications
            RETURN apoc.map.fromPairs(
                    [c IN apoc.coll.toSet(rawClassifications) |
                      [c, size([x IN rawClassifications WHERE x = c])]
                    ]) AS classificationFrequencies
          }

          CALL {
            WITH user, jobs
            UNWIND jobs AS job
            OPTIONAL MATCH (job)-[:HAS_TAG]->(tag:Tag)
            OPTIONAL MATCH (tag)-[:HAS_TAG_DESIGNATION]->(designation:TagDesignation)
            OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
            OPTIONAL MATCH (tag)-[:IS_PAIR_OF]->(pair:Tag)-[:HAS_TAG_DESIGNATION]->(:PairedDesignation)
            WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
              AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
              AND (designation:AllowedDesignation OR designation:DefaultDesignation)
            WITH user,
                CASE 
                  WHEN synonym IS NOT NULL THEN synonym.name
                  WHEN pair IS NOT NULL THEN pair.name
                  ELSE tag.name
                END AS canonicalTag
            WITH user, collect(canonicalTag) AS rawTags
            RETURN apoc.map.fromPairs(
                    [t IN apoc.coll.toSet(rawTags) |
                      [t, size([x IN rawTags WHERE x = t])]
                    ]) AS tagFrequencies
          }

          WITH user, lastAppliedTimestamp, classificationFrequencies, tagFrequencies

          RETURN {
            wallet: user.wallet,
            cryptoNative: user.cryptoNative,
            cryptoAdjacent: user.cryptoAdjacent,
            attestations: {
              upvotes: null,
              downvotes: null
            },
            note: [(user)-[:HAS_RECRUITER_NOTE]->(note:RecruiterNote)<-[:HAS_TALENT_NOTE]-(:Organization { orgId: $orgId }) | note.note][0],
            availableForWork: user.available,
            name: user.name,
            avatar: user.avatar,
            alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
            linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account:LinkedAccount) | account { .* }][0],
            wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address],
            location: [(user)-[:HAS_LOCATION]->(location:UserLocation) | location { .* }][0],
            skills: apoc.coll.toSet([
              (user)-[r:HAS_SKILL]->(tag:Tag) |
              tag {
                .*,
                canTeach: [(user)-[m:HAS_SKILL]->(tag) | m.canTeach][0]
              }
            ]),
            showcases: apoc.coll.toSet([
              (user)-[:HAS_SHOWCASE]->(showcase) |
              showcase { .* }
            ]),
            workHistory: apoc.coll.toSet([
              (user)-[:HAS_WORK_HISTORY]->(workHistory:UserWorkHistory) |
              workHistory {
                .*, 
                repositories: apoc.coll.toSet([
                  (workHistory)-[:WORKED_ON_REPO]->(repo:UserWorkHistoryRepo) | repo { .* }
                ])
              }
            ]),
            jobCategoryInterests: [key IN keys(classificationFrequencies) | { classification: key, frequency: classificationFrequencies[key] }],
            tags: [key IN keys(tagFrequencies) | { tag: key, frequency: tagFrequencies[key] }],
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

      const usersVerifiedOrgs = await this.getUsersVerifiedOrgs(
        users.map(x => x.wallet),
      );

      const filtered = users
        .map(x => ({
          ...x,
          linkedAccounts: {
            ...x.linkedAccounts,
            wallets: x.wallets,
          },
        }))
        .filter(user => {
          const verifiedOrgs = usersVerifiedOrgs.find(
            x => x.wallet === user.wallet,
          );
          return !(verifiedOrgs?.orgs ?? []).includes(orgId);
        });

      const ecosystemActivations =
        await this.scorerService.getAllUserEcosystemActivations(orgId);

      return {
        success: true,
        message: "Users available for work retrieved successfully",
        data: filtered.map(user =>
          new UserAvailableForWorkEntity({
            ...user,
            ecosystemActivations: user.linkedAccounts.wallets.flatMap(
              z =>
                ecosystemActivations
                  .find(x => x.wallet === z)
                  ?.ecosystemActivations?.map(x => x.name) ?? [],
            ),
          }).getProperties(),
        ),
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

  async getMyOrgAffiliationRequests(
    wallet: string,
    list: "all" | "pending" | "approved" | "rejected",
  ): Promise<UserOrgAffiliationRequest[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User { wallet: $wallet })-[r:REQUESTED_TO_BECOME_AFFILIATED_TO]->(org:Organization)
          WHERE CASE WHEN $list = "all" THEN true
          WHEN $list = "pending" THEN r.status = "pending"
          WHEN $list = "approved" THEN r.status = "approved"
          WHEN $list = "rejected" THEN r.status = "rejected"
          ELSE true
          END
          RETURN {
            wallet: user.wallet,
            orgId: org.orgId,
            status: r.status,
            timestamp: r.timestamp
          } as request
        `,
        { wallet, list },
      )
      .then(async res =>
        res.records.map(x => {
          const request = x.get("request");
          return {
            wallet: request.wallet,
            orgId: request.orgId,
            status: request.status,
            timestamp: nonZeroOrNull(request.timestamp),
          };
        }),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          scope.setExtra("input", { wallet, list });
          Sentry.captureException(err);
        });
        this.logger.error(
          `UserService::getMyOrgAffiliationRequests ${err.message}`,
        );
        return [];
      });
  }

  async getUserOrgAffiliationRequests(
    list: "all" | "pending" | "approved" | "rejected",
  ): Promise<UserOrgAffiliationRequest[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)-[r:REQUESTED_TO_BECOME_AFFILIATED_TO]->(org:Organization)
          WHERE CASE WHEN $list = "all" THEN true
          WHEN $list = "pending" THEN r.status = "pending"
          WHEN $list = "approved" THEN r.status = "approved"
          WHEN $list = "rejected" THEN r.status = "rejected"
          ELSE true
          END
          RETURN {
            wallet: user.wallet,
            orgId: org.orgId,
            status: r.status,
            timestamp: r.timestamp
          } as request
        `,
        { list },
      )
      .then(async res =>
        res.records.map(x => {
          const request = x.get("request");
          return {
            wallet: request.wallet,
            orgId: request.orgId,
            status: request.status,
            timestamp: nonZeroOrNull(request.timestamp),
          };
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
        this.logger.error(
          `UserService::getUserOrgAffiliationRequests ${err.message}`,
        );
        return [];
      });
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
    dto: PrivyUpdateEventPayload,
    embeddedWallet: string,
  ): Promise<void> {
    const user = dto.user;
    this.logger.log(`Syncing linked accounts for ${embeddedWallet}`);
    const account = (
      type: LinkedAccountWithMetadata["type"],
    ): LinkedAccountWithMetadata | undefined => {
      return user?.["linked_accounts"]?.find(x => x.type === type);
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
      ["github_oauth", "email", "wallet", "google_oauth"].includes(
        dto.account.type,
      )
    ) {
      await this.profileService.getUserWorkHistory(embeddedWallet, true);
      await this.profileService.getUserVerifications(embeddedWallet, true);
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
      const fromUser = await this.privyService.getUser(dto.fromUser.id);
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
