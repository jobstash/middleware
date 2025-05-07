import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class StoredFilter {
  public static readonly StoredFilterType = t.strict({
    id: t.string,
    name: t.string,
    filter: t.string,
    public: t.boolean,
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  filter: string;

  @ApiProperty()
  public: boolean;

  @ApiPropertyOptional()
  createdTimestamp: number | null;

  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: StoredFilter) {
    const {
      id,
      name,
      filter,
      public: isPublic,
      createdTimestamp,
      updatedTimestamp,
    } = raw;
    this.id = id;
    this.name = name;
    this.filter = filter;
    this.public = isPublic;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    const result = StoredFilter.StoredFilterType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `stored filter instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
