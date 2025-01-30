import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  Organization,
  OrganizationWithRelations,
} from "./organization.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { Tag } from "./tag.interface";
import { report } from "io-ts-human-reporter";
import { OrgJob } from "./org-job.interface";
import { OrgRating } from "./org-ratings.interface";
import { ProjectWithRelations } from "./project-with-relations.interface";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { LeanOrgReview } from "./org-review.interface";
import { OrgProject } from "./project-details-result.interface";
import { sort } from "fast-sort";
import { GrantFunding } from "./grant.interface";

@ApiExtraModels(OrganizationWithRelations, OrgDetailsResult, OrgJob)
export class OrgDetailsResult extends Organization {
  public static readonly OrgListResultType = t.intersection([
    Organization.OrganizationType,
    t.strict({
      aggregateRating: t.number,
      aggregateRatings: OrgRating.OrgRatingType,
      reviewCount: t.number,
      discord: t.union([t.string, t.null]),
      website: t.union([t.string, t.null]),
      telegram: t.union([t.string, t.null]),
      github: t.union([t.string, t.null]),
      aliases: t.array(t.string),
      twitter: t.union([t.string, t.null]),
      docs: t.union([t.string, t.null]),
      projects: t.array(OrgProject.OrgProjectType),
      fundingRounds: t.array(FundingRound.FundingRoundType),
      investors: t.array(Investor.InvestorType),
      community: t.array(t.string),
      ecosystems: t.array(t.string),
      grants: t.array(GrantFunding.GrantFundingType),
      jobs: t.array(OrgJob.OrgJobType),
      tags: t.array(Tag.TagType),
      reviews: t.array(LeanOrgReview.LeanOrgReviewType),
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
  aliases: string[];

  @ApiPropertyOptional()
  twitter: string | null;

  @ApiPropertyOptional()
  docs: string | null;

  @ApiProperty()
  community: string[];

  @ApiProperty()
  ecosystems: string[];

  @ApiProperty()
  grants: GrantFunding[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(ProjectWithRelations) },
  })
  projects: OrgProject[];

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

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(LeanOrgReview) },
  })
  reviews: LeanOrgReview[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(OrgJob) },
  })
  jobs: OrgJob[];

  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Tag) },
  })
  tags: Tag[];

  constructor(
    raw: Omit<OrgDetailsResult, "lastFundingAmount" | "lastFundingDate">,
  ) {
    const {
      aggregateRating,
      aggregateRatings,
      reviewCount,
      discord,
      website,
      telegram,
      github,
      grants,
      twitter,
      docs,
      aliases,
      projects,
      fundingRounds,
      investors,
      ecosystems,
      community,
      reviews,
      jobs,
      tags,
      ...orgProperties
    } = raw;
    super(orgProperties);
    const result = OrgDetailsResult.OrgListResultType.decode(raw);

    this.aggregateRating = aggregateRating;
    this.aggregateRatings = aggregateRatings;
    this.reviewCount = reviewCount;
    this.discord = discord;
    this.website = website;
    this.telegram = telegram;
    this.github = github;
    this.grants = grants;
    this.aliases = aliases;
    this.twitter = twitter;
    this.docs = docs;
    this.projects = projects;
    this.fundingRounds = fundingRounds;
    this.investors = investors;
    this.community = community;
    this.ecosystems = ecosystems;
    this.reviews = reviews;
    this.jobs = jobs;
    this.tags = tags;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org list result instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }

  lastFundingDate(): number | null {
    const lastFundingRound = sort(this.fundingRounds).desc(x => x.date)[0];
    return lastFundingRound?.date ?? null;
  }

  lastFundingAmount(): number | null {
    const lastFundingRound = sort(this.fundingRounds).desc(x => x.date)[0];
    return lastFundingRound?.raisedAmount ?? null;
  }
}
