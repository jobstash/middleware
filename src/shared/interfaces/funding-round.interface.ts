import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Investor } from "./investor.interface";

export class OldFundingRound {
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

export class FundingRound extends OldFundingRound {
  @ApiPropertyOptional()
  investors: Investor[] | null;
}
