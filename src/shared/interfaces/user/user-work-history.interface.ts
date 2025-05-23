import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class UserWorkHistory {
  public static readonly UserWorkHistoryType = t.strict({
    login: t.string,
    name: t.union([t.string, t.null]),
    logoUrl: t.union([t.string, t.null]),
    description: t.union([t.string, t.null]),
    url: t.union([t.string, t.null]),
    firstContributedAt: t.number,
    lastContributedAt: t.number,
    commitsCount: t.union([t.number, t.null]),
    tenure: t.number,
    cryptoNative: t.boolean,
    repositories: t.array(
      t.strict({
        name: t.string,
        url: t.string,
        cryptoNative: t.boolean,
        firstContributedAt: t.number,
        lastContributedAt: t.number,
        description: t.union([t.string, t.null]),
        commitsCount: t.union([t.number, t.null]),
        skills: t.array(t.string),
        tenure: t.number,
        stars: t.number,
        createdAt: t.number,
        updatedAt: t.union([t.number, t.null]),
      }),
    ),
    createdAt: t.number,
    updatedAt: t.union([t.number, t.null]),
  });

  @ApiProperty()
  login: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logoUrl: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  url: string | null;

  @ApiProperty()
  firstContributedAt: number;

  @ApiProperty()
  lastContributedAt: number;

  @ApiProperty()
  commitsCount: number;

  @ApiProperty()
  tenure: number;

  @ApiProperty()
  cryptoNative: boolean;

  @ApiProperty()
  repositories: {
    name: string;
    url: string;
    description: string | null;
    commitsCount: number;
    firstContributedAt: number;
    lastContributedAt: number;
    skills: string[];
    tenure: number;
    stars: number;
    cryptoNative: boolean;
    createdAt: number;
    updatedAt: number | null;
  }[];

  @ApiProperty()
  createdAt: number;

  @ApiProperty()
  updatedAt: number | null;

  constructor(raw: UserWorkHistory) {
    const {
      login,
      name,
      description,
      logoUrl,
      url,
      firstContributedAt,
      lastContributedAt,
      commitsCount,
      tenure,
      cryptoNative,
      repositories,
      createdAt,
      updatedAt,
    } = raw;

    this.login = login;
    this.name = name;
    this.description = description;
    this.logoUrl = logoUrl;
    this.url = url;
    this.firstContributedAt = firstContributedAt;
    this.lastContributedAt = lastContributedAt;
    this.repositories = repositories;
    this.commitsCount = commitsCount;
    this.tenure = tenure;
    this.cryptoNative = cryptoNative;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

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
