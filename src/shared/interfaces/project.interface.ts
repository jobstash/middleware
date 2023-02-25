import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Audit } from "./audit.interface";
import { Chain } from "./chain.interface";
import { Hack } from "./hack.interface";

export class Project {
  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  defillamaId?: string;
  @ApiPropertyOptional()
  defillamaSlug?: string;
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
  @ApiProperty()
  isInConstruction: boolean;
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

  @ApiPropertyOptional()
  hacks?: Hack[];

  @ApiPropertyOptional()
  audits?: Audit[];

  @ApiPropertyOptional()
  chains?: Chain[];
}
