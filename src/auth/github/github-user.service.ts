import { Injectable } from "@nestjs/common";
import { CustomLogger } from "../../shared/utils/custom-logger";
import {
  GithubUserEntity,
  GithubUserEntity as GithubUserNode,
  GithubUser,
  Response,
  ResponseWithNoData,
  User,
  UserEntity,
} from "../../shared/types";
import { CreateGithubUserDto } from "./dto/user/create-github-user.dto";
import { UpdateGithubUserDto } from "./dto/user/update-github-user.dto";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { instanceToNode, propertiesMatch } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { GithubInfo } from "./dto/github-info.input";
import { ModelService } from "src/model/model.service";

@Injectable()
export class GithubUserService {
  private readonly logger = new CustomLogger(GithubUserService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  async unsafe__linkGithubUser(
    wallet: string,
    githubLogin: string,
  ): Promise<GithubUser | undefined> {
    this.logger.log(`Linking github user to wallet ${wallet}`);
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User {wallet: $wallet}), (gu:GithubUser {login: $githubLogin})
      MERGE (u)-[:HAS_GITHUB_USER]->(gu)
      RETURN gu
      `,
      { wallet, githubLogin },
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
      `/user/addGithubInfoToUser: Assigning github account to wallet ${args.wallet}`,
    );

    const { wallet, ...updateObject } = args;

    try {
      const storedUserNode = new UserEntity(
        instanceToNode(
          await this.models.Users.findOne({
            where: {
              wallet: wallet,
            },
          }),
        ),
      );
      if (!storedUserNode) {
        return { success: false, message: "User not found" };
      }
      const githubUserNode = await this.findByLogin(updateObject.githubLogin);

      const payload = {
        login: updateObject.githubLogin,
        avatarUrl: updateObject.githubAvatarUrl,
      };

      if (githubUserNode) {
        this.logger.log("debug - GH User node found");
        const githubUserNodeData: GithubUser = githubUserNode.getProperties();
        if (propertiesMatch(githubUserNodeData, updateObject)) {
          return { success: false, message: "Github data is identical" };
        }

        await this.update(payload);
        await this.unsafe__linkGithubUser(wallet, updateObject.githubLogin);
        return {
          success: true,
          message: "Github data persisted successfully",
          data: storedUserNode.getProperties(),
        };
      } else {
        this.logger.log("debug - GH User node not found, creating...");
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

  async removeGithubInfoFromUser(
    wallet: string,
    login: string = null,
  ): Promise<void> {
    if (login) {
      await this.neogma.queryRunner.run(
        `
      MATCH (u:User {wallet: $wallet})-[r:HAS_GITHUB_USER]->(gu:GithubUser {login: $githubLogin})
      DELETE r
      `,
        { wallet, githubLogin: login },
      );
    } else {
      await this.neogma.queryRunner.run(
        `
      MATCH (u:User {wallet: $wallet})-[r:HAS_GITHUB_USER]->(:GithubUser)
      DELETE r
      `,
        { wallet },
      );
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

  async create(
    createGithubUserDto: CreateGithubUserDto,
  ): Promise<GithubUserNode> {
    const result = await this.neogma.queryRunner.run(
      `
      MERGE (ghu:GithubUser {login: $login})
      ON CREATE SET
        ghu.id = randomUUID(),
        ghu.avatarUrl = $avatarUrl,
        ghu.createdTimestamp = timestamp()
      ON MATCH SET
        ghu.avatarUrl = $avatarUrl,
        ghu.updatedTimestamp = timestamp()
      RETURN ghu
      `,
      {
        login: createGithubUserDto.login,
        avatarUrl: createGithubUserDto.avatarUrl,
      },
    );
    return new GithubUserNode(result.records[0].get("ghu"));
  }

  async update(
    updateGithubUserDto: UpdateGithubUserDto,
  ): Promise<GithubUserNode | undefined> {
    const oldNode = await this.findByLogin(updateGithubUserDto.login);
    if (oldNode) {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (ghu:GithubUser {login: $login})
        SET
          ghu.avatarUrl = $avatarUrl,
          ghu.updatedTimestamp = timestamp()
        RETURN ghu
        `,
        {
          ...updateGithubUserDto,
        },
      );
      return new GithubUserNode(result.records[0].get("ghu"));
    } else {
      this.logger.error(`GithubUserService::update node not found`);
      return undefined;
    }
  }
}
