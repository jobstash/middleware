import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

/**
 * Immutable historical grant funding retained for organization and project
 * financing displays. Grant programs, search, metrics, and ingestion are
 * retired; this is deliberately the only remaining grant API shape.
 */
export class GrantFunding {
  public static readonly GrantFundingType = t.strict({
    id: t.string,
    tokenAmount: t.union([t.number, t.null]),
    tokenUnit: t.union([t.string, t.null]),
    fundingDate: t.union([t.number, t.null]),
    amount: t.union([t.number, t.null]),
    programName: t.union([t.string, t.null]),
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  tokenAmount: number | null;

  @ApiProperty()
  tokenUnit: string | null;

  @ApiProperty()
  fundingDate: number | null;

  @ApiProperty()
  amount: number | null;

  @ApiProperty()
  programName: string | null;

  @ApiProperty()
  createdTimestamp: number | null;

  @ApiProperty()
  updatedTimestamp: number | null;

  constructor(raw: GrantFunding) {
    const result = GrantFunding.GrantFundingType.decode(raw);
    this.id = raw.id;
    this.tokenAmount = raw.tokenAmount;
    this.tokenUnit = raw.tokenUnit;
    this.fundingDate = raw.fundingDate;
    this.amount = raw.amount;
    this.programName = raw.programName;
    this.createdTimestamp = raw.createdTimestamp;
    this.updatedTimestamp = raw.updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(error => {
        throw new Error(
          `grant funding instance with id ${this.id} failed validation with error '${error}'`,
        );
      });
    }
  }
}
