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

@ApiExtraModels(Audit, Hack, Chain)
export class OldProject {
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
  createdTimestamp: number;
  @ApiPropertyOptional()
  updatedTimestamp?: number;

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

export class Project extends OldProject {
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(ProjectCategory) },
  })
  categories?: ProjectCategory[] | null;
}
