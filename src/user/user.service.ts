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
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { CreateUserDto } from "./dto/create-user.dto";
import { ModelService } from "src/model/model.service";
import { instanceToNode, nonZeroOrNull } from "src/shared/helpers";
import { randomUUID } from "crypto";
import { GetAvailableUsersInput } from "./dto/get-available-users.input";
import { ScorerService } from "src/scorer/scorer.service";
import { ConfigService } from "@nestjs/config";
import { ProfileService } from "src/auth/profile/profile.service";
import { User as PrivyUser, WalletWithMetadata } from "@privy-io/server-auth";
import { PrivyService } from "src/auth/privy/privy.service";
import { PermissionService } from "./permission.service";
import { CheckWalletPermissions } from "src/shared/constants";

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

  async findProfileByOrgId(orgId: string): Promise<UserProfile | undefined> {
    const result = await this.neogma.queryRunner.run(
      `
          MATCH (user:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(:Organization {orgId: $orgId})
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

  async findOrgIdByWallet(wallet: string): Promise<string | null> {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (:User {wallet: $wallet})-[:HAS_ORGANIZATION_AUTHORIZATION]->(org:Organization)
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

  async userAuthorizedForOrg(wallet: string, orgId: string): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        RETURN EXISTS((:User {wallet: $wallet})-[:HAS_ORGANIZATION_AUTHORIZATION]->(:Organization {orgId: $orgId})) AS hasOrgAuthorization
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
      this.logger.error(`UserService::userAuthorizedForOrg ${err.message}`);
      return false;
    }
  }

  async orgHasUser(orgId: string): Promise<boolean> {
    const result = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS((:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(:Organization {orgId: $orgId})) AS hasOrgAuthorization
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

  async getPrivyId(wallet: string): Promise<string | undefined> {
    const result = await this.neogma.queryRunner
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
    return result;
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

  async syncUserLinkedWallets(wallet: string, privyId: string): Promise<void> {
    try {
      const wallets = await this.privyService.getUserLinkedWallets(privyId);
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

  async createPrivyUser(
    user: PrivyUser,
    embeddedWallet: string,
  ): Promise<ResponseWithOptionalData<User>> {
    try {
      const storedUser = await this.findByWallet(embeddedWallet);

      if (storedUser) {
        this.logger.log(`User ${embeddedWallet} already exists. Updating...`);
        await this.syncUserLinkedWallets(embeddedWallet, user.id);

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
          const result = await this.profileService.updateUserLinkedAccounts(
            embeddedWallet,
            contact,
          );

          if (result.success) {
            this.logger.log(`Contact info added to user`);
          } else {
            this.logger.error(
              `Contact info not added to user: ${result.message}`,
            );
            return result;
          }
        }

        await this.profileService.getUserWorkHistory(embeddedWallet);
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
        await this.syncUserLinkedWallets(embeddedWallet, user.id);

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
          const result = await this.profileService.updateUserLinkedAccounts(
            embeddedWallet,
            contact,
          );

          if (result.success) {
            this.logger.log(`Contact info added to user`);
          } else {
            this.logger.error(
              `Contact info not added to user: ${result.message}`,
            );
            return result;
          }
        }

        await this.profileService.getUserWorkHistory(embeddedWallet);

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
        OPTIONAL MATCH (user)-[oa:HAS_ORGANIZATION_AUTHORIZATION]->()
        OPTIONAL MATCH (user)-[:HAS_WORK_HISTORY]->(wh:UserWorkHistory)-[:WORKED_ON_REPO]->(whr:UserWorkHistoryRepo)
        DETACH DELETE user, lw, wallet, pcr, cr, preferred, contact, rr, gr, scr, showcase, ul, location, sr, er, email, ja, ds, cl, search, lock, oa, wh, whr
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

  async syncUserPermissions(
    wallet: string,
    permissions: string[],
  ): Promise<void> {
    return this.permissionService.syncUserPermissions(wallet, permissions);
  }

  async requestOrgAffiliation(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    const user = await this.findByWallet(wallet);
    if (user) {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[r:REQUESTED_TO_BECOME_AFFILIATED_TO]->(org)
        SET r.status = "pending"
        SET r.timestamp = timestamp()
        `,
        { wallet, orgId },
      );
      return {
        success: true,
        message: "Organization affiliation request sent successfully",
      };
    } else {
      this.logger.error(
        `UserService::requestOrgAffiliation ${wallet}, ${orgId}`,
      );
      return {
        success: false,
        message: "User not found",
      };
    }
  }

  async authorizeUserForOrg(
    wallet: string,
    orgId: string,
    verdict: "approve" | "reject",
  ): Promise<ResponseWithNoData> {
    try {
      const userPermissions =
        await this.permissionService.getPermissionsForWallet(wallet);

      await this.neogma.queryRunner.run(
        `
          MATCH (u:User {wallet: $wallet})-[r:REQUESTED_TO_BECOME_AFFILIATED_TO]->(org:Organization {orgId: $orgId})
          SET r.status = $verdict
          SET r.timestamp = timestamp()
        `,
        {
          wallet,
          orgId,
          verdict: verdict === "approve" ? "approved" : "rejected",
        },
      );

      await this.neogma.queryRunner.run(
        `
        MATCH (u:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (u)-[:HAS_ORGANIZATION_AUTHORIZATION]->(org)
      `,
        { wallet, orgId },
      );

      if (verdict === "approve") {
        await this.permissionService.syncUserPermissions(wallet, [
          ...userPermissions.map(x => x.name),
          CheckWalletPermissions.ORG_AFFILIATE,
        ]);
      }

      return {
        success: true,
        message: "Organization affiliation request updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::authorizeUserForOrg ${err.message}`);
      return {
        success: false,
        message: "Setting user authorization for org failed",
      };
    }
  }

  async findAll(): Promise<UserProfile[]> {
    const users = await this.privyService.getUsers();
    const userMap: Map<string, PrivyUser> = new Map(
      users.map(x => [
        (
          x.linkedAccounts.find(
            x => x.type === "wallet" && x.walletClientType === "privy",
          ) as WalletWithMetadata
        )?.address,
        x,
      ]),
    );
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)
          RETURN {
            wallet: user.wallet,
            availableForWork: user.available,
            name: user.name,
            githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
            location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0]
          } as user
        `,
      )
      .then(async res => {
        return res.records.length
          ? await Promise.all(
              res.records.map(async record => {
                const raw = record.get("user");
                const embeddedWallet = raw.wallet;
                const user = userMap.get(embeddedWallet);
                return new UserProfileEntity({
                  ...raw,
                  linkedAccounts: {
                    discord: user?.discord?.username ?? null,
                    telegram: user?.telegram?.username ?? null,
                    twitter: user?.twitter?.username ?? null,
                    email: user?.email?.address ?? null,
                    farcaster: user?.farcaster?.username ?? null,
                    github: user?.github?.username ?? null,
                    google: user?.google?.email ?? null,
                    apple: user?.apple?.email ?? null,
                    wallets: user?.linkedAccounts
                      ?.filter(
                        x =>
                          x.type === "wallet" && x.walletClientType !== "privy",
                      )
                      ?.map(x => (x as WalletWithMetadata).address),
                  },
                }).getProperties();
              }),
            )
          : <UserProfile[]>[];
      })
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
    const users = (await this.privyService.getUsers())
      .map(user => ({
        discord: user?.discord?.username ?? null,
        telegram: user?.telegram?.username ?? null,
        twitter: user?.twitter?.username ?? null,
        email: user?.email?.address ?? null,
        farcaster: user?.farcaster?.username ?? null,
        github: user?.github?.username ?? null,
        google: user?.google?.email ?? null,
        apple: user?.apple?.email ?? null,
        wallets: user.linkedAccounts
          .filter(x => x.type === "wallet" && x.walletClientType !== "privy")
          .map(x => (x as WalletWithMetadata).address),
        embeddedWallet: (
          user.linkedAccounts.find(
            x => x.type === "wallet" && x.walletClientType === "privy",
          ) as WalletWithMetadata
        )?.address,
      }))
      .filter(x => wallets.includes(x.embeddedWallet));

    const workHistories = await this.scorerService.getUserWorkHistories(
      users
        .filter(x => x.github)
        .map(x => ({
          github: x.github,
          wallets: [],
        })),
    );

    const emails = users.flatMap(
      x => [x.email, x.google, x.apple].filter(Boolean) as string[],
    );

    const orgsByGithub = (
      await this.neogma.queryRunner.run(
        `
        MATCH (organization: Organization WHERE organization.name IN $names)
        RETURN {
          name: organization.name,
          orgId: organization.orgId
        } as orgByGithub
      `,
        {
          names: workHistories.flatMap(x => x.workHistory.map(y => y.name)),
        },
      )
    ).records.map(x => x.get("orgByGithub") as { name: string; orgId: string });

    const orgsByEmail = (
      await this.neogma.queryRunner.run(
        `
            MATCH (organization: Organization)-[:HAS_WEBSITE]->(website: Website)
            UNWIND $emails as email
            WITH email, website, organization
            WHERE email IS NOT NULL AND website IS NOT NULL AND apoc.data.url(website.url).host CONTAINS apoc.data.email(email).domain
            RETURN organization {
              id: organization.orgId,
              name: organization.name,
              account: email
            } as orgByEmail
          `,
        { emails },
      )
    ).records.map(
      x =>
        x.get("orgByEmail") as {
          id: string;
          name: string;
          account: string;
        },
    );

    const result = [
      ...workHistories
        .map(x => {
          const user = users.find(x => x.github === x.github);
          const wallet = user?.embeddedWallet;
          const workHistoryNames = x.workHistory.map(y => y.name);
          const orgs = [
            ...orgsByGithub
              .filter(x => workHistoryNames.includes(x.name))
              .map(x => x.orgId),
          ];
          return {
            wallet,
            orgs,
          };
        })
        .filter(x => wallets.includes(x.wallet)),
      ...users
        .map(x => {
          const wallet = x.embeddedWallet;
          const orgs = [
            ...orgsByEmail
              .filter(y =>
                [x.email, x.google, x.apple]
                  .filter(Boolean)
                  .includes(y.account),
              )
              .map(x => x.id),
          ];
          return {
            wallet,
            orgs,
          };
        })
        .filter(x => wallets.includes(x.wallet)),
    ];

    return result;
  }

  async getUsersAvailableForWork(
    params: GetAvailableUsersInput,
    orgId: string | null,
  ): Promise<UserAvailableForWork[]> {
    const paramsPassed = {
      city: params.city ? new RegExp(params.city, "gi") : null,
      country: params.country ? new RegExp(params.country, "gi") : null,
    };

    const locationFilter = (dev: UserAvailableForWork): boolean => {
      const cityMatch = paramsPassed.city
        ? paramsPassed.city.test(dev.location?.city)
        : true;
      const countryMatch = paramsPassed.country
        ? paramsPassed.country.test(dev.location?.country)
        : true;
      return cityMatch && countryMatch;
    };

    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User), (organization: Organization {orgId: $orgId})
          WHERE user.available = true

          RETURN {
            wallet: user.wallet,
            cryptoNative: user.cryptoNative,
            cryptoAdjacent: user.cryptoAdjacent,
            attestations: {
              upvotes: null,
              downvotes: null
            },
            note: [(user)-[:HAS_RECRUITER_NOTE]->(note: RecruiterNote)<-[:HAS_TALENT_NOTE]-(organization) | note.note][0],
            availableForWork: user.available,
            name: user.name,
            avatar: user.avatar,
            alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
            linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account {
              .*,
              wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address]
            }][0],
            location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0],
            skills: apoc.coll.toSet([
                (user)-[r:HAS_SKILL]->(tag) |
                tag {
                  .*,
                  canTeach: [(user)-[m:HAS_SKILL]->(tag) | m.canTeach][0]
                }
            ]),
            showcases: apoc.coll.toSet([
              (user)-[:HAS_SHOWCASE]->(showcase) |
              showcase {
                .*
              }
            ]),
            workHistory: apoc.coll.toSet([
              (user)-[:HAS_WORK_HISTORY]->(workHistory: UserWorkHistory) |
              workHistory {
                .*,
                repositories: apoc.coll.toSet([
                  (workHistory)-[:WORKED_ON_REPO]->(repo: UserWorkHistoryRepo) |
                  repo {
                    .*
                  }
                ])
              }
            ])
          } as user
        `,
        { orgId: orgId ?? null },
      )
      .then(async res => {
        const results = [];
        const ecosystemActivations =
          await this.scorerService.getWalletEcosystemActivations(
            res.records
              .map(x => {
                const user = x.get("user");
                return (locationFilter(user) ? user.wallet : null) ?? null;
              })
              .filter(Boolean),
            orgId,
          );
        const usersVerifiedOrgs = await this.getUsersVerifiedOrgs(
          res.records
            .map(x => {
              const user = x.get("user");
              return (locationFilter(user) ? user.wallet : null) ?? null;
            })
            .filter(Boolean),
        );
        for (const record of res.records) {
          const user = record.get("user");
          const profile = new UserAvailableForWorkEntity({
            ...user,
            ecosystemActivations:
              ecosystemActivations.find(x => x.wallet === user.wallet)
                ?.ecosystemActivations ?? [],
          }).getProperties();
          if (locationFilter(profile)) {
            const verifiedOrgs = usersVerifiedOrgs.find(
              x => x.wallet === profile.wallet,
            );
            if (!(verifiedOrgs?.orgs ?? []).includes(orgId)) {
              results.push(profile);
            }
          }
        }
        return results;
      })
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
}
