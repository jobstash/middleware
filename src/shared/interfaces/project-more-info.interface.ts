import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { Project } from "./project.interface";

export class ProjectMoreInfo extends Project {
  public static readonly ProjectMoreInfoType = t.intersection([
    Project.ProjectType,
    t.strict({
      description: t.string,
      docs: t.union([t.string, t.null]),
      cmcId: t.union([t.string, t.null]),
      twitter: t.union([t.string, t.null]),
      discord: t.union([t.string, t.null]),
      telegram: t.union([t.string, t.null]),
      defiLlamaId: t.union([t.string, t.null]),
      tokenAddress: t.union([t.string, t.null]),
      defiLlamaSlug: t.union([t.string, t.null]),
      defiLlamaParent: t.union([t.string, t.null]),
      createdTimestamp: t.union([t.number, t.null]),
      updatedTimestamp: t.union([t.number, t.null]),
      isInConstruction: t.union([t.boolean, t.null]),
      githubOrganization: t.union([t.string, t.null]),
    }),
  ]);

  @ApiPropertyOptional()
  description: string;
  @ApiPropertyOptional()
  defiLlamaId: string | null;
  @ApiPropertyOptional()
  defiLlamaSlug: string | null;
  @ApiPropertyOptional()
  defiLlamaParent: string | null;
  @ApiPropertyOptional()
  tokenAddress: string | null;
  @ApiPropertyOptional()
  isInConstruction: boolean | null;
  @ApiPropertyOptional()
  cmcId: string | null;
  @ApiProperty()
  twitter: string | null;
  @ApiProperty()
  telegram: string | null;
  @ApiProperty()
  discord: string | null;
  @ApiProperty()
  docs: string | null;
  @ApiProperty()
  githubOrganization: string | null;
  @ApiProperty()
  createdTimestamp: number | null;
  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: ProjectMoreInfo) {
    super(raw);
    const {
      docs,
      cmcId,
      twitter,
      discord,
      telegram,
      defiLlamaId,
      description,
      tokenAddress,
      defiLlamaSlug,
      defiLlamaParent,
      isInConstruction,
      createdTimestamp,
      updatedTimestamp,
      githubOrganization,
    } = raw;

    const result = ProjectMoreInfo.ProjectMoreInfoType.decode(raw);

    this.docs = docs;
    this.cmcId = cmcId;
    this.twitter = twitter;
    this.discord = discord;
    this.telegram = telegram;
    this.defiLlamaId = defiLlamaId;
    this.description = description;
    this.tokenAddress = tokenAddress;
    this.defiLlamaSlug = defiLlamaSlug;
    this.defiLlamaParent = defiLlamaParent;
    this.isInConstruction = isInConstruction;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;
    this.githubOrganization = githubOrganization;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
