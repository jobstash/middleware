import { ApiProperty } from "@nestjs/swagger";

export class FundingRound {
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
