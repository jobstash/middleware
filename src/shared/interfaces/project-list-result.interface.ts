import * as t from "io-ts";
import { Hack } from "./hack.interface";
import { Audit } from "./audit.interface";
import { Chain } from "./chain.interface";
import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { Repository } from "./repository.interface";

export class ProjectListResult {
  public static readonly ProjectListResultType = t.strict({
    id: t.string,
    name: t.string,
    orgIds: t.array(t.string),
    normalizedName: t.string,
    website: t.union([t.string, t.null]),
    logo: t.union([t.string, t.null]),
    category: t.union([t.string, t.null]),
    isMainnet: t.union([t.boolean, t.null]),
    tokenSymbol: t.union([t.string, t.null]),
    tvl: t.union([t.number, t.null]),
    monthlyFees: t.union([t.number, t.null]),
    monthlyVolume: t.union([t.number, t.null]),
    monthlyRevenue: t.union([t.number, t.null]),
    monthlyActiveUsers: t.union([t.number, t.null]),
    hacks: t.array(Hack.HackType),
    audits: t.array(Audit.AuditType),
    chains: t.array(Chain.ChainType),
    ecosystems: t.array(t.string),
    jobs: t.array(
      StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    ),
    repos: t.array(Repository.RepositoryType),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  orgIds: string[];

  @ApiProperty()
  normalizedName: string;

  @ApiPropertyOptional()
  website?: string | null;

  @ApiPropertyOptional()
  logo?: string | null;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiPropertyOptional()
  isMainnet?: boolean | null;

  @ApiPropertyOptional()
  tokenSymbol?: string | null;

  @ApiPropertyOptional()
  tvl?: number | null;

  @ApiPropertyOptional()
  monthlyRevenue?: number | null;

  @ApiPropertyOptional()
  monthlyVolume?: number | null;

  @ApiPropertyOptional()
  monthlyFees?: number | null;

  @ApiPropertyOptional()
  monthlyActiveUsers?: number | null;

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
    items: { $ref: getSchemaPath(StructuredJobpostWithRelations) },
  })
  repos: Repository[];

  constructor(raw: ProjectListResult) {
    const {
      id,
      name,
      orgIds,
      website,
      logo,
      category,
      isMainnet,
      tokenSymbol,
      tvl,
      normalizedName,
      monthlyFees,
      monthlyVolume,
      monthlyRevenue,
      monthlyActiveUsers,
      hacks,
      audits,
      chains,
      ecosystems,
      jobs,
      repos,
    } = raw;

    const result = ProjectListResult.ProjectListResultType.decode(raw);

    this.id = id;
    this.tvl = tvl;
    this.name = name;
    this.orgIds = orgIds;
    this.logo = logo;
    this.hacks = hacks;
    this.audits = audits;
    this.jobs = jobs;
    this.repos = repos;
    this.chains = chains;
    this.website = website;
    this.category = category;
    this.isMainnet = isMainnet;
    this.ecosystems = ecosystems;
    this.tokenSymbol = tokenSymbol;
    this.monthlyFees = monthlyFees;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
    this.normalizedName = normalizedName;
    this.monthlyActiveUsers = monthlyActiveUsers;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project list result instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class ProjectCompetitorListResult extends ProjectListResult {
  public static readonly ProjectCompetitorListResultType = t.intersection([
    ProjectListResult.ProjectListResultType,
    t.strict({ description: t.union([t.string, t.null]) }),
  ]);

  @ApiPropertyOptional()
  description: string | null;

  constructor(raw: ProjectCompetitorListResult) {
    super(raw);
    const { description } = raw;

    const result =
      ProjectCompetitorListResult.ProjectCompetitorListResultType.decode(raw);

    this.description = description;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project competitor list result instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
