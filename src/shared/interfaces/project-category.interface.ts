import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class ProjectCategory {
  public static readonly ProjectCategoryType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  // constructor(raw: ProjectCategory) {
  //   const { id, name } = raw;
  //   const result = ProjectCategory.ProjectCategoryType.decode(raw);

  //   this.id = id;
  //   this.name = name;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing ProjectCategory! Constructor expected: \n {
  //         id: string,
  //         name: string,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
