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
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";

@ApiExtraModels(OrganizationWithRelations, OrganizationWithLinks, OrgJob)
export class OrganizationWithLinks extends Organization {
  public static readonly OrganizationWithLinksType = t.intersection([
    Organization.OrganizationType,
    t.strict({
      jobCount: t.number,
      discord: t.array(t.string),
      website: t.array(t.string),
      rawWebsite: t.array(t.string),
      telegram: t.array(t.string),
      github: t.array(t.string),
      aliases: t.array(t.string),
      grant: t.array(t.string),
      twitter: t.array(t.string),
      docs: t.array(t.string),
      projects: t.array(ProjectWithRelations.ProjectWithRelationsType),
      fundingRounds: t.array(FundingRound.FundingRoundType),
      investors: t.array(Investor.InvestorType),
      community: t.array(t.string),
      detectedJobsite: t.array(t.strict({ url: t.string, type: t.string })),
      jobsite: t.array(t.strict({ url: t.string, type: t.string })),
    }),
  ]);

  @ApiProperty()
  jobCount: number;

  @ApiProperty()
  discord: string[];

  @ApiProperty()
  website: string[];

  @ApiProperty()
  rawWebsite: string[];

  @ApiProperty()
  telegram: string[];

  @ApiProperty()
  github: string[];

  @ApiProperty()
  aliases: string[];

  @ApiProperty()
  grant: string[];

  @ApiProperty()
  twitter: string[];

  @ApiProperty()
  docs: string[];

  @ApiProperty()
  projects: ProjectWithRelations[];

  @ApiProperty()
  fundingRounds: FundingRound[];

  @ApiProperty()
  investors: Investor[];

  @ApiProperty()
  community: string[];

  @ApiProperty()
  detectedJobsite: { url: string; type: string }[];

  @ApiProperty()
  jobsite: { url: string; type: string }[];

  constructor(raw: OrganizationWithLinks) {
    const {
      jobCount,
      discord,
      website,
      rawWebsite,
      telegram,
      github,
      aliases,
      grant,
      twitter,
      docs,
      projects,
      fundingRounds,
      investors,
      community,
      detectedJobsite,
      jobsite,
      ...orgProperties
    } = raw;
    super(orgProperties);
    const result = OrganizationWithLinks.OrganizationWithLinksType.decode(raw);

    this.jobCount = jobCount;
    this.rawWebsite = rawWebsite;
    this.detectedJobsite = detectedJobsite;
    this.discord = discord;
    this.website = website;
    this.telegram = telegram;
    this.github = github;
    this.aliases = aliases;
    this.grant = grant;
    this.twitter = twitter;
    this.docs = docs;
    this.projects = projects;
    this.fundingRounds = fundingRounds;
    this.investors = investors;
    this.community = community;
    this.jobsite = jobsite;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org with links instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
