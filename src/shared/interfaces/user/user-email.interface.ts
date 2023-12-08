import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserEmail {
  public static readonly UserEmailType = t.strict({
    email: t.string,
    verified: t.boolean,
  });

  email: string;
  verified: boolean;

  constructor(raw: UserEmail) {
    const { email, verified } = raw;

    const result = UserEmail.UserEmailType.decode(raw);

    this.email = email;
    this.verified = verified;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user email instance with email ${this.email} failed validation with error '${x}'`,
        );
      });
    }
  }
}
