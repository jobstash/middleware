import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";
import { Technology } from "./technology.interface";
import { FundingRound } from "./funding-round.interface";
import { Project } from "./project.interface";
import { Investor } from "./investor.interface";

export class OrganizationProperties {
  public static readonly OrganizationPropertiesType = t.strict({
    id: t.string,
    url: t.string,
    name: t.string,
    orgId: t.string,
    summary: t.string,
    location: t.string,
    description: t.string,
    jobsiteLink: t.string,
    docs: t.union([t.string, t.null]),
    github: t.union([t.string, t.null]),
    altName: t.union([t.string, t.null]),
    discord: t.union([t.string, t.null]),
    twitter: t.union([t.string, t.null]),
    teamSize: t.union([t.number, t.null]),
    telegram: t.union([t.string, t.null]),
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
  url: string;

  @ApiProperty()
  jobsiteLink: string;

  @ApiProperty()
  docs: string | null;

  @ApiProperty()
  altName: string | null;

  @ApiProperty()
  headCount: number | null;

  @ApiPropertyOptional()
  github: string | null;

  @ApiPropertyOptional()
  teamSize: number | null;

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

  // constructor(raw: OrganizationProperties) {
  //   const {
  //     id,
  //     url,
  //     name,
  //     docs,
  //     orgId,
  //     github,
  //     summary,
  //     altName,
  //     twitter,
  //     discord,
  //     location,
  //     teamSize,
  //     telegram,
  //     headCount,
  //     description,
  //     jobsiteLink,
  //     createdTimestamp,
  //     updatedTimestamp,
  //   } = raw;

  //   const result =
  //     OrganizationProperties.OrganizationPropertiesType.decode(raw);

  //   this.id = id;
  //   this.url = url;
  //   this.name = name;
  //   this.docs = docs;
  //   this.orgId = orgId;
  //   this.github = github;
  //   this.summary = summary;
  //   this.altName = altName;
  //   this.twitter = twitter;
  //   this.discord = discord;
  //   this.location = location;
  //   this.teamSize = teamSize;
  //   this.telegram = telegram;
  //   this.headCount = headCount;
  //   this.description = description;
  //   this.jobsiteLink = jobsiteLink;
  //   this.createdTimestamp = createdTimestamp;
  //   this.updatedTimestamp = updatedTimestamp;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing OrganizationProperties! Constructor expected: \n {
  //         id: string,
  //         url: string,
  //         name: string,
  //         orgId: string,
  //         summary: string,
  //         location: string,
  //         description: string,
  //         jobsiteLink: string,
  //         docs: string | null,
  //         github: string | null,
  //         altName: string | null,
  //         twitter: string | null,
  //         discord: string | null,
  //         teamSize: number | null,
  //         telegram: string | null,
  //         headCount: number | null,
  //         createdTimestamp: number | null,
  //         updatedTimestamp: number | null,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
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

  // constructor(raw: Organization) {
  //   const { projects, fundingRounds, ...orgProperties } = raw;
  //   super(orgProperties);
  //   const result = Organization.OrganizationType.decode(raw);

  //   this.projects = projects;
  //   this.fundingRounds = fundingRounds;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing Project! Constructor expected: \n {
  //         ...OrganizationProperties,
  //         projects: Project[],
  //         fundingRounds: FundingRound[],
  //       }
  //       got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}

// TODO: Review this with @duckdegen
export class ShortOrg {
  public static readonly ShortOrgType = t.strict({
    id: t.string,
    url: t.string,
    name: t.string,
    github: t.string,
    twitter: t.string,
    discord: t.string,
    location: t.string,
    jobCount: t.number,
    telegram: t.string,
    headCount: t.number,
    description: t.string,
    projectCount: t.number,
    lastFundingDate: t.number,
    lastFundingAmount: t.number,
    logo: t.union([t.string, t.null]),
    technologies: t.array(Technology.TechnologyType),
    fundingRounds: t.array(FundingRound.FundingRoundType),
  });

  @ApiProperty()
  id: string;

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

  @ApiProperty()
  github: string;

  @ApiProperty()
  twitter: string;

  @ApiProperty()
  telegram: string;

  @ApiProperty()
  discord: string;

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(FundingRound) },
  })
  fundingRounds: FundingRound[];

  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(Technology) } })
  technologies: Technology[];

  // constructor(raw: ShortOrg) {
  //   const {
  //     id,
  //     url,
  //     name,
  //     logo,
  //     github,
  //     twitter,
  //     discord,
  //     location,
  //     jobCount,
  //     telegram,
  //     headCount,
  //     description,
  //     projectCount,
  //     technologies,
  //     fundingRounds,
  //     lastFundingDate,
  //     lastFundingAmount,
  //   } = raw;

  //   const result = ShortOrg.ShortOrgType.decode(raw);

  //   this.id = id;
  //   this.url = url;
  //   this.name = name;
  //   this.logo = logo;
  //   this.github = github;
  //   this.twitter = twitter;
  //   this.discord = discord;
  //   this.location = location;
  //   this.jobCount = jobCount;
  //   this.telegram = telegram;
  //   this.headCount = headCount;
  //   this.description = description;
  //   this.projectCount = projectCount;
  //   this.technologies = technologies;
  //   this.fundingRounds = fundingRounds;
  //   this.lastFundingDate = lastFundingDate;
  //   this.lastFundingAmount = lastFundingAmount;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing ShortOrg! Constructor expected: \n {
  //         id: string,
  //         url: string,
  //         name: string,
  //         github: string,
  //         twitter: string,
  //         discord: string,
  //         location: string,
  //         jobCount: number,
  //         telegram: string,
  //         headCount: number,
  //         logo: string | null,
  //         description: string,
  //         projectCount: number,
  //         lastFundingDate: number,
  //         lastFundingAmount: number,
  //         technologies: Technology[]
  //         fundingRounds: FundingRoundProperties[],
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
