import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
import { IsNotEmpty, IsString, IsEthereumAddress } from "class-validator";
// import { isLeft } from "fp-ts/lib/Either";

export class PreferredTechnologyTerm {
  public static readonly PreferredTechnologyTermType = t.strict({
    creatorWallet: t.string,
    preferredName: t.string,
    technologyName: t.string,
  });

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  technologyName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  preferredName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;

  // constructor(raw: PreferredTechnologyTerm) {
  //   const { technologyName, preferredName, creatorWallet } = raw;
  //   const result =
  //     PreferredTechnologyTerm.PreferredTechnologyTermType.decode(raw);

  //   this.creatorWallet = creatorWallet;
  //   this.preferredName = preferredName;
  //   this.technologyName = technologyName;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing PreferredTechnologyTerm! Constructor expected: \n {
  //         creatorWallet: string
  //         preferredName: string,
  //         technologyName: string,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
