import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import {
  Organization,
  OrganizationWithRelations,
} from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { OrgJob } from "./org-job.interface";
import { ProjectWithRelations } from "./project-with-relations.interface";
import { Audit } from "./audit.interface";
import { Hack } from "./hack.interface";
import { Investor } from "./investor.interface";
import { Repository } from "./repository.interface";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { Chain } from "./chain.interface";

@ApiExtraModels(OrganizationWithRelations, OrganizationWithLinks, OrgJob)
export class OrganizationWithLinks extends Organization {
  public static readonly OrganizationWithLinksType = t.intersection([
    Organization.OrganizationType,
    t.strict({
      discords: t.array(t.string),
      websites: t.array(t.string),
      telegrams: t.array(t.string),
      githubs: t.array(t.string),
      aliases: t.array(t.string),
      grants: t.array(t.string),
      twitters: t.array(t.string),
      docs: t.array(t.string),
      projects: t.array(
        t.strict({
          github: t.union([t.string, t.null]),
          website: t.union([t.string, t.null]),
          docs: t.union([t.string, t.null]),
          category: t.union([t.string, t.null]),
          twitter: t.union([t.string, t.null]),
          discord: t.union([t.string, t.null]),
          telegram: t.union([t.string, t.null]),
          hacks: t.array(Hack.HackType),
          audits: t.array(Audit.AuditType),
          chains: t.array(Chain.ChainType),
          ecosystems: t.array(t.string),
          jobs: t.array(
            StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
          ),
          investors: t.array(Investor.InvestorType),
          repos: t.array(Repository.RepositoryType),
        }),
      ),
      communities: t.array(t.string),
      detectedJobsites: t.array(
        t.strict({ id: t.string, url: t.string, type: t.string }),
      ),
      jobsites: t.array(
        t.strict({ id: t.string, url: t.string, type: t.string }),
      ),
    }),
  ]);

  @ApiProperty()
  discords: string[];

  @ApiProperty()
  websites: string[];

  @ApiProperty()
  telegrams: string[];

  @ApiProperty()
  githubs: string[];

  @ApiProperty()
  aliases: string[];

  @ApiProperty()
  grants: string[];

  @ApiProperty()
  twitters: string[];

  @ApiProperty()
  docs: string[];

  @ApiProperty()
  projects: ProjectWithRelations[];

  @ApiProperty()
  communities: string[];

  @ApiProperty()
  detectedJobsites: { id: string; url: string; type: string }[];

  @ApiProperty()
  jobsites: { id: string; url: string; type: string }[];

  constructor(raw: OrganizationWithLinks) {
    const {
      discords,
      websites,
      telegrams,
      githubs,
      aliases,
      grants,
      twitters,
      docs,
      projects,
      communities,
      detectedJobsites,
      jobsites,
      ...orgProperties
    } = raw;
    super(orgProperties);
    const result = OrganizationWithLinks.OrganizationWithLinksType.decode(raw);

    this.detectedJobsites = detectedJobsites;
    this.discords = discords;
    this.websites = websites;
    this.telegrams = telegrams;
    this.githubs = githubs;
    this.aliases = aliases;
    this.grants = grants;
    this.twitters = twitters;
    this.docs = docs;
    this.projects = projects;
    this.communities = communities;
    this.jobsites = jobsites;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org with links instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
