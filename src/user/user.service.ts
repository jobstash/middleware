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
import { CreateUserDto } from "./dto/create-user.dto";
import { randomToken, slugify } from "src/shared/helpers";
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
import { UserRepository } from "src/postgres/user.repository";

@Injectable()
export class UserService {
  private readonly logger = new CustomLogger(UserService.name);
  constructor(
    private readonly users: UserRepository,
    readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly privyService: PrivyService,
    private readonly permissionService: PermissionService,
  ) {}

  async findByWallet(wallet: string): Promise<UserEntity | undefined> {
    return this.users
      .findUserByWallet(wallet)
      .then(user =>
        user ? new UserEntity(user as unknown as User) : undefined,
      )
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
    const wallet = await this.users.findOwnerWallet(orgId);
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
    return this.users
      .findUserByGithubNodeId(nodeId)
      .then(user =>
        user ? new UserEntity(user as unknown as User) : undefined,
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
    return this.users.findOrganizationIdForMember(wallet);
  }

  async findOrgIdByJobShortUUID(shortUUID: string): Promise<string | null> {
    try {
      return await this.users.findOrganizationIdForJob(shortUUID);
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
    return this.users.getUserEmails(wallet);
  }

  async userHasEmail(email: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);

    return this.users.emailExists(normalizedEmail);
  }

  async isOrgMember(wallet: string, orgId: string): Promise<boolean> {
    try {
      return await this.users.hasOrganizationSeat(wallet, orgId);
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
      return await this.users.hasOrganizationSeat(wallet, orgId, true);
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
    return this.users.organizationHasOwner(orgId);
  }

  async userAuthorizedForJobFolder(
    wallet: string,
    id: string,
  ): Promise<boolean> {
    return this.users.ownsJobFolder(wallet, id);
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
      const result = await this.users
        .addUserEmail(wallet, email, normalizedEmail)
        .then(user =>
          user
            ? {
                success: true,
                message: "User email added successfully",
                data: new UserEntity(user as unknown as User),
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
    const normalizedEmail = this.normalizeEmail(email);
    const userEmails = await this.getUserEmails(wallet);
    const targetEmail = userEmails.find(
      userEmail => this.normalizeEmail(userEmail.email) === normalizedEmail,
    );
    if (!targetEmail) {
      return {
        success: false,
        message: "Email is not associated with this user",
      };
    } else {
      if (targetEmail.main) {
        return {
          success: false,
          message: "Email is already associated with this user as main",
        };
      }

      return this.users
        .setMainEmail(wallet, normalizedEmail)
        .then(user =>
          user
            ? {
                success: true,
                message: "User main email updated successfully",
                data: new UserEntity(user as unknown as User),
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
    const normalizedEmail = this.normalizeEmail(email);
    const belongsToUser = (await this.getUserEmails(wallet)).some(
      userEmail => this.normalizeEmail(userEmail.email) === normalizedEmail,
    );
    if (!belongsToUser) {
      return {
        success: false,
        message: "Email is not associated with this user",
      };
    } else {
      const result = await this.users
        .removeUserEmail(wallet, normalizedEmail)
        .then(user =>
          user
            ? {
                success: true,
                message: "User email removed successfully",
                data: new UserEntity(user as unknown as User),
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
    const result = await this.users
      .findWalletByEmail(normalizedEmail)
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
    const result = await this.users
      .findWalletByLinkedWallet(linkedWallet)
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
    return this.users.findPrivyId(wallet).catch(err => {
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
    return this.users.findWalletByPrivyId(privyId).catch(err => {
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

    const result = await this.users
      .verifyEmail(normalizedEmail, email)
      .then(user =>
        user ? new UserEntity(user as unknown as User) : undefined,
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
      await this.users.syncLinkedWallets(wallet, wallets);
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
    return this.users
      .createUser({
        privyId: dto.privyId ?? null,
        name: dto.name ?? null,
        available: false,
        wallet: dto.wallet,
        createdTimestamp: new Date().getTime(),
        updatedTimestamp: new Date().getTime(),
      })
      .then(user =>
        user ? new UserEntity(user as unknown as User) : undefined,
      )
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
    return this.users.getActiveSubscriptionOrganizationIds(wallet);
  }

  async deletePrivyUser(wallet: string): Promise<ResponseWithNoData> {
    try {
      const userId = await this.getPrivyId(wallet);
      this.logger.log(`/user/deletePrivyUser ${userId}`);
      this.privyService.deletePrivyUser(userId);
      await this.users.deleteUser(wallet);
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
      return await this.users.countOrganizationUsers(orgId);
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
              await this.users.addOrganizationSeat(
                orgId,
                wallet,
                isOwner ? "owner" : "member",
                seatId,
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
    await this.users.removeOrganizationSeat(orgId, wallet);
  }

  async transferOrgSeat(
    orgId: string,
    fromWallet: string,
    toWallet: string,
  ): Promise<void> {
    try {
      const seat = await this.users.transferOrganizationSeat(
        orgId,
        fromWallet,
        toWallet,
      );
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
    const initial = await this.users.getCryptoNative(wallet).catch(err => {
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
      const lists = await this.users.getTalentLists(orgId);
      return {
        success: true,
        message: "Talent lists retrieved successfully",
        data: lists.map(list =>
          new TalentListEntity(list as unknown as TalentList).getProperties(),
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
      const created = await this.users.createTalentList(
        orgId,
        name,
        body.description,
      );
      if (created.status === "conflict") {
        throw new BadRequestException({
          success: false,
          message: "A talent list with that name already exists",
        });
      }

      if (created.status !== "created" || !created.properties) {
        throw new NotFoundException("Organization not found");
      }

      return {
        success: true,
        message: "Talent list created successfully",
        data: new TalentListEntity(
          created.properties as unknown as TalentList,
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
    const list = await this.users.getTalentList(orgId, normalizedName);

    if (list) {
      return {
        success: true,
        message: "Talent list retrieved successfully",
        data: new TalentListWithUsersEntity(
          list as unknown as TalentListWithUsers,
        ).getProperties(),
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

    const updated = await this.users.updateTalentList(
      orgId,
      normalizedName,
      name,
      description,
    );
    if (updated.status === "conflict") {
      return {
        success: false,
        message: "A talent list with that name already exists",
      };
    }

    if (updated.status === "not_found" || !updated.properties) {
      throw new NotFoundException({
        success: false,
        message: "Talent list not found",
      });
    }

    return {
      success: true,
      message: "Talent list updated successfully",
      data: new TalentListEntity(
        updated.properties as unknown as TalentList,
      ).getProperties(),
    };
  }

  async deleteTalentList(
    orgId: string,
    normalizedName: string,
  ): Promise<ResponseWithNoData> {
    await this.users.deleteTalentList(orgId, normalizedName);

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
      await this.users.replaceTalentListUsers(orgId, normalizedName, wallets);
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
    return this.users
      .getAllProfiles()
      .then(profiles =>
        profiles.map(profile =>
          new UserProfileEntity(
            profile as unknown as UserProfile,
          ).getProperties(),
        ),
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
        city: params.city ? new RegExp(params.city, "i") : null,
        country: params.country ? new RegExp(params.country, "i") : null,
      };

      const { city, country } = paramsPassed;

      const locationFilter = (dev: UserAvailableForWork): boolean => {
        const cityMatch = city ? city.test(dev.location?.city) : true;
        const countryMatch = country
          ? country.test(dev.location?.country)
          : true;
        return cityMatch && countryMatch;
      };

      const users = await this.users
        .getAvailableUsers(orgId)
        .then(profiles =>
          profiles
            .map(profile =>
              new UserAvailableForWorkEntity({
                ...(profile as unknown as UserAvailableForWork),
                ecosystemActivations: [],
              }).getProperties(),
            )
            .filter(locationFilter),
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
            `UserService::getDevsAvailableForWork ${err.message}`,
          );
          return [];
        });

      return {
        success: true,
        message: "Users available for work retrieved successfully",
        data: sort(users).by([
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
    return this.users
      .setRecruiterNote(wallet, note, orgId)
      .then(updated => {
        if (updated) {
          return {
            success: true,
            message: "Set user note successfully",
          };
        }
        return { success: false, message: "Setting user note failed" };
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
      });
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
