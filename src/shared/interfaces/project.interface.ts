import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class Project {
  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  defillama_id?: string;
  @ApiPropertyOptional()
  defillama_slug?: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  url: string;
  @ApiProperty()
  logo: string;
  @ApiPropertyOptional()
  token_address?: string;
  @ApiPropertyOptional()
  token_symbol?: string;
  @ApiProperty()
  is_in_construction: boolean;
  @ApiPropertyOptional()
  tvl?: number;
  @ApiPropertyOptional()
  monthly_volume?: number;
  @ApiPropertyOptional()
  monthly_active_users?: number;
  @ApiPropertyOptional()
  monthly_revenue?: number;
  @ApiProperty()
  created_timestamp: number;
  @ApiPropertyOptional()
  updated_timestamp?: number;
}
