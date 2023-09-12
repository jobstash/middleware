import { UserRoleEntity } from "./../../shared/entities/user-role.entity";
import { Injectable } from "@nestjs/common";
import { User, UserEntity, UserFlowEntity } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";

@Injectable()
export class UserService {
  logger = new CustomLogger(UserService.name);
  constructor(
    @InjectConnection()
    private readonly neogma: Neogma,
  ) {}

  async validateUser(id: string): Promise<User | undefined> {
    const user = await this.find(id);

    if (user) {
      return user.getProperties();
    }

    return undefined;
  }

  async find(id: string): Promise<UserEntity | undefined> {
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

  async findByNodeId(nodeId: string): Promise<UserEntity | undefined> {
    return this.neogma.queryRunner
      .run(
        `
            MATCH (u:User {githubNodeId: $nodeId})
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
}
