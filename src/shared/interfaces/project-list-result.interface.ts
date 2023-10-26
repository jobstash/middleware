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

export class ProjectListResult {
  public static readonly ProjectListResultType = t.strict({
    id: t.string,
    name: t.string,
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
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  website: string | null;

  @ApiPropertyOptional()
  logo: string | null;

  @ApiPropertyOptional()
  category: string | null;

  @ApiPropertyOptional()
  isMainnet: boolean | null;

  @ApiPropertyOptional()
  tokenSymbol: string | null;

  @ApiPropertyOptional()
  tvl: number | null;

  @ApiPropertyOptional()
  monthlyRevenue: number | null;

  @ApiPropertyOptional()
  monthlyVolume: number | null;

  @ApiPropertyOptional()
  monthlyFees: number | null;

  @ApiPropertyOptional()
  monthlyActiveUsers: number | null;

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

  constructor(raw: ProjectListResult) {
    const {
      id,
      name,
      website,
      logo,
      category,
      isMainnet,
      tokenSymbol,
      tvl,
      monthlyFees,
      monthlyVolume,
      monthlyRevenue,
      monthlyActiveUsers,
      hacks,
      audits,
      chains,
    } = raw;

    const result = ProjectListResult.ProjectListResultType.decode(raw);

    this.id = id;
    this.tvl = tvl;
    this.name = name;
    this.logo = logo;
    this.hacks = hacks;
    this.audits = audits;
    this.chains = chains;
    this.website = website;
    this.category = category;
    this.isMainnet = isMainnet;
    this.tokenSymbol = tokenSymbol;
    this.monthlyFees = monthlyFees;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
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
    t.strict({ description: t.string }),
  ]);

  @ApiProperty()
  description: string;

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
