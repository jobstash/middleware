import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
import { Audit } from "./audit.interface";
import { Chain } from "./chain.interface";
import { Hack } from "./hack.interface";
import { ProjectCategory } from "./project-category.interface";
import { inferObjectType } from "../helpers";
import { isLeft } from "fp-ts/lib/Either";
// import { isLeft } from "fp-ts/lib/Either";

@ApiExtraModels(Audit, Hack, Chain, ProjectCategory)
export class ProjectProperties {
  public static readonly ProjectPropertiesType = t.strict({
    id: t.string,
    url: t.string,
    name: t.string,
    orgId: t.string,
    isMainnet: t.boolean,
    description: t.string,
    tvl: t.union([t.number, t.null]),
    docs: t.union([t.string, t.null]),
    logo: t.union([t.string, t.null]),
    cmcId: t.union([t.string, t.null]),
    twitter: t.union([t.string, t.null]),
    discord: t.union([t.string, t.null]),
    telegram: t.union([t.string, t.null]),
    teamSize: t.union([t.number, t.null]),
    category: t.union([t.string, t.null]),
    defiLlamaId: t.union([t.string, t.null]),
    tokenSymbol: t.union([t.string, t.null]),
    monthlyFees: t.union([t.number, t.null]),
    tokenAddress: t.union([t.string, t.null]),
    defiLlamaSlug: t.union([t.string, t.null]),
    monthlyVolume: t.union([t.number, t.null]),
    monthlyRevenue: t.union([t.number, t.null]),
    defiLlamaParent: t.union([t.string, t.null]),
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
    isInConstruction: t.union([t.boolean, t.null]),
    monthlyActiveUsers: t.union([t.number, t.null]),
    githubOrganization: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  defiLlamaId: string | null;
  @ApiPropertyOptional()
  defiLlamaSlug: string | null;
  @ApiPropertyOptional()
  defiLlamaParent: string | null;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  url: string;
  @ApiProperty()
  logo: string;
  @ApiPropertyOptional()
  tokenAddress: string | null;
  @ApiPropertyOptional()
  tokenSymbol: string | null;
  @ApiPropertyOptional()
  isInConstruction: boolean | null;
  @ApiPropertyOptional()
  tvl: number | null;
  @ApiPropertyOptional()
  monthlyVolume: number | null;
  @ApiPropertyOptional()
  monthlyFees: number | null;
  @ApiPropertyOptional()
  monthlyRevenue: number | null;
  @ApiPropertyOptional()
  monthlyActiveUsers: number | null;
  @ApiProperty()
  isMainnet: boolean;
  @ApiProperty()
  telegram: string | null;
  @ApiProperty()
  orgId: string;
  @ApiProperty()
  cmcId: string;
  @ApiProperty()
  twitter: string | null;
  @ApiProperty()
  discord: string | null;
  @ApiProperty()
  docs: string | null;
  @ApiPropertyOptional()
  teamSize: number | null;
  @ApiProperty()
  githubOrganization: string | null;
  @ApiProperty()
  category: string;
  @ApiProperty()
  createdTimestamp: number | null;
  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: ProjectProperties) {
    const {
      id,
      url,
      tvl,
      name,
      logo,
      docs,
      orgId,
      cmcId,
      twitter,
      discord,
      telegram,
      teamSize,
      category,
      isMainnet,
      defiLlamaId,
      description,
      tokenSymbol,
      monthlyFees,
      tokenAddress,
      defiLlamaSlug,
      monthlyVolume,
      monthlyRevenue,
      defiLlamaParent,
      isInConstruction,
      createdTimestamp,
      updatedTimestamp,
      monthlyActiveUsers,
      githubOrganization,
    } = raw;

    const result = ProjectProperties.ProjectPropertiesType.decode(raw);

    this.id = id;
    this.url = url;
    this.tvl = tvl;
    this.name = name;
    this.logo = logo;
    this.docs = docs;
    this.orgId = orgId;
    this.cmcId = cmcId;
    this.twitter = twitter;
    this.discord = discord;
    this.telegram = telegram;
    this.teamSize = teamSize;
    this.category = category;
    this.isMainnet = isMainnet;
    this.defiLlamaId = defiLlamaId;
    this.description = description;
    this.tokenSymbol = tokenSymbol;
    this.monthlyFees = monthlyFees;
    this.tokenAddress = tokenAddress;
    this.defiLlamaSlug = defiLlamaSlug;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
    this.defiLlamaParent = defiLlamaParent;
    this.isInConstruction = isInConstruction;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;
    this.monthlyActiveUsers = monthlyActiveUsers;
    this.githubOrganization = githubOrganization;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing ProjectProperties! Constructor expected: \n {
          id: string,
          url: string,
          name: string,
          logo: string,
          orgId: string,
          category: string,
          tvl: number | null,
          isMainnet: boolean,
          description: string,
          docs: string | null,
          cmcId: string | null,
          twitter: string | null,
          discord: string | null,
          telegram: string | null,
          teamSize: number | null,
          createdTimestamp: number,
          defiLlamaId: string | null,
          tokenSymbol: string | null,
          monthlyFees: number | null,
          tokenAddress: string | null,
          defiLlamaSlug: string | null,
          monthlyVolume: number | null,
          monthlyRevenue: number | null,
          defiLlamaParent: string | null,
          updatedTimestamp: number | null,
          isInConstruction: boolean | null,
          monthlyActiveUsers: number | null,
          githubOrganization: string | null,
        }
        got ${inferObjectType(raw)}`,
      );
    }
  }
}

export class Project extends ProjectProperties {
  public static readonly ProjectType = t.intersection([
    ProjectProperties.ProjectPropertiesType,
    t.strict({
      hacks: t.array(Hack.HackType),
      audits: t.array(Audit.AuditType),
      chains: t.array(Chain.ChainType),
      categories: t.array(ProjectCategory.ProjectCategoryType),
    }),
  ]);

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(ProjectCategory) },
  })
  categories: ProjectCategory[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Hack) },
  })
  hacks: Hack[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Audit) },
  })
  audits: Audit[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Chain) },
  })
  chains: Chain[];

  constructor(raw: Project) {
    const { categories, hacks, audits, chains, ...projectProperties } = raw;
    super(projectProperties);
    const result = Project.ProjectType.decode(raw);

    this.hacks = hacks;
    this.audits = audits;
    this.chains = chains;
    this.categories = categories;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing Project! Constructor expected: \n {
          ...ProjectProperties,
          hacks: Hack[],
          audits: Audit[],
          chains: Chain[],
          categories: ProjectCategory[],
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}
