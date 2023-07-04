import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { Technology } from "./technology.interface";
import { FundingRound } from "./funding-round.interface";
import { Project } from "./project.interface";
import { Investor } from "./investor.interface";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class OrganizationProperties {
  public static readonly OrganizationPropertiesType = t.strict({
    id: t.string,
    url: t.string,
    name: t.string,
    orgId: t.string,
    summary: t.string,
    location: t.string,
    description: t.string,
    docs: t.union([t.string, t.null]),
    logo: t.union([t.string, t.null]),
    github: t.union([t.string, t.null]),
    altName: t.union([t.string, t.null]),
    discord: t.union([t.string, t.null]),
    twitter: t.union([t.string, t.null]),
    telegram: t.union([t.string, t.null]),
    headCount: t.union([t.number, t.null]),
    jobsiteLink: t.union([t.string, t.null]),
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
  url: string;

  @ApiProperty()
  jobsiteLink: string;

  @ApiProperty()
  docs: string | null;

  @ApiProperty()
  logo: string | null;

  @ApiProperty()
  altName: string | null;

  @ApiProperty()
  headCount: number | null;

  @ApiPropertyOptional()
  github: string | null;

  @ApiPropertyOptional()
  twitter: string | null;

  @ApiPropertyOptional()
  discord: string | null;

  @ApiPropertyOptional()
  telegram: string | null;

  @ApiPropertyOptional()
  createdTimestamp: number | null;

  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: OrganizationProperties) {
    const {
      id,
      url,
      name,
      docs,
      logo,
      orgId,
      github,
      summary,
      altName,
      twitter,
      discord,
      location,
      telegram,
      headCount,
      description,
      jobsiteLink,
      createdTimestamp,
      updatedTimestamp,
    } = raw;

    const result =
      OrganizationProperties.OrganizationPropertiesType.decode(raw);

    this.id = id;
    this.url = url;
    this.name = name;
    this.docs = docs;
    this.logo = logo;
    this.orgId = orgId;
    this.github = github;
    this.summary = summary;
    this.altName = altName;
    this.twitter = twitter;
    this.discord = discord;
    this.location = location;
    this.telegram = telegram;
    this.headCount = headCount;
    this.description = description;
    this.jobsiteLink = jobsiteLink;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

@ApiExtraModels(Project, FundingRound)
export class Organization extends OrganizationProperties {
  public static readonly OrganizationType = t.intersection([
    OrganizationProperties.OrganizationPropertiesType,
    t.strict({
      projects: t.array(Project.ProjectType),
      fundingRounds: t.array(FundingRound.FundingRoundType),
      investors: t.array(Investor.InvestorType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Project) },
  })
  projects: Project[];

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

  constructor(raw: Organization) {
    const { projects, fundingRounds, investors, ...orgProperties } = raw;
    super(orgProperties);
    const result = Organization.OrganizationType.decode(raw);

    this.projects = projects;
    this.fundingRounds = fundingRounds;
    this.investors = investors;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
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
    technologies: t.array(Technology.TechnologyType),
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

  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(Technology) } })
  technologies: Technology[];

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
      technologies,
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
    this.technologies = technologies;
    this.lastFundingDate = lastFundingDate;
    this.lastFundingAmount = lastFundingAmount;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
