import { Injectable } from "@nestjs/common";
import {
  GithubOrganizationProperties,
  GithubOrganizationEntity as OrganizationNode,
} from "src/shared/types";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";

@Injectable()
export class GithubOrganizationService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async findAll(): Promise<OrganizationNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (o:GithubOrganization)
            RETURN o
        `,
    );
    return res.records.length
      ? res.records.map(record => new OrganizationNode(record.get("o")))
      : [];
  }

  async findById(id: string): Promise<OrganizationNode | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (o:GithubOrganization {id: $id})
            RETURN o
        `,
      { id },
    );
    return res.records.length
      ? new OrganizationNode(res.records[0].get("o"))
      : undefined;
  }

  async createOrUpdate(organization: {
    [key in keyof GithubOrganizationProperties]?: GithubOrganizationProperties[key];
  }): Promise<OrganizationNode> {
    const res = await this.neogma.queryRunner.run(
      `
            MERGE (o:GithubOrganization {id: $organization.id})
            ON CREATE SET o += $organization
            ON MATCH SET o += $organization
            RETURN o
        `,
      { organization },
    );
    return new OrganizationNode(res.records[0].get("o"));
  }

  async createOrUpdateMany(
    organizations: {
      [key in keyof GithubOrganizationProperties]?: GithubOrganizationProperties[key];
    }[],
  ): Promise<OrganizationNode[]> {
    const res = await this.neogma.queryRunner.run(
      `
            UNWIND $organizations AS organization
            MERGE (o:GithubOrganization {id: organization.id})
            ON CREATE SET o += organization
            ON MATCH SET o += organization
            RETURN o
        `,
      { organizations },
    );
    return res.records.map(record => new OrganizationNode(record.get("o")));
  }

  async relateRepository(
    organizationId: number,
    repositoryId: number,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
            MATCH (o:GithubOrganization {id: $organizationId})
            MATCH (r:Repository {id: $repositoryId})
            MERGE (o)-[:HAS_REPOSITORY]->(r)
        `,
      { organizationId, repositoryId },
    );
  }

  async relateManyRepositories(
    organizationId: number,
    repositoriesIds: number[],
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
            MATCH (o:GithubOrganization {id: $organizationId})
            MATCH (r:Repository)
            WHERE r.id IN $repositoriesIds
            MERGE (o)-[:HAS_REPOSITORY]->(r)
        `,
      { organizationId, repositoriesIds },
    );
  }
}
