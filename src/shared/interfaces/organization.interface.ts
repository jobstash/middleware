import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { ProjectWithRelations } from "./project-with-relations.interface";
import { OrgReview } from "./org-review.interface";
import { OrgRating } from "./org-ratings.interface";

export class Organization {
  public static readonly OrganizationType = t.strict({
    id: t.string,
    name: t.string,
    orgId: t.string,
    summary: t.string,
    location: t.string,
    description: t.string,
    logoUrl: t.union([t.string, t.null]),
    headcountEstimate: t.union([t.number, t.null]),
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
  headcountEstimate: number | null;

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
      headcountEstimate,
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
    this.headcountEstimate = headcountEstimate;
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
      aggregateRating: t.number,
      aggregateRatings: OrgRating.OrgRatingType,
      reviewCount: t.number,
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
      reviews: t.array(OrgReview.OrgReviewType),
    }),
  ]);

  @ApiProperty()
  aggregateRating: number;

  @ApiProperty()
  aggregateRatings: OrgRating;

  @ApiProperty()
  reviewCount: number;

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

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(OrgReview) },
  })
  reviews: OrgReview[];

  constructor(raw: OrganizationWithRelations) {
    const {
      aggregateRating,
      aggregateRatings,
      reviewCount,
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
      reviews,
      ...orgProperties
    } = raw;
    super(orgProperties);
    const result =
      OrganizationWithRelations.OrganizationWithRelationsType.decode(raw);

    this.aggregateRating = aggregateRating;
    this.aggregateRatings = aggregateRatings;
    this.reviewCount = reviewCount;
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
    this.reviews = reviews;

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
    headcountEstimate: t.number,
    projectCount: t.number,
    aggregateRating: t.number,
    reviewCount: t.number,
    lastFundingDate: t.number,
    lastFundingAmount: t.number,
    logoUrl: t.union([t.string, t.null]),
  });

  @ApiProperty()
  orgId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logoUrl: string | null;

  @ApiProperty()
  location: string;

  @ApiProperty()
  jobCount: number;

  @ApiProperty()
  projectCount: number;

  @ApiProperty()
  aggregateRating: number;

  @ApiProperty()
  reviewCount: number;

  @ApiProperty()
  headcountEstimate: number;

  @ApiProperty()
  lastFundingAmount: number;

  @ApiProperty()
  lastFundingDate: number;

  @ApiProperty()
  url: string;

  constructor(raw: ShortOrg) {
    const {
      orgId,
      url,
      name,
      logoUrl,
      location,
      jobCount,
      headcountEstimate,
      aggregateRating,
      reviewCount,
      projectCount,
      lastFundingDate,
      lastFundingAmount,
    } = raw;

    const result = ShortOrg.ShortOrgType.decode(raw);

    this.orgId = orgId;
    this.url = url;
    this.name = name;
    this.logoUrl = logoUrl;
    this.location = location;
    this.jobCount = jobCount;
    this.headcountEstimate = headcountEstimate;
    this.aggregateRating = aggregateRating;
    this.reviewCount = reviewCount;
    this.projectCount = projectCount;
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
