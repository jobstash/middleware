import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
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

@ApiExtraModels(OrganizationWithRelations, OrgDetailsResult, OrgJob)
export class OrgDetailsResult extends OmitType(OrganizationWithRelations, [
  "reviews",
] as const) {
  public static readonly OrgListResultType = t.intersection([
    t.intersection([
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
      }),
    ]),
    t.strict({
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
    items: { $ref: getSchemaPath(LeanOrgReview) },
  })
  reviews: LeanOrgReview[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(OrgJob) },
  })
  jobs: OrgJob[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Tag) },
  })
  tags: Tag[];

  constructor(raw: OrgDetailsResult) {
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
    this.alias = alias;
    this.twitter = twitter;
    this.docs = docs;
    this.projects = projects;
    this.fundingRounds = fundingRounds;
    this.investors = investors;
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
}
