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
  @ApiProperty()
  roundName: string;
  @ApiProperty()
  date: number;
  @ApiProperty()
  sourceLink: string;
  @ApiProperty()
  createdTimestamp: number;
}

@ApiExtraModels(Investor)
export class FundingRound extends FundingRoundProperties {
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Investor) },
  })
  investors: Investor[] | null;
}
