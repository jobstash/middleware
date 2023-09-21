import { Injectable } from "@nestjs/common";
import { GithubUserEntity, RepositoryEntity } from "../../shared/entities";
import { CustomLogger } from "../../shared/utils/custom-logger";
import {
  GithubUserEntity as GithubUserNode,
  GithubUserProperties,
  Repository,
  Response,
  ResponseWithNoData,
  User,
} from "../../shared/types";
import { CreateGithubUserDto } from "./dto/user/create-github-user.dto";
import { UpdateGithubUserDto } from "./dto/user/update-github-user.dto";
import NotFoundError from "../../shared/errors/not-found-error";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { propertiesMatch } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { GithubLoginInput } from "./dto/github-login.input";
import { UserService } from "../user/user.service";

@Injectable()
export class GithubUserService {
  private readonly logger = new CustomLogger(GithubUserService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly userService: UserService,
  ) {}

  async addGithubInfoToUser(
    args: GithubLoginInput,
  ): Promise<Response<User> | ResponseWithNoData> {
    const logInfo = {
      ...args,
      githubAccessToken: "[REDACTED]",
      githubRefreshToken: "[REDACTED]",
    };
    this.logger.log(
      `/user/addGithubInfoToUser: Assigning ${args.githubId} github account to wallet ${args.wallet}`,
    );

    const { wallet, ...updateObject } = args;

    try {
      const storedUserNode = await this.userService.findByWallet(wallet);
      if (!storedUserNode) {
        return { success: false, message: "User not found" };
      }
      const githubUserNode = await this.findById(updateObject.githubId);

      let persistedGithubNode: GithubUserEntity;

      const payload = {
        id: updateObject.githubId,
        login: updateObject.githubLogin,
        nodeId: updateObject.githubNodeId,
        gravatarId: updateObject.githubGravatarId,
        avatarUrl: updateObject.githubAvatarUrl,
        accessToken: updateObject.githubAccessToken,
        refreshToken: updateObject.githubRefreshToken,
      };

      if (githubUserNode) {
        const githubUserNodeData: GithubUserProperties =
          githubUserNode.getProperties();
        if (propertiesMatch(githubUserNodeData, updateObject)) {
          return { success: false, message: "Github data is identical" };
        }

        persistedGithubNode = await this.update(
          githubUserNode.getId(),
          payload,
        );
      } else {
        persistedGithubNode = await this.create(payload);
        await this.userService.addGithubUser(
          storedUserNode.getId(),
          persistedGithubNode.getId(),
        );
      }

      return {
        success: true,
        message: "Github data persisted",
        data: storedUserNode.getProperties(),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-request-pipeline",
          source: "backend.service",
        });
        scope.setExtra("input", logInfo);
        Sentry.captureException(err);
      });
      this.logger.error(`BackendService::addGithubInfoToUser ${err.message}`);
      return {
        success: false,
        message: "Error adding github info to user",
      };
    }
  }

  async findById(id: number): Promise<GithubUserNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {id: $id})
            RETURN u
        `,
      { id },
    );

    return res.records.length
      ? new GithubUserNode(res.records[0].get("u"))
      : undefined;
  }

  async findByLogin(login: string): Promise<GithubUserNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {login: $login})
            RETURN u
        `,
      { login },
    );

    return res.records.length
      ? new GithubUserNode(res.records[0].get("u"))
      : undefined;
  }

  async findAll(): Promise<GithubUserNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser)
            RETURN u
        `,
    );

    return res.records.length
      ? res.records.map(record => new GithubUserNode(record.get("u")))
      : [];
  }

  async findAllWithOrganization(): Promise<GithubUserNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (o:Organization)-[:HAS_GITHUB_USER]-(u:GithubUser)
            RETURN u
        `,
    );

    return res.records.length
      ? res.records.map(record => new GithubUserNode(record.get("u")))
      : [];
  }

  async create(
    createGithubUserDto: CreateGithubUserDto,
  ): Promise<GithubUserNode> {
    const res = await this.neogma.queryRunner.run(
      `
            CREATE (u:GithubUser $createGithubUserDto)
            RETURN u
        `,
      { createGithubUserDto },
    );

    return new GithubUserNode(res.records[0].get("u"));
  }

  async upsert(githubUser: {
    [key in keyof GithubUserProperties]?: GithubUserProperties[key];
  }): Promise<GithubUserNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MERGE (u:GithubUser {id: $githubUser.id})
            ON CREATE SET u += $githubUser
            ON MATCH SET u += $githubUser
            RETURN u
        `,
      { githubUser },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not create or update GithubUser with id ${githubUser.id}`,
      );
    }

    return new GithubUserNode(res.records[0].get("u"));
  }

  async bulkUpsert(
    githubUsers: {
      [key in keyof GithubUserProperties]?: GithubUserProperties[key];
    }[],
  ): Promise<GithubUserNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            UNWIND $githubUsers AS githubUser
            MERGE (u:GithubUser {id: githubUser.id})
            ON CREATE SET u += githubUser
            ON MATCH SET u += githubUser
            RETURN u
        `,
      { githubUsers },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not create or update GithubUsers with ids ${githubUsers
          .map(githubUser => githubUser.id)
          .join(", ")}`,
      );
    }

    return res.records.map(record => new GithubUserNode(record.get("u")));
  }

  async createOrUpdateMany(
    users: {
      [key in keyof GithubUserProperties]?: GithubUserProperties[key];
    }[],
  ): Promise<GithubUserNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            UNWIND $users AS user
            MERGE (u:GithubUser {id: user.id})
            ON CREATE SET u += user
            ON MATCH SET u += user
            RETURN u
        `,
      { users },
    );

    return res.records.map(record => new GithubUserNode(record.get("u")));
  }

  async update(
    id: number,
    updateGithubUserDto: UpdateGithubUserDto,
  ): Promise<GithubUserNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {id: $id})
            SET u += $updateGithubUserDto
            RETURN u
        `,
      { id, updateGithubUserDto },
    );

    return res.records.length
      ? new GithubUserNode(res.records[0].get("u"))
      : undefined;
  }

  async delete(id: number): Promise<GithubUserNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {id: $id})
            DELETE u
            RETURN u
        `,
      { id },
    );

    return res.records.length
      ? new GithubUserNode(res.records[0].get("u"))
      : undefined;
  }

  async addRepository(
    id: number,
    repositoryId: number,
  ): Promise<Repository | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {id: $id}), (r:Repository {id: $repositoryId})
            MERGE (u)-[:HAS_REPOSITORY]->(r)
            RETURN r
        `,
      { id, repositoryId },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not find GithubUser with id ${id} or Repository with id ${repositoryId}`,
      );
    }

    return new RepositoryEntity(res.records[0].get("r")).getProperties();
  }

  async addRepositories(
    id: number,
    repositoryIds: number[],
  ): Promise<Repository[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {id: $id}), (r:Repository)
            WHERE r.id IN $repositoryIds
            MERGE (u)-[:HAS_REPOSITORY]->(r)
            RETURN r
        `,
      { id, repositoryIds },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not find GithubUser with id ${id} or Repositories with ids ${repositoryIds.join(
          ", ",
        )}`,
      );
    }

    return res.records.map(record =>
      new RepositoryEntity(record.get("r")).getProperties(),
    );
  }

  async addContribution(
    id: number,
    repositoryId: number,
  ): Promise<Repository | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:GithubUser {id: $id}), (r:Repository {id: $repositoryId})
            MERGE (u)-[:CONTRIBUTED_TO]->(r)
            RETURN r
        `,
      { id, repositoryId },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not find GithubUser with id ${id} or Repository with id ${repositoryId}`,
      );
    }

    return new RepositoryEntity(res.records[0].get("r")).getProperties();
  }

  async hasContribution(
    githubUserId: number,
    repositoryId: number,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (gu:GithubUser {id: $githubUserId})
        MATCH (r:Repository {id: $repositoryId})
        WITH gu, r
        RETURN EXISTS((gu)-[:CONTRIBUTED_TO]->(r)) AS result
        `,
      { githubUserId, repositoryId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasRepository(
    githubUserId: number,
    repositoryId: number,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (gu:GithubUser {id: $githubUserId})
        MATCH (r:Repository {id: $repositoryId})
        WITH gu, r
        RETURN EXISTS((gu)-[:HAS_REPOSITORY]->(r)) AS result
        `,
      { githubUserId, repositoryId },
    );

    return res.records[0]?.get("result") ?? false;
  }
}
