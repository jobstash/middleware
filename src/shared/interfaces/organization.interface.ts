import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { Tag } from "./tag.interface";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { ProjectWithRelations } from "./project-with-relations.interface";

export class Organization {
  public static readonly OrganizationType = t.strict({
    id: t.string,
    name: t.string,
    orgId: t.string,
    summary: t.string,
    location: t.string,
    description: t.string,
    logoUrl: t.union([t.string, t.null]),
    headCount: t.union([t.number, t.null]),
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  orgId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  summary: string;

  @ApiProperty()
  location: string;

  @ApiProperty()
  logoUrl: string | null;

  @ApiProperty()
  headCount: number | null;

  @ApiPropertyOptional()
  createdTimestamp: number | null;

  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: Organization) {
    const {
      id,
      name,
      logoUrl,
      orgId,
      summary,
      location,
      headCount,
      description,
      createdTimestamp,
      updatedTimestamp,
    } = raw;

    const result = Organization.OrganizationType.decode(raw);

    this.id = id;
    this.name = name;
    this.logoUrl = logoUrl;
    this.orgId = orgId;
    this.summary = summary;
    this.location = location;
    this.headCount = headCount;
    this.description = description;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `organization properties instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}

@ApiExtraModels(ProjectWithRelations, FundingRound)
export class OrganizationWithRelations extends Organization {
  public static readonly OrganizationWithRelationsType = t.intersection([
    Organization.OrganizationType,
    t.strict({
      discord: t.union([t.string, t.null]),
      website: t.union([t.string, t.null]),
      telegram: t.union([t.string, t.null]),
      github: t.union([t.string, t.null]),
      alias: t.union([t.string, t.null]),
      twitter: t.union([t.string, t.null]),
      docs: t.union([t.string, t.null]),
      projects: t.array(ProjectWithRelations.ProjectWithRelationsType),
      fundingRounds: t.array(FundingRound.FundingRoundType),
      investors: t.array(Investor.InvestorType),
    }),
  ]);

  @ApiPropertyOptional()
  discord: string | null;

  @ApiPropertyOptional()
  website: string | null;

  @ApiPropertyOptional()
  telegram: string | null;

  @ApiPropertyOptional()
  github: string | null;

  @ApiPropertyOptional()
  alias: string | null;

  @ApiPropertyOptional()
  twitter: string | null;

  @ApiPropertyOptional()
  docs: string | null;

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(ProjectWithRelations) },
  })
  projects: ProjectWithRelations[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(FundingRound) },
  })
  fundingRounds: FundingRound[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Investor) },
  })
  investors: Investor[];

  constructor(raw: OrganizationWithRelations) {
    const {
      discord,
      website,
      telegram,
      github,
      twitter,
      docs,
      alias,
      projects,
      fundingRounds,
      investors,
      ...orgProperties
    } = raw;
    super(orgProperties);
    const result =
      OrganizationWithRelations.OrganizationWithRelationsType.decode(raw);

    this.discord = discord;
    this.website = website;
    this.telegram = telegram;
    this.github = github;
    this.alias = alias;
    this.twitter = twitter;
    this.docs = docs;
    this.projects = projects;
    this.fundingRounds = fundingRounds;
    this.investors = investors;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `organization instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class ShortOrg {
  public static readonly ShortOrgType = t.strict({
    orgId: t.string,
    url: t.string,
    name: t.string,
    location: t.string,
    jobCount: t.number,
    headCount: t.number,
    projectCount: t.number,
    lastFundingDate: t.number,
    lastFundingAmount: t.number,
    logo: t.union([t.string, t.null]),
    tags: t.array(Tag.TagType),
  });

  @ApiProperty()
  orgId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logo: string | null;

  @ApiProperty()
  location: string;

  @ApiProperty()
  jobCount: number;

  @ApiProperty()
  projectCount: number;

  @ApiProperty()
  headCount: number;

  @ApiProperty()
  lastFundingAmount: number;

  @ApiProperty()
  lastFundingDate: number;

  @ApiProperty()
  url: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(Tag) } })
  tags: Tag[];

  constructor(raw: ShortOrg) {
    const {
      orgId,
      url,
      name,
      logo,
      location,
      jobCount,
      headCount,
      description,
      projectCount,
      tags,
      lastFundingDate,
      lastFundingAmount,
    } = raw;

    const result = ShortOrg.ShortOrgType.decode(raw);

    this.orgId = orgId;
    this.url = url;
    this.name = name;
    this.logo = logo;
    this.location = location;
    this.jobCount = jobCount;
    this.headCount = headCount;
    this.description = description;
    this.projectCount = projectCount;
    this.tags = tags;
    this.lastFundingDate = lastFundingDate;
    this.lastFundingAmount = lastFundingAmount;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `short org instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}
