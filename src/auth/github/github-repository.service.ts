import { Injectable } from "@nestjs/common";
import * as dotenv from "dotenv";

import { CreateRepositoryDto } from "./dto/repository/create-github-repository.dto";
import { UpdateRepositoryDto } from "./dto/repository/update-github-repository.dto";
import NotFoundError from "src/shared/errors/not-found-error";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  GithubUserEntity as GithubUser,
  RepositoryEntity as RepositoryNode,
  RepositoryProperties,
} from "src/shared/types";
import { Neogma } from "neogma";
dotenv.config();

@Injectable()
export class GithubRepositoryService {
  private readonly logger = new CustomLogger(GithubRepositoryService.name);

  constructor(private neogma: Neogma) {}

  async findById(id: number): Promise<RepositoryNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository {id: $id})
            RETURN r
        `,
      { id },
    );
    return res.records.length
      ? new RepositoryNode(res.records[0].get("r"))
      : undefined;
  }

  async findAll(): Promise<RepositoryNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository)
            RETURN r
        `,
    );
    return res.records.length
      ? res.records.map(record => new RepositoryNode(record.get("r")))
      : [];
  }

  async findAllByOrganizationId(
    organizationId: string,
  ): Promise<RepositoryNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (o:Organization {id: $organizationId})-[:HAS_REPOSITORY]-(r:Repository)
            RETURN r
        `,
      { organizationId },
    );
    return res.records.length
      ? res.records.map(record => new RepositoryNode(record.get("r")))
      : [];
  }

  async create(
    createRepositoryDto: CreateRepositoryDto,
  ): Promise<RepositoryNode> {
    const res = await this.neogma.queryRunner.run(
      `
            CREATE (r:Repository $createRepositoryDto)
            RETURN r
        `,
      { createRepositoryDto },
    );
    return new RepositoryNode(res.records[0].get("r"));
  }

  async update(
    id: number,
    updateRepositoryDto: UpdateRepositoryDto,
  ): Promise<RepositoryNode> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository {id: $id})
            SET r += $updateRepositoryDto
            RETURN r
        `,
      { id, updateRepositoryDto },
    );
    return new RepositoryNode(res.records[0].get("r"));
  }

  async delete(id: number): Promise<RepositoryNode> {
    await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository {id: $id})
            DELETE DETACH r
        `,
      { id },
    );
    return;
  }

  async upsert(repository: {
    [key in keyof RepositoryProperties]?: RepositoryProperties[key];
  }): Promise<RepositoryNode> {
    const res = await this.neogma.queryRunner.run(
      `
            MERGE (r:Repository {id: $repository.id})
            ON CREATE SET r += $repository
            ON MATCH SET r += $repository
            RETURN r
        `,
      { repository },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not create or update Repository ${repository.id}`,
      );
    }

    return new RepositoryNode(res.records[0].get("r"));
  }

  async bulkUpsert(
    repositories: {
      [key in keyof RepositoryProperties]?: RepositoryProperties[key];
    }[],
  ): Promise<RepositoryNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            UNWIND $repositories AS repository
            MERGE (r:Repository {id: repository.id})
            ON CREATE SET r += repository
            ON MATCH SET r += repository
            RETURN r
        `,
      { repositories },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not create or update Repositories ${repositories
          .map(repo => repo.id)
          .join(", ")}`,
      );
    }

    return res.records.map(record => new RepositoryNode(record.get("r")));
  }

  async createOrUpdate(repository: {
    [key in keyof RepositoryProperties]?: RepositoryProperties[key];
  }): Promise<RepositoryNode> {
    const res = await this.neogma.queryRunner.run(
      `
            MERGE (r:Repository {id: $repository.id})
            ON CREATE SET r += $repository
            ON MATCH SET r += $repository
            RETURN r
        `,
      { repository },
    );

    return new RepositoryNode(res.records[0].get("r"));
  }

  async createOrUpdateMany(
    repositories: {
      [key in keyof RepositoryProperties]?: RepositoryProperties[key];
    }[],
  ): Promise<RepositoryNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            UNWIND $repositories AS repository
            MERGE (r:Repository {id: repository.id})
            ON CREATE SET r += repository
            ON MATCH SET r += repository
            RETURN r
        `,
      { repositories },
    );

    return res.records.map(record => new RepositoryNode(record.get("r")));
  }

  async relateManyContributors(
    repositoryId: number,
    contributors: {
      id: number;
      commits: number;
      weeks: {
        week: number;
        additions: number;
        deletions: number;
        commits: number;
      }[];
    }[],
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
            UNWIND $contributors AS contributor
            MATCH (r:Repository {id: $repositoryId})
            MATCH (u:GithubUser {id: contributor.id})
            MERGE (u)-[c:CONTRIBUTED_TO]->(r)
            SET c.commits = contributor.commits, c.weeks = contributor.weeks
        `,
      { repositoryId, contributors },
    );
  }

  async updateCommitStats(
    repositoryId: number,
    weeklyCommits: number[],
    dailyCommits: number[],
    totalCommits: number,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository {id: $repositoryId})
            SET r.weeklyCommits = $weeklyCommits, r.dailyCommits = $dailyCommits, r.totalCommits = $totalCommits
        `,
      { repositoryId, weeklyCommits, dailyCommits, totalCommits },
    );
  }

  async storeRepositoryData(
    repodata: RepositoryProperties,
  ): Promise<RepositoryNode> {
    const existingRepositoryNode = await this.findById(repodata.id);

    if (existingRepositoryNode) {
      this.logger.log(
        `Repository with id ${repodata.id} already exists in the database`,
      );
      return await this.update(existingRepositoryNode.getId(), repodata);
    } else {
      this.logger.log(
        `Repository with name ${repodata.name} does not exist in the database`,
      );
      return await this.create(repodata);
    }
  }

  async addContributors(
    repositoryId: number,
    githubUserIds: number[],
  ): Promise<GithubUser[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository {id: $repositoryId}), (u:GithubUser)
            WHERE u.id IN $githubUserIds
            MERGE (u)-[:CONTRIBUTED_TO]->(r)
            RETURN u
        `,
      { repositoryId, githubUserIds },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not create relationship between Repository ${repositoryId} to GithubUsers ${githubUserIds}`,
      );
    }

    return res.records.map(record => new GithubUser(record.get("u")));
  }

  async getLatestCommitDate(repositoryId: number): Promise<number> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (r:Repository {id: $repositoryId})-[c:HAS_COMMIT]->(commit:Commit)
            WITH commit
            ORDER BY commit.date DESC
            LIMIT 1
            RETURN commit.date AS date
        `,
      { repositoryId },
    );

    if (!res.records.length) {
      throw new NotFoundError(
        `Could not find Repository ${repositoryId} to get latest commit date`,
      );
    }

    return res.records[0].get("date");
  }
}
