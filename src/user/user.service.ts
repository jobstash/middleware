import { UserRoleEntity } from "../shared/entities/user-role.entity";
import { Injectable } from "@nestjs/common";
import {
  GithubUserEntity,
  GithubUserProperties,
  Response,
  ResponseWithNoData,
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
import { UpdateUserDto } from "./dto/update-user.dto";
import { SetRoleInput } from "../auth/dto/set-role.input";
import { SetFlowStateInput } from "../auth/dto/set-flow-state.input";
import { USER_FLOWS, USER_ROLES } from "src/shared/constants";

@Injectable()
export class UserService {
  private readonly logger = new CustomLogger(UserService.name);
  constructor(
    @InjectConnection()
    private readonly neogma: Neogma,
    private readonly userFlowService: UserFlowService,
    private readonly userRoleService: UserRoleService,
  ) {}

  async validateUser(id: string): Promise<User | undefined> {
    const user = await this.findById(id);

    if (user) {
      return user.getProperties();
    }

    return undefined;
  }

  async findById(id: string): Promise<UserEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
        MATCH (u:User {id: $id})
        RETURN u
        `,
        { id },
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
        this.logger.error(`UserService::find ${err.message}`);
        return undefined;
      });
  }

  async findByWallet(wallet: string): Promise<UserEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
        MATCH (u:User {wallet: $wallet})
        RETURN u
        `,
        { wallet },
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
        this.logger.error(`UserService::findByWallet ${err.message}`);
        return undefined;
      });
  }

  async addUserEmail(
    wallet: string,
    email: string,
  ): Promise<UserEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet: $wallet})
          MERGE (u)-[:HAS_EMAIL]->(email:UserUnverifiedEmail {email: $email})
          RETURN u
        `,
        { wallet, email },
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
        this.logger.error(`UserService::addUserEmail ${err.message}`);
        return undefined;
      });
  }

  async verifyUserEmail(email: string): Promise<UserEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (u:User)-[r:HAS_EMAIL]->(email:UserUnverifiedEmail {email: $email})
          DELETE r, email

          WITH u
          MERGE (u)-[:HAS_EMAIL]->(:UserEmail {email: $email})
          RETURN u
        `,
        { email },
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
        this.logger.error(`UserService::addUserEmail ${err.message}`);
        return undefined;
      });
  }

  async findByGithubNodeId(nodeId: string): Promise<UserEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
        MATCH (u:User)-[:HAS_GITHUB_USER]->(:GithubUser {nodeId: $nodeId})
        RETURN u
        `,
        { nodeId },
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
        this.logger.error(`UserService::findByNodeId ${err.message}`);
        return undefined;
      });
  }

  async findByGithubLogin(githubLogin: string): Promise<User | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User)-[:HAS_GITHUB_USER]->(:GithubUser {login: $githubLogin})
      RETURN u
      `,
      { githubLogin },
    );
    return res.records.length
      ? new UserEntity(res.records[0].get("u")).getProperties()
      : undefined;
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    return this.neogma.queryRunner
      .run(
        `
                CREATE (u:User { id: randomUUID() })
                SET u += $properties
                RETURN u
            `,
        {
          properties: {
            ...dto,
          },
        },
      )
      .then(res => new UserEntity(res.records[0].get("u")));
  }

  async update(id: string, properties: UpdateUserDto): Promise<User> {
    return this.neogma.queryRunner
      .run(
        `
        MATCH (u:User { id: $id })
        SET u += $properties
        RETURN u
        `,
        { id, properties },
      )
      .then(res => new UserEntity(res.records[0].get("u")).getProperties());
  }

  async setFlow(flow: string, storedUser: UserEntity): Promise<void> {
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

  async setRole(role: string, storedUser: UserEntity): Promise<void> {
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
      await this.userRoleService.unrelateUserFromUserRole(
        storedUser.getId(),
        currentRole.getId(),
      );
    }

    // Relate user to desired role
    await this.userRoleService.relateUserToUserRole(
      storedUser.getId(),
      storedRoleNode.getId(),
    );

    // log the role
    this.logger.log(`Role ${role} set for wallet ${storedUser.getWallet()}.`);
  }

  async createSIWEUser(wallet: string): Promise<User | undefined> {
    try {
      this.logger.log(
        `/user/createSIWEUser: Creating user with wallet ${wallet}`,
      );
      const storedUser = await this.findByWallet(wallet);
      this.logger.log(JSON.stringify(storedUser));

      if (storedUser) {
        return storedUser.getProperties();
      }

      const newUserDto = {
        wallet: wallet,
      };

      const newUser = await this.create(newUserDto);

      await this.setRole(USER_ROLES.ANON, newUser);
      await this.setFlow(USER_FLOWS.PICK_ROLE, newUser);

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

  async setFlowState(
    input: SetFlowStateInput,
  ): Promise<Response<string> | ResponseWithNoData> {
    this.logger.log(`/user/setFlowState: ${JSON.stringify(input)}`);

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
      return { success: true, message: "Flow set" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "user.service",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`UserService::setFlowState ${err.message}`);
      return undefined;
    }
  }

  async setRoleState(
    input: SetRoleInput,
  ): Promise<Response<string> | ResponseWithNoData> {
    const { wallet, role } = input;
    this.logger.log(`/user/setRole: Setting ${role} role for ${wallet}`);
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
    return { success: true, message: "Role set" };
  }

  async addGithubUser(
    wallet: string,
    githubLogin: string,
  ): Promise<GithubUserProperties | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User {wallet: $wallet}), (gu:GithubUser {login: $githubLogin})
      CREATE (u)-[:HAS_GITHUB_USER]->(gu)
      RETURN gu
      `,
      { wallet, githubLogin },
    );

    return res.records.length
      ? new GithubUserEntity(res.records[0].get("gu")).getProperties()
      : undefined;
  }

  async removeGithubUser(
    userId: string,
    githubUserId: string,
  ): Promise<GithubUserProperties | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User {id: $userId})-[r:HAS_GITHUB_USER]->(gu:GithubUser {id: $githubUserId})
      DELETE r
      RETURN gu
      `,
      { userId, githubUserId },
    );

    return res.records.length
      ? new GithubUserEntity(res.records[0].get("gu")).getProperties()
      : undefined;
  }

  async getRoleForWallet(wallet: string): Promise<UserRoleEntity | undefined> {
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

  async getFlowForWallet(wallet: string): Promise<UserFlowEntity | undefined> {
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

  async getAll(): Promise<UserProfile[]> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (user:User)
          OPTIONAL MATCH (user)-[:HAS_PROFILE]->(profile:UserProfile)
          RETURN {
            availableForWork: profile.availableForWork,
            username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
            avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
            contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0]
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
        this.logger.error(`UserService::getAll ${err.message}`);
        return [];
      });
  }
}
