import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class GithubOrganization {
  public static readonly GithubOrganizationType = t.strict({
    id: t.string,
    login: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  login: string;

  constructor(raw: GithubOrganization) {
    const { id, login } = raw;
    const result = GithubOrganization.GithubOrganizationType.decode(raw);
    this.id = id;
    this.login = login;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `github organization instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
