import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";
import { IsNotEmpty, IsString } from "class-validator";

export class PreferredTerm {
  public static readonly PreferredTermType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
  });

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  normalizedName: string;

  // constructor(raw: PreferredTerm) {
  //   const { id, name, normalizedName } = raw;
  //   const result = PreferredTerm.PreferredTermType.decode(raw);

  //   this.id = id;
  //   this.name = name;
  //   this.normalizedName = normalizedName;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing PreferredTerm! Constructor expected: \n {
  //         id: string,
  //         name: string,
  //         normalizedName: string,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
