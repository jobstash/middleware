import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class FundingRound {
  public static readonly FundingRoundType = t.strict({
    id: t.string,
    date: t.number,
    createdTimestamp: t.number,
    roundName: t.union([t.string, t.null]),
    sourceLink: t.union([t.string, t.null]),
    raisedAmount: t.union([t.number, t.null]),
  });
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

  // constructor(raw: FundingRoundProperties) {
  //   const { id, raisedAmount, roundName, date, sourceLink, createdTimestamp } =
  //     raw;

  //   const result =
  //     FundingRoundProperties.FundingRoundPropertiesType.decode(raw);

  //   this.id = id;
  //   this.date = date;
  //   this.roundName = roundName;
  //   this.sourceLink = sourceLink;
  //   this.raisedAmount = raisedAmount;
  //   this.createdTimestamp = createdTimestamp;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing FundingRoundProperties! Constructor expected: \n {
  //         id: string,
  //         date: number,
  //         createdTimestamp: number,
  //         roundName: string | null,
  //         sourceLink: string | null,
  //         raisedAmount: number | null,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}

// @ApiExtraModels(Investor)
// export class FundingRound extends FundingRoundProperties {
//   public static readonly FundingRoundType = t.intersection([
//     FundingRoundProperties.FundingRoundPropertiesType,
//     t.strict({ investors: t.array(Investor.InvestorType) }),
//   ]);

// constructor(raw: FundingRound) {
//   const { investors, ...fundingRoundProps } = raw;

//   const result = FundingRound.FundingRoundType.decode(raw);

//   super(fundingRoundProps);

//   this.investors = investors;

//   if (isLeft(result)) {
//     throw new Error(
//       `Error Serializing FundingRound! Constructor expected: \n {
//         ...FundingRoundProperties,
//         investors: Investor[],
//       } got ${inferObjectType(raw)}`,
//     );
//   }
// }
// }
