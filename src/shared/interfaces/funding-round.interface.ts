import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Investor } from "./investor.interface";

export class FundingRoundProperties {
  @ApiProperty()
  id: string;
  @ApiProperty()
  raisedAmount: number;
  @ApiPropertyOptional()
  roundName: string | null;
  @ApiProperty()
  date: number;
  @ApiPropertyOptional()
  sourceLink: string | null;
  @ApiProperty()
  createdTimestamp: number;
}

@ApiExtraModels(Investor)
export class FundingRound extends FundingRoundProperties {
  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(Investor) },
  })
  investors: Investor[];
}
