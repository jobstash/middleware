import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserShowCase {
  public static readonly UserShowCaseType = t.strict({
    id: t.string,
    label: t.string,
    url: t.string,
  });

  id: string;
  label: string;
  url: string;

  constructor(raw: UserShowCase) {
    const { label, url, id } = raw;

    const result = UserShowCase.UserShowCaseType.decode(raw);

    this.label = label;
    this.url = url;
    this.id = id;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user showcase instance with username ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
