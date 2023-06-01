import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class Technology {
  public static readonly TechnologyType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
  });

  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  normalizedName: string;

  // constructor(raw: Technology) {
  //   const { id, name, normalizedName } = raw;
  //   const result = Technology.TechnologyType.decode(raw);

  //   this.id = id;
  //   this.name = name;
  //   this.normalizedName = normalizedName;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing Technology! Constructor expected: \n {
  //         id: string,
  //         name: string,
  //         normalizedName: string
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
