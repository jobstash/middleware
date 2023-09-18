import { Injectable } from "@nestjs/common";
import { RepositoryEntity } from "../../shared/entities";
import { CustomLogger } from "../../shared/utils/custom-logger";
import {
  GithubUserEntity as GithubUserNode,
  GithubUserProperties,
  Repository,
} from "../../shared/types";
import { CreateGithubUserDto } from "./dto/user/create-github-user.dto";
import { UpdateGithubUserDto } from "./dto/user/update-github-user.dto";
import NotFoundError from "../../shared/errors/not-found-error";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";

@Injectable()
export class GithubUserService {
  private readonly logger = new CustomLogger(GithubUserService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

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
