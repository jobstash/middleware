import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Payment {
  public static readonly PaymentType = t.strict({
    id: t.string,
    type: t.string,
    action: t.string,
    amount: t.number,
    currency: t.string,
    createdTimestamp: t.number,
    internalRefCode: t.string,
    externalRefCode: t.string,
    expiryTimestamp: t.number,
    status: t.union([t.literal("pending"), t.literal("confirmed")]),
  });

  @ApiProperty()
  id: string;
  @ApiProperty()
  type: string;
  @ApiProperty()
  action: string;
  @ApiProperty()
  amount: number;
  @ApiProperty()
  currency: string;
  @ApiProperty()
  createdTimestamp: number;
  @ApiProperty()
  internalRefCode: string;
  @ApiProperty()
  externalRefCode: string;
  @ApiProperty()
  expiryTimestamp: number;
  @ApiProperty()
  status: "pending" | "confirmed";

  constructor(raw: Payment) {
    const {
      id,
      type,
      action,
      amount,
      currency,
      createdTimestamp,
      internalRefCode,
      externalRefCode,
      expiryTimestamp,
      status,
    } = raw;

    this.id = id;
    this.type = type;
    this.action = action;
    this.amount = amount / 100;
    this.currency = currency;
    this.createdTimestamp = createdTimestamp;
    this.internalRefCode = internalRefCode;
    this.externalRefCode = externalRefCode;
    this.expiryTimestamp = expiryTimestamp;
    this.status = status;

    const result = Payment.PaymentType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(e => {
        throw new Error(
          `payment instance with id ${this.id} failed validation with error '${e}'`,
        );
      });
    }
  }
}
