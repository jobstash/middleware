import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Audit } from "./audit.interface";
import { Chain } from "./chain.interface";
import { Hack } from "./hack.interface";
import { ProjectCategory } from "./project-category.interface";

@ApiExtraModels(Audit, Hack, Chain, ProjectCategory)
export class ProjectProperties {
  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  defiLlamaId?: string;
  @ApiPropertyOptional()
  defiLlamaSlug?: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  url: string;
  @ApiProperty()
  logo: string;
  @ApiPropertyOptional()
  tokenAddress?: string;
  @ApiPropertyOptional()
  tokenSymbol?: string;
  @ApiPropertyOptional()
  isInConstruction?: boolean;
  @ApiPropertyOptional()
  tvl?: number;
  @ApiPropertyOptional()
  monthlyVolume?: number;
  @ApiPropertyOptional()
  monthlyFees?: number;
  @ApiPropertyOptional()
  monthlyRevenue?: number;
  @ApiProperty()
  isMainnet: boolean;
  @ApiProperty()
  telegram: string;
  @ApiProperty()
  orgId: string;
  @ApiProperty()
  cmcId?: string;
  @ApiProperty()
  twitter: string;
  @ApiProperty()
  discord: string;
  @ApiProperty()
  docs: string;
  @ApiPropertyOptional()
  teamSize: null | number;
  @ApiProperty()
  githubOrganization: string;
  @ApiProperty()
  category: string;
  @ApiProperty()
  createdTimestamp: number;
  @ApiPropertyOptional()
  updatedTimestamp?: number;
}

export class Project extends ProjectProperties {
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(ProjectCategory) },
  })
  categories?: ProjectCategory[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Hack) },
  })
  hacks?: Hack[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Audit) },
  })
  audits?: Audit[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Chain) },
  })
  chains?: Chain[];
}
