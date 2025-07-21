import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class SubscriptionMember {
  public static readonly SubscriptionMemberType = t.strict({
    id: t.string,
    wallet: t.string,
    credential: t.string,
    account: t.string,
    name: t.union([t.string, t.null]),
    role: t.string,
    dateJoined: t.number,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  wallet: string;

  @ApiProperty()
  credential: string;

  @ApiProperty()
  account: string;

  @ApiProperty()
  name: string | null;

  @ApiProperty()
  role: string;

  @ApiProperty()
  dateJoined: number;

  constructor(raw: SubscriptionMember) {
    this.id = raw.id;
    this.wallet = raw.wallet;
    this.credential = raw.credential;
    this.account = raw.account;
    this.name = raw.name;
    this.role = raw.role;
    this.dateJoined = raw.dateJoined;

    const result = SubscriptionMember.SubscriptionMemberType.decode(raw);
    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `subscription member instance with wallet ${this.wallet} failed validation with error '${x}'`,
        );
      });
    }
  }
}
