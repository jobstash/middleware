import { UserRoleEntity } from "../shared/entities/user-role.entity";
import { Injectable } from "@nestjs/common";
import {
  data,
  DevUserProfile,
  DevUserProfileEntity,
  OrgUserProfile,
  OrgUserProfileEntity,
  ResponseWithNoData,
  ResponseWithOptionalData,
  User,
  UserEntity,
  UserFlowEntity,
  UserProfile,
  UserProfileEntity,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { UserFlowService } from "./user-flow.service";
import { UserRoleService } from "./user-role.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { SetRoleInput } from "../auth/dto/set-role.input";
import { SetFlowStateInput } from "../auth/dto/set-flow-state.input";
import { ModelService } from "src/model/model.service";
import { instanceToNode } from "src/shared/helpers";
import { randomUUID } from "crypto";
import { CheckWalletRoles, CheckWalletFlows } from "src/shared/constants";
import { GetAvailableDevsInput } from "./dto/get-available-devs.input";
import { ScorerService } from "src/scorer/scorer.service";
import { ConfigService } from "@nestjs/config";
import { ProfileService } from "src/auth/profile/profile.service";

@Injectable()
export class UserService {
  private readonly logger = new CustomLogger(UserService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private readonly userFlowService: UserFlowService,
    private readonly userRoleService: UserRoleService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
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
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User {wallet: $wallet})
          RETURN {
            wallet: user.wallet,
            availableForWork: user.available,
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
            email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }]
          } as user
        `,
        { wallet },
      )
      .then(res =>
        res.records.length
          ? new UserProfileEntity(res.records[0].get("user")).getProperties()
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
        this.logger.error(`UserService::findProfileByWallet ${err.message}`);
        return undefined;
      });
  }

  async findProfileByOrgId(orgId: string): Promise<OrgUserProfile | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)-[:HAS_ORGANIZATION_AUTHORIZATION]->(:Organization {orgId: $orgId})
          RETURN user {
            .*,
            email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }],
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
            orgId: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization:Organization) | organization.orgId][0],
            internalReference: [(user)-[:HAS_INTERNAL_REFERENCE]->(reference: OrgUserReferenceInfo) | reference { .* }][0],
            subscriberStatus: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION|HAS_SUBSCRIPTION*2]->(subscription:Subscription) | subscription { .* }][0]
          } as profile
        `,
        { orgId },
      )
      .then(res =>
        res.records.length
          ? new OrgUserProfileEntity(
              res.records[0].get("profile"),
            ).getProperties()
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
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(:StructuredJobpost {shortUUID: $shortUUID})
        RETURN org.orgId as orgId
      `,
      { shortUUID },
    );

    return result.records[0]?.get("orgId") as string;
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
    const result = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS((:User {wallet: $wallet})-[:HAS_ORGANIZATION_AUTHORIZATION]->(:Organization {orgId: $orgId})) AS hasOrgAuthorization
      `,
      { wallet, orgId },
    );

    return result.records[0]?.get("hasOrgAuthorization") as boolean;
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

      console.log(userEmails);

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
      const profile = data(await this.profileService.getDevUserProfile(wallet));
      const thisEmail = profile?.email?.find(x => x.email === email);
      if (
        profile?.username ||
        (profile.email.length > 1 && thisEmail.main === false)
      ) {
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

        await this.syncUserCryptoNativeStatus(wallet);

        return result;
      } else {
        return {
          success: false,
          message:
            "Email cannot be removed because it is the users primary email",
        };
      }
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

  async syncUserCryptoNativeStatus(wallet: string): Promise<void> {
    try {
      const role = await this.getWalletRole(wallet);
      if (role?.getName() === CheckWalletRoles.DEV) {
        const orgs = data(await this.profileService.getUserOrgs(wallet));
        const current = this.getCryptoNativeStatus(wallet);
        const status = orgs.length > 0 || current;
        this.logger.log(
          `/user/sync-user-crypto-native-status: ${wallet}, ${status}`,
        );

        await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})
            SET user.cryptoNative = $cryptoNative
          `,
          { wallet, cryptoNative: status },
        );
      } else {
        return;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "user.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `UserService::syncUserCryptoNativeStatus ${err.message}`,
      );
    }
  }

  private async create(dto: CreateUserDto): Promise<UserEntity> {
    return this.models.Users.createOne({
      id: randomUUID(),
      ...dto,
      available: false,
      createdTimestamp: new Date().getTime(),
      updatedTimestamp: new Date().getTime(),
    })
      .then(res => (res ? new UserEntity(instanceToNode(res)) : undefined))
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::create ${err.message}`);
        return undefined;
      });
  }

  private async setFlow(flow: string, storedUser: UserEntity): Promise<void> {
    // Flow
    // Find a flow node
    let storedFlowNode = await this.userFlowService.find(flow);

    // If its not there, create it
    if (!storedFlowNode) {
      this.logger.log(`No user flow node for ${flow} found. Creating one...`);
      storedFlowNode = await this.userFlowService.create({
        name: flow,
      });
    }

    // Check current flow association of user
    const currentFlow = await this.userFlowService.getFlowForWallet(
      storedUser.getWallet(),
    );
    // If user already has the desired flow, return
    if (currentFlow && currentFlow.getName() === flow) {
      return;
    }

    // If user has a different flow, unrelate it
    if (currentFlow && currentFlow.getName()) {
      await this.userFlowService.unrelateUserFromUserFlow(
        storedUser.getId(),
        currentFlow.getId(),
      );
    }

    // Relate user to desired flow
    await this.userFlowService.relateUserToUserFlow(
      storedUser.getId(),
      storedFlowNode.getId(),
    );

    // log the flow
    this.logger.log(`Flow ${flow} set for wallet ${storedUser.getWallet()}.`);
  }

  private async setRole(role: string, storedUser: UserEntity): Promise<void> {
    // Find a role node
    let storedRoleNode = await this.userRoleService.find(role);

    // If its not there, create it
    if (!storedRoleNode) {
      this.logger.log(`No user role node for ${role} found. Creating one...`);
      storedRoleNode = await this.userRoleService.create({
        name: role,
      });
    }

    // Check current role association of user
    const currentRole = await this.userRoleService.getRoleForWallet(
      storedUser.getWallet(),
    );
    // If user already has the desired role, return
    if (currentRole && currentRole.getName() === role) {
      return;
    }

    // If user has a different role, unrelate it
    if (currentRole && currentRole.getName()) {
      await this.userRoleService.unlinkUserFromRole(
        storedUser.getId(),
        currentRole.getId(),
      );
    }

    // Relate user to desired role
    await this.userRoleService.linkUserToRole(
      storedUser.getId(),
      storedRoleNode.getId(),
    );

    // log the role
    this.logger.log(`Role ${role} set for wallet ${storedUser.getWallet()}.`);
  }

  async createSIWEUser(wallet: string): Promise<User | undefined> {
    try {
      const storedUser = await this.findByWallet(wallet);

      if (storedUser) {
        const profileData = await this.findProfileByWallet(wallet);
        await this.profileService.runUserDataFetchingOps(
          wallet,
          profileData?.username,
        );
        return storedUser.getProperties();
      }

      const newUserDto = {
        wallet: wallet,
      };

      this.logger.log(
        `/user/createSIWEUser: Creating user with wallet ${wallet}`,
      );

      const newUser = await this.create(newUserDto);

      this.logger.log(JSON.stringify(newUser));

      const profileData = await this.findProfileByWallet(wallet);
      await this.profileService.runUserDataFetchingOps(
        wallet,
        profileData?.username,
        true,
      );

      await this.setRole(CheckWalletRoles.ANON, newUser);
      await this.setFlow(CheckWalletFlows.PICK_ROLE, newUser);

      return newUser.getProperties();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "user.service",
        });
        scope.setExtra("input", wallet);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::createSIWEUser ${err.message}`);
      return undefined;
    }
  }

  async setWalletFlow(input: SetFlowStateInput): Promise<ResponseWithNoData> {
    this.logger.log(`/user/setWalletFlow: ${JSON.stringify(input)}`);

    try {
      const { wallet, flow } = input;
      const user = await this.findByWallet(wallet);
      if (!user) {
        this.logger.log(`User with wallet ${wallet} not found!`);
        return {
          success: false,
          message: "Flow not set because wallet could not be found",
        };
      }

      await this.setFlow(flow, user);

      this.logger.log(`Flow ${flow} set for wallet ${wallet}.`);
      return { success: true, message: "Flow set successfully" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "user.service",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::setWalletFlow ${err.message}`);
      return {
        success: false,
        message: "Flow not set because of unexpected error",
      };
    }
  }

  async setWalletRole(input: SetRoleInput): Promise<ResponseWithNoData> {
    this.logger.log(`/user/setWalletRole: ${JSON.stringify(input)}`);
    try {
      const { wallet, role } = input;
      const user = await this.findByWallet(wallet);
      if (!user) {
        this.logger.log(`User with wallet ${wallet} not found!`);
        return {
          success: false,
          message: "Role not set because wallet could not be found",
        };
      }

      await this.setRole(role, user);

      this.logger.log(`Role ${role} set for wallet ${wallet}.`);
      return { success: true, message: "Role set successfully" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "user.service",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::setWalletRole ${err.message}`);
      return {
        success: false,
        message: "Flow not set because of unexpected error",
      };
    }
  }

  async getWalletRole(wallet: string): Promise<UserRoleEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet: $wallet})-[:HAS_ROLE]->(ur:UserRole)
          RETURN ur
        `,
        { wallet },
      )
      .then(res =>
        res.records.length
          ? new UserRoleEntity(res.records[0].get("ur"))
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
        this.logger.error(`UserService::getRoleForWallet ${err.message}`);
        return undefined;
      });
  }

  async getWalletFlow(wallet: string): Promise<UserFlowEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet: $wallet})-[:HAS_USER_FLOW_STAGE]->(uf:UserFlow)
          RETURN uf
        `,
        { wallet },
      )
      .then(res =>
        res.records.length
          ? new UserFlowEntity(res.records[0].get("uf"))
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
        this.logger.error(`UserService::getFlowForWallet ${err.message}`);
        return undefined;
      });
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
      const user = await this.findProfileByWallet(wallet);
      await this.profileService.runUserDataFetchingOps(wallet, user?.username);
      return this.getCryptoNativeStatus(wallet);
    } else {
      return initial;
    }
  }

  async authorizeUserForOrg(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    return (
      this.neogma.queryRunner
        .run(
          `
          MATCH (u:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
          MERGE (u)-[:HAS_ORGANIZATION_AUTHORIZATION]->(org)
          RETURN true as res
        `,
          { wallet, orgId },
        )
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .then(_ => {
          return {
            success: true,
            message: "Set user authorization for org successfully",
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
          this.logger.error(`UserService::getFlowForWallet ${err.message}`);
          return {
            success: false,
            message: "Setting user authorization for org failed",
          };
        })
    );
  }

  async findAll(): Promise<UserProfile[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)
          RETURN {
            wallet: user.wallet,
            availableForWork: user.available,
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
            email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }]
          } as user
        `,
      )
      .then(res =>
        res.records.length
          ? res.records.map(record =>
              new UserProfileEntity(record.get("user")).getProperties(),
            )
          : [],
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

  async getDevsAvailableForWork(
    params: GetAvailableDevsInput,
    orgId: string | null,
  ): Promise<DevUserProfile[]> {
    const paramsPassed = {
      city: params.city ? new RegExp(params.city, "gi") : null,
      country: params.country ? new RegExp(params.country, "gi") : null,
    };

    const locationFilter = (dev: DevUserProfile): boolean => {
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
          AND (user)-[:HAS_ROLE]->(:UserRole { name: "DEV" })

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
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            preferred: [(user)-[:HAS_PREFERRED_CONTACT_INFO]->(preferred: UserPreferredContactInfo) | preferred { .* }][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
            email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }],
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
        for (const record of res.records) {
          const user = record.get("user");
          const profile = new DevUserProfileEntity({
            ...user,
            ecosystemActivations:
              ecosystemActivations.find(x => x.wallet === user.wallet)
                ?.ecosystemActivations ?? [],
          }).getProperties();
          if (locationFilter(profile)) {
            results.push(profile);
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

  async getOrgsAwaitingApproval(): Promise<OrgUserProfile[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)
          WHERE (user)-[:HAS_ROLE]->(:UserRole { name: "ORG" })
          AND (user)-[:HAS_USER_FLOW_STAGE]->(:UserFlow { name: "ORG-APPROVAL-PENDING" })
          RETURN {
            wallet: user.wallet,
            linkedin: user.linkedin,
            calendly: user.calendly,
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
            email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }],
            orgId: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization:Organization) | organization.orgId][0],
            internalReference: [(user)-[:HAS_INTERNAL_REFERENCE]->(reference: OrgUserReferenceInfo) | reference { .* }][0],
            subscriberStatus: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION|HAS_SUBSCRIPTION*2]->(subscription:Subscription) | subscription { .* }][0]
          } as user
        `,
      )
      .then(res =>
        res.records.length
          ? res.records.map(record =>
              new OrgUserProfileEntity(record.get("user")).getProperties(),
            )
          : [],
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
          `UserService::getOrgsAwaitingApproval ${err.message}`,
        );
        return [];
      });
  }

  async getApprovedOrgs(): Promise<OrgUserProfile[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)
          WHERE (user)-[:HAS_ROLE]->(:UserRole { name: "ORG" })
          AND (user)-[:HAS_USER_FLOW_STAGE]->(:UserFlow { name: "ORG-COMPLETE" })
          RETURN {
            wallet: user.wallet,
            linkedin: user.linkedin,
            calendly: user.calendly,
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
            email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }],
            orgId: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization:Organization) | organization.orgId][0],
            internalReference: [(user)-[:HAS_INTERNAL_REFERENCE]->(reference: OrgUserReferenceInfo) | reference { .* }][0],
            subscriberStatus: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION|HAS_SUBSCRIPTION*2]->(subscription:Subscription) | subscription { .* }][0]
          } as user
        `,
      )
      .then(res =>
        res.records.length
          ? res.records.map(record =>
              new OrgUserProfileEntity(record.get("user")).getProperties(),
            )
          : [],
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "user.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`UserService::getApprovedOrgs ${err.message}`);
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
