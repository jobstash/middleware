import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class UserWorkHistory {
  public static readonly UserWorkHistoryType = t.strict({
    login: t.string,
    name: t.string,
    logoUrl: t.union([t.string, t.null]),
    url: t.union([t.string, t.null]),
    firstContributedAt: t.number,
    lastContributedAt: t.number,
    repositories: t.array(
      t.strict({
        name: t.string,
        url: t.string,
        firstContributedAt: t.number,
        lastContributedAt: t.number,
        commitsCount: t.number,
      }),
    ),
  });

  @ApiProperty()
  login: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logoUrl: string | null;

  @ApiPropertyOptional()
  url: string | null;

  @ApiProperty()
  firstContributedAt: number;

  @ApiProperty()
  lastContributedAt: number;

  @ApiProperty()
  repositories: {
    name: string;
    url: string;
    firstContributedAt: number;
    lastContributedAt: number;
    commitsCount: number;
  }[];

  constructor(raw: UserWorkHistory) {
    const {
      login,
      name,
      logoUrl,
      url,
      firstContributedAt,
      lastContributedAt,
      repositories,
    } = raw;

    this.login = login;
    this.name = name;
    this.logoUrl = logoUrl;
    this.url = url;
    this.firstContributedAt = firstContributedAt;
    this.lastContributedAt = lastContributedAt;
    this.repositories = repositories;

    const result = UserWorkHistory.UserWorkHistoryType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user work history instance for user ${this.login} failed validation with error '${x}'`,
        );
      });
    }
  }
}
