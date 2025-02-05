import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { Audit } from "./audit.interface";
import { Chain } from "./chain.interface";
import { Hack } from "./hack.interface";
import { ProjectCategory } from "./project-category.interface";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(Audit, Hack, Chain, ProjectCategory)
export class Project {
  public static readonly ProjectType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
    tvl: t.union([t.number, t.null]),
    logo: t.union([t.string, t.null]),
    orgIds: t.array(t.string),
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
  normalizedName: string;
  @ApiPropertyOptional()
  logo?: string | null;
  @ApiPropertyOptional()
  tokenSymbol?: string | null;
  @ApiPropertyOptional()
  tvl?: number | null;
  @ApiPropertyOptional()
  monthlyVolume?: number | null;
  @ApiPropertyOptional()
  monthlyFees?: number | null;
  @ApiPropertyOptional()
  monthlyRevenue?: number | null;
  @ApiPropertyOptional()
  monthlyActiveUsers?: number | null;
  @ApiPropertyOptional()
  orgIds: string[];

  constructor(raw: Project) {
    const {
      id,
      tvl,
      name,
      logo,
      orgIds,
      tokenSymbol,
      monthlyFees,
      monthlyVolume,
      monthlyRevenue,
      normalizedName,
      monthlyActiveUsers,
    } = raw;

    const result = Project.ProjectType.decode(raw);

    this.id = id;
    this.tvl = tvl;
    this.name = name;
    this.logo = logo;
    this.orgIds = orgIds;
    this.tokenSymbol = tokenSymbol;
    this.monthlyFees = monthlyFees;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
    this.normalizedName = normalizedName;
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
