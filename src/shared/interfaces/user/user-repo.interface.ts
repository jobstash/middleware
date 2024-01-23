import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserRepo {
  public static readonly UserRepoType = t.strict({
    id: t.string,
    name: t.string,
    description: t.string,
    timestamp: t.union([t.number, t.null]),
    projectName: t.union([t.string, t.null]),
    committers: t.union([t.number, t.null]),
    org: t.strict({
      name: t.string,
      url: t.string,
      logo: t.union([t.string, t.null]),
    }),
    tags: t.array(
      t.strict({
        id: t.string,
        name: t.string,
        normalizedName: t.string,
        canTeach: t.boolean,
      }),
    ),
    contribution: t.strict({
      summary: t.union([t.string, t.null]),
      count: t.number,
    }),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  timestamp: number | null;

  @ApiPropertyOptional()
  projectName: string | null;

  @ApiPropertyOptional()
  committers: number | null;

  @ApiProperty()
  org: {
    name: string;
    url: string;
    logo: string | null;
  };

  @ApiProperty()
  tags: {
    id: string;
    name: string;
    normalizedName: string;
    canTeach: boolean;
  }[];

  @ApiProperty()
  contribution: {
    summary: string;
    count: number;
  };

  constructor(raw: UserRepo) {
    const {
      id,
      name,
      description,
      timestamp,
      projectName,
      committers,
      org,
      tags,
      contribution,
    } = raw;

    const result = UserRepo.UserRepoType.decode(raw);

    this.id = id;
    this.name = name;
    this.description = description;
    this.timestamp = timestamp;
    this.projectName = projectName;
    this.committers = committers;
    this.org = org;
    this.tags = tags;
    this.contribution = contribution;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user repo instance with id ${id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
