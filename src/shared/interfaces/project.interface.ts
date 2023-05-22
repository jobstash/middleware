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
  createdTimestamp: number;
  @ApiPropertyOptional()
  updatedTimestamp: number | null;
}

export class Project extends ProjectProperties {
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
}
