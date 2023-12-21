import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Repository {
  public static readonly RepositoryType = t.strict({
    id: t.number,
    name: t.string,
    fullName: t.string,
    description: t.string,
    fork: t.boolean,
    homepage: t.string,
    language: t.string,
    forksCount: t.number,
    stargazersCount: t.number,
    watchersCount: t.number,
    size: t.number,
    defaultBranch: t.string,
    openIssuesCount: t.number,
    archived: t.boolean,
    disabled: t.boolean,
    pushedAt: t.union([t.number, t.null]),
    createdAt: t.union([t.number, t.null]),
    updatedAt: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  fork: boolean;

  @ApiProperty()
  homepage: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  forksCount: number;

  @ApiProperty()
  stargazersCount: number;

  @ApiProperty()
  watchersCount: number;

  @ApiProperty()
  size: number;

  @ApiProperty()
  defaultBranch: string;

  @ApiProperty()
  openIssuesCount: number;

  @ApiProperty()
  archived: boolean;

  @ApiProperty()
  disabled: boolean;

  @ApiPropertyOptional()
  pushedAt: number | null;

  @ApiPropertyOptional()
  createdAt: number | null;

  @ApiPropertyOptional()
  updatedAt: number | null;

  constructor(raw: Repository) {
    const {
      id,
      name,
      fullName,
      description,
      fork,
      homepage,
      language,
      forksCount,
      stargazersCount,
      watchersCount,
      size,
      defaultBranch,
      openIssuesCount,
      archived,
      disabled,
      pushedAt,
      createdAt,
      updatedAt,
    } = raw;

    const result = Repository.RepositoryType.decode(raw);

    this.id = id;
    this.name = name;
    this.fullName = fullName;
    this.description = description;
    this.fork = fork;
    this.homepage = homepage;
    this.language = language;
    this.forksCount = forksCount;
    this.stargazersCount = stargazersCount;
    this.watchersCount = watchersCount;
    this.size = size;
    this.defaultBranch = defaultBranch;
    this.openIssuesCount = openIssuesCount;
    this.archived = archived;
    this.disabled = disabled;
    this.pushedAt = pushedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `repository with name ${name} failed validation with error ${x}`,
        );
      });
    }
  }
}
