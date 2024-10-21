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
import { Investor } from "./investor.interface";

export class ProjectWithRelations extends ProjectMoreInfo {
  public static readonly ProjectWithRelationsType = t.intersection([
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
    items: { $ref: getSchemaPath(Investor) },
  })
  investors: Investor[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(StructuredJobpostWithRelations) },
  })
  repos: Repository[];

  constructor(raw: ProjectWithRelations) {
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
      investors,
      repos,
      ...projectProperties
    } = raw;
    super(projectProperties);
    const result = ProjectWithRelations.ProjectWithRelationsType.decode(raw);

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
    this.investors = investors;
    this.repos = repos;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
