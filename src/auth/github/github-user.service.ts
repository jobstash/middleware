import { Injectable } from "@nestjs/common";
import { CustomLogger } from "../../shared/utils/custom-logger";
import {
  GithubUserEntity,
  GithubUserEntity as GithubUserNode,
  GithubUser,
  Response,
  ResponseWithNoData,
  User,
} from "../../shared/types";
import { CreateGithubUserDto } from "./dto/user/create-github-user.dto";
import { UpdateGithubUserDto } from "./dto/user/update-github-user.dto";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { instanceToNode, propertiesMatch } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { UserService } from "../../user/user.service";
import { GithubInfo } from "./dto/github-info.input";
import { ModelService } from "src/model/model.service";

@Injectable()
export class GithubUserService {
  private readonly logger = new CustomLogger(GithubUserService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private readonly userService: UserService,
  ) {}

  async githubUserHasUser(githubId: string): Promise<boolean> {
    const result = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS((:User)-[:HAS_GITHUB_USER]->(:GithubUser {id: $githubId})) AS hasUser
      `,
      { githubId },
    );
    return result.records[0]?.get("hasUser") as boolean;
  }

  async unsafe__linkGithubUser(
    wallet: string,
    githubLogin: string,
  ): Promise<GithubUser | undefined> {
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

  async unlinkGithubUser(
    userId: string,
    githubUserId: string,
  ): Promise<GithubUser | undefined> {
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

  async addGithubInfoToUser(
    args: GithubInfo,
  ): Promise<Response<User> | ResponseWithNoData> {
    const logInfo = {
      ...args,
      githubAccessToken: "[REDACTED]",
      githubRefreshToken: "[REDACTED]",
    };
    this.logger.log(
      `/user/addGithubInfoToUser: Assigning ${args.githubLogin} github account to wallet ${args.wallet}`,
    );

    const { wallet, ...updateObject } = args;

    try {
      const storedUserNode = await this.userService.findByWallet(wallet);
      if (!storedUserNode) {
        return { success: false, message: "User not found" };
      }
      const githubUserNode = await this.findByLogin(updateObject.githubLogin);

      const payload = {
        id: updateObject.githubId,
        login: updateObject.githubLogin,
        nodeId: updateObject.githubNodeId,
        gravatarId: updateObject.githubGravatarId ?? null,
        avatarUrl: updateObject.githubAvatarUrl,
        accessToken: updateObject.githubAccessToken,
        refreshToken: updateObject.githubRefreshToken,
      };

      this.logger.log(JSON.stringify(payload));

      if (githubUserNode) {
        const githubUserNodeData: GithubUser = githubUserNode.getProperties();
        if (propertiesMatch(githubUserNodeData, updateObject)) {
          return { success: false, message: "Github data is identical" };
        }

        await this.update(githubUserNode.getId(), payload);
        const hasUser = await this.githubUserHasUser(githubUserNode.getId());

        if (!hasUser) {
          await this.unsafe__linkGithubUser(wallet, updateObject.githubLogin);
          return {
            success: true,
            message: "Github data persisted successfully",
            data: storedUserNode.getProperties(),
          };
        } else {
          return {
            success: false,
            message: "Github user node already has a user associated with it",
          };
        }
      } else {
        await this.create(payload);
        await this.unsafe__linkGithubUser(wallet, updateObject.githubLogin);
        return {
          success: true,
          message: "Github data persisted successfully",
          data: storedUserNode.getProperties(),
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-request-pipeline",
          source: "github-user.service",
        });
        scope.setExtra("input", logInfo);
        Sentry.captureException(err);
      });
      this.logger.error(
        `GithubUserService::addGithubInfoToUser ${err.message}`,
      );
      return {
        success: false,
        message: "Error adding github info to user",
      };
    }
  }

  async findById(id: string): Promise<GithubUserNode | undefined> {
    const githubNode = await this.models.GithubUsers.findOne({
      where: { id: id },
    });

    return githubNode
      ? new GithubUserNode(instanceToNode(githubNode))
      : undefined;
  }

  async findByLogin(login: string): Promise<GithubUserNode | undefined> {
    const githubNode = await this.models.GithubUsers.findOne({
      where: { login: login },
    });

    return githubNode
      ? new GithubUserNode(instanceToNode(githubNode))
      : undefined;
  }

  async findAll(): Promise<GithubUserNode[]> {
    const githubNodes = await this.models.GithubUsers.findMany();

    return githubNodes.map(
      githubNode => new GithubUserNode(instanceToNode(githubNode)),
    );
  }

  async create(
    createGithubUserDto: CreateGithubUserDto,
  ): Promise<GithubUserNode> {
    const newGithubNode = await this.models.GithubUsers.createOne(
      createGithubUserDto,
      {
        validate: false,
      },
    );
    return new GithubUserNode(instanceToNode(newGithubNode));
  }

  async upsert(githubUser: GithubUser): Promise<GithubUserNode | undefined> {
    const oldNode = await this.findByLogin(githubUser.login);

    if (oldNode) {
      return this.update(oldNode.getId(), githubUser);
    } else {
      return this.create(githubUser);
    }
  }

  async update(
    id: string,
    updateGithubUserDto: UpdateGithubUserDto,
  ): Promise<GithubUserNode | undefined> {
    const oldNode = await this.findById(id);
    if (oldNode) {
      const result = await this.models.GithubUsers.update(updateGithubUserDto, {
        where: { id },
        return: true,
      });
      return new GithubUserNode(instanceToNode(result[0][0]));
    } else {
      this.logger.error(`GithubUserService::update node not found`);
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.models.GithubUsers.delete({
        where: { id: id },
        detach: true,
      });
      return result === 1;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { id });
        Sentry.captureException(err);
      });
      this.logger.error(`GithubUserService::delete ${err.message}`);
      return false;
    }
  }
}
