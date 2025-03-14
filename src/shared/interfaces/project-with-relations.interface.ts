import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Chain } from "./chain.interface";
import { Audit } from "./audit.interface";
import { Hack } from "./hack.interface";
import { ProjectMoreInfo } from "./project-more-info.interface";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { Repository } from "./repository.interface";
import { GrantFunding } from "./grant.interface";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";

export class ProjectWithBaseRelations extends ProjectMoreInfo {
  public static readonly ProjectWithBaseRelationsType = t.intersection([
    ProjectMoreInfo.ProjectMoreInfoType,
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
      grants: t.array(GrantFunding.GrantFundingType),
      fundingRounds: t.array(FundingRound.FundingRoundType),
      repos: t.array(Repository.RepositoryType),
    }),
  ]);

  @ApiPropertyOptional()
  category: string | null;

  @ApiPropertyOptional()
  website: string | null;

  @ApiPropertyOptional()
  github: string | null;

  @ApiPropertyOptional()
  twitter: string | null;

  @ApiPropertyOptional()
  telegram: string | null;

  @ApiPropertyOptional()
  discord: string | null;

  @ApiPropertyOptional()
  docs: string | null;

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Hack) },
  })
  hacks: Hack[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Audit) },
  })
  audits: Audit[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Chain) },
  })
  chains: Chain[];

  @ApiProperty()
  ecosystems: string[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(StructuredJobpostWithRelations) },
  })
  jobs: StructuredJobpostWithRelations[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(StructuredJobpostWithRelations) },
  })
  repos: Repository[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(GrantFunding) },
  })
  grants: GrantFunding[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(FundingRound) },
  })
  fundingRounds: FundingRound[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Investor) },
  })
  investors: Investor[];

  constructor(raw: ProjectWithBaseRelations) {
    const {
      github,
      docs,
      category,
      twitter,
      website,
      discord,
      telegram,
      hacks,
      audits,
      chains,
      ecosystems,
      jobs,
      repos,
      grants,
      investors,
      fundingRounds,
      ...projectProperties
    } = raw;
    super(projectProperties);
    const result =
      ProjectWithBaseRelations.ProjectWithBaseRelationsType.decode(raw);

    this.github = github;
    this.docs = docs;
    this.category = category;
    this.twitter = twitter;
    this.website = website;
    this.discord = discord;
    this.telegram = telegram;
    this.hacks = hacks;
    this.audits = audits;
    this.chains = chains;
    this.ecosystems = ecosystems;
    this.jobs = jobs;
    this.repos = repos;
    this.grants = grants;
    this.investors = investors;
    this.fundingRounds = fundingRounds;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project with base relations instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class ProjectWithRelations extends ProjectWithBaseRelations {
  public static readonly ProjectWithRelationsType = t.intersection([
    ProjectWithBaseRelations.ProjectWithBaseRelationsType,
    t.strict({
      jobsites: t.array(
        t.strict({
          id: t.string,
          url: t.string,
          type: t.string,
        }),
      ),
      detectedJobsites: t.array(
        t.strict({
          id: t.string,
          url: t.string,
          type: t.string,
        }),
      ),
    }),
  ]);

  @ApiProperty()
  jobsites: { id: string; url: string; type: string }[];

  @ApiProperty()
  detectedJobsites: { id: string; url: string; type: string }[];

  constructor(raw: ProjectWithRelations) {
    const { jobsites, detectedJobsites, ...projectProperties } = raw;
    super(projectProperties);
    const result = ProjectWithRelations.ProjectWithRelationsType.decode(raw);

    this.jobsites = jobsites;
    this.detectedJobsites = detectedJobsites;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project with relations instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
