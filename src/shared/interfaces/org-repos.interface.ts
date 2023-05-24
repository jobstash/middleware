import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class Repository {
  public static readonly RepositoryType = t.strict({
    id: t.number,
    url: t.string,
    name: t.string,
    fork: t.boolean,
    htmlUrl: t.string,
    fullName: t.string,
    pushedAt: t.string,
    language: t.string,
    createdAt: t.string,
    updatedAt: t.string,
    dailyHistogram: t.string,
    weeklyHistogram: t.string,
    nodeId: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: number;

  @ApiPropertyOptional()
  nodeId: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  htmlUrl: string;

  @ApiProperty()
  fork: boolean;

  @ApiProperty()
  url: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty()
  pushedAt: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  weeklyHistogram: string;

  @ApiProperty()
  dailyHistogram: string;

  // constructor(raw: Repository) {
  //   const {
  //     id,
  //     url,
  //     name,
  //     fork,
  //     nodeId,
  //     htmlUrl,
  //     fullName,
  //     pushedAt,
  //     language,
  //     createdAt,
  //     updatedAt,
  //     dailyHistogram,
  //     weeklyHistogram,
  //   } = raw;

  //   const result = Repository.RepositoryType.decode(raw);

  //   this.id = id;
  //   this.url = url;
  //   this.name = name;
  //   this.fork = fork;
  //   this.nodeId = nodeId;
  //   this.htmlUrl = htmlUrl;
  //   this.fullName = fullName;
  //   this.pushedAt = pushedAt;
  //   this.language = language;
  //   this.createdAt = createdAt;
  //   this.updatedAt = updatedAt;
  //   this.dailyHistogram = dailyHistogram;
  //   this.weeklyHistogram = weeklyHistogram;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing Repository! Constructor expected: \n {
  //         id: number,
  //         url: string,
  //         name: string,
  //         fork: boolean,
  //         htmlUrl: string,
  //         fullName: string,
  //         pushedAt: string,
  //         language: string,
  //         createdAt: string,
  //         updatedAt: string,
  //         nodeId: string | null,
  //         dailyHistogram: string,
  //         weeklyHistogram: string,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
