import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class GithubUser {
  public static readonly GithubUserType = t.strict({
    id: t.string,
    login: t.string,
    avatarUrl: t.string,
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  login: string;

  @ApiProperty()
  avatarUrl: string;

  @ApiPropertyOptional()
  createdTimestamp: number | null;

  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: GithubUser) {
    const { login, avatarUrl, createdTimestamp, updatedTimestamp } = raw;
    const result = GithubUser.GithubUserType.decode(raw);
    this.login = login;
    this.avatarUrl = avatarUrl;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `github user instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
