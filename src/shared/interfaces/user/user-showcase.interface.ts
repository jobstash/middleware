import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserShowCase {
  public static readonly UserShowCaseType = t.strict({
    label: t.string,
    url: t.string,
  });

  label: string;
  url: string;

  constructor(raw: UserShowCase) {
    const { label, url } = raw;

    const result = UserShowCase.UserShowCaseType.decode(raw);

    this.label = label;
    this.url = url;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user showcase instance with username ${this.label} failed validation with error '${x}'`,
        );
      });
    }
  }
}
