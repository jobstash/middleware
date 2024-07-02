import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserRepo {
  public static readonly UserRepoType = t.strict({
    id: t.string,
    name: t.string,
    description: t.union([t.string, t.null]),
    timestamp: t.union([t.number, t.null]),
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
    contribution: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  timestamp: number | null;

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

  @ApiPropertyOptional()
  contribution: string | null;

  constructor(raw: UserRepo) {
    const { id, name, description, timestamp, org, tags, contribution } = raw;

    const result = UserRepo.UserRepoType.decode(raw);

    this.id = id;
    this.name = name;
    this.description = description;
    this.timestamp = timestamp;
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
