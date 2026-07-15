import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { GraphRepository } from "src/postgres/graph.repository";
import {
  GithubUser,
  GithubUserEntity as GithubUserNode,
  Response,
  ResponseWithNoData,
  User,
  UserEntity,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GithubInfo } from "./dto/github-info.input";
import { CreateGithubUserDto } from "./dto/user/create-github-user.dto";
import { UpdateGithubUserDto } from "./dto/user/update-github-user.dto";

@Injectable()
export class GithubUserService {
  private readonly logger = new CustomLogger(GithubUserService.name);

  constructor(private readonly graph: GraphRepository) {}

  async unsafe__linkGithubUser(
    wallet: string,
    githubLogin: string,
  ): Promise<GithubUser | undefined> {
    this.logger.log(`Linking github user to wallet ${wallet}`);
    const [githubUser] = await this.graph.setRelationshipsToNodes({
      sourceLabel: "User",
      sourceWhere: { wallet },
      type: "HAS_GITHUB_USER",
      targetLabel: "GithubUser",
      targetProperty: "login",
      targetValues: [githubLogin],
      replace: false,
    });
    return githubUser?.properties as unknown as GithubUser | undefined;
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
    try {
      const storedUser = await this.graph.findNode<Record<string, unknown>>(
        "User",
        { wallet: args.wallet },
      );
      if (!storedUser) return { success: false, message: "User not found" };

      const payload = {
        login: args.githubLogin,
        avatarUrl: args.githubAvatarUrl,
      };
      const githubUser = await this.findByLogin(args.githubLogin);
      if (
        githubUser?.getLogin() === payload.login &&
        githubUser.getAvatarUrl() === payload.avatarUrl
      ) {
        const alreadyLinked = await this.graph.hasRelationship({
          sourceLabel: "User",
          sourceWhere: { wallet: args.wallet },
          type: "HAS_GITHUB_USER",
          targetLabel: "GithubUser",
          targetWhere: { login: args.githubLogin },
        });
        if (alreadyLinked) {
          return { success: false, message: "Github data is identical" };
        }
      }

      if (githubUser) await this.update(payload);
      else await this.create(payload);
      await this.unsafe__linkGithubUser(args.wallet, args.githubLogin);
      return {
        success: true,
        message: "Github data persisted successfully",
        data: new UserEntity(
          storedUser.properties as unknown as User,
        ).getProperties(),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-request-pipeline",
          source: "github-user.service",
        });
        scope.setExtra("input", logInfo);
        Sentry.captureException(error);
      });
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`GithubUserService::addGithubInfoToUser ${message}`);
      return { success: false, message: "Error adding github info to user" };
    }
  }

  async removeGithubInfoFromUser(
    wallet: string,
    login: string = null,
  ): Promise<void> {
    if (login) {
      await this.graph.deleteRelationshipBetween({
        sourceLabel: "User",
        sourceWhere: { wallet },
        type: "HAS_GITHUB_USER",
        targetLabel: "GithubUser",
        targetWhere: { login },
      });
      return;
    }
    await this.graph.setRelationshipsToNodes({
      sourceLabel: "User",
      sourceWhere: { wallet },
      type: "HAS_GITHUB_USER",
      targetLabel: "GithubUser",
      targetProperty: "login",
      targetValues: [],
      replace: true,
    });
  }

  async findById(id: string): Promise<GithubUserNode | undefined> {
    const githubUser = await this.graph.findNode<Record<string, unknown>>(
      "GithubUser",
      { id },
    );
    return githubUser
      ? new GithubUserNode(githubUser.properties as unknown as GithubUser)
      : undefined;
  }

  async findByLogin(login: string): Promise<GithubUserNode | undefined> {
    const githubUser = await this.graph.findNode<Record<string, unknown>>(
      "GithubUser",
      { login },
    );
    return githubUser
      ? new GithubUserNode(githubUser.properties as unknown as GithubUser)
      : undefined;
  }

  async create(input: CreateGithubUserDto): Promise<GithubUserNode> {
    if (!input.login) throw new Error("GitHub login is required");
    const existing = await this.findByLogin(input.login);
    if (existing) {
      return (await this.update(input)) ?? existing;
    }
    const id = randomUUID();
    const githubUser = await this.graph.createNode(
      "GithubUser",
      {
        id,
        login: input.login,
        avatarUrl: input.avatarUrl,
        createdTimestamp: Date.now(),
      },
      `runtime:${id}`,
    );
    return new GithubUserNode(githubUser.properties as unknown as GithubUser);
  }

  async update(
    input: UpdateGithubUserDto,
  ): Promise<GithubUserNode | undefined> {
    if (!input.login) {
      this.logger.error("GithubUserService::update login is required");
      return undefined;
    }
    const [githubUser] = await this.graph.updateNodes<Record<string, unknown>>(
      "GithubUser",
      { login: input.login },
      { avatarUrl: input.avatarUrl, updatedTimestamp: Date.now() },
    );
    if (!githubUser) {
      this.logger.error("GithubUserService::update node not found");
      return undefined;
    }
    return new GithubUserNode(githubUser.properties as unknown as GithubUser);
  }
}
