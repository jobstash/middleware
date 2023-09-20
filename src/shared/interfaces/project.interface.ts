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
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
// import { isLeft } from "fp-ts/lib/Either";

@ApiExtraModels(Audit, Hack, Chain, ProjectCategory)
export class ProjectProperties {
  public static readonly ProjectPropertiesType = t.strict({
    id: t.string,
    url: t.string,
    name: t.string,
    orgId: t.string,
    tvl: t.union([t.number, t.null]),
    logo: t.union([t.string, t.null]),
    teamSize: t.union([t.number, t.null]),
    category: t.union([t.string, t.null]),
    isMainnet: t.union([t.boolean, t.null]),
    tokenSymbol: t.union([t.string, t.null]),
    monthlyFees: t.union([t.number, t.null]),
    monthlyVolume: t.union([t.number, t.null]),
    monthlyRevenue: t.union([t.number, t.null]),
    monthlyActiveUsers: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  url: string;
  @ApiProperty()
  logo: string | null;
  @ApiPropertyOptional()
  tokenSymbol: string | null;
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
  isMainnet: boolean | null;
  @ApiProperty()
  orgId: string;
  @ApiPropertyOptional()
  teamSize: number | null;
  @ApiProperty()
  category: string | null;

  constructor(raw: ProjectProperties) {
    const {
      id,
      url,
      tvl,
      name,
      logo,
      orgId,
      teamSize,
      category,
      isMainnet,
      tokenSymbol,
      monthlyFees,
      monthlyVolume,
      monthlyRevenue,
      monthlyActiveUsers,
    } = raw;

    const result = ProjectProperties.ProjectPropertiesType.decode(raw);

    this.id = id;
    this.url = url;
    this.tvl = tvl;
    this.name = name;
    this.logo = logo;
    this.orgId = orgId;
    this.teamSize = teamSize;
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
          `project instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
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
    }),
  ]);

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
    const { hacks, audits, chains, ...projectProperties } = raw;
    super(projectProperties);
    const result = Project.ProjectType.decode(raw);

    this.hacks = hacks;
    this.audits = audits;
    this.chains = chains;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
