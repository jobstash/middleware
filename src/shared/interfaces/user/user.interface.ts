import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class User {
  @ApiPropertyOptional()
  wallet?: string;
  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  available?: boolean;
}

// import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
// import { GithubProfile } from "../github-profile.interface";
// import * as t from "io-ts";
// import { inferObjectType } from "../../helpers";
// import { isLeft } from "fp-ts/lib/Either";

// export class User extends GithubProfile {
//   public static readonly UserType = t.intersection([
//     GithubProfile.GithubProfileType,
//     t.strict({
//       wallet: t.union([t.string, t.null]),
//       id: t.string,
//       available: t.union([t.boolean, t.null]),
//     }),
//   ]);

//   @ApiPropertyOptional()
//   wallet: string | null;
//   @ApiProperty()
//   id: string;
//   @ApiPropertyOptional()
//   available: boolean | null;

//   constructor(raw: User) {
//     super(raw);
//     const { wallet, id, available } = raw;
//     const result = User.UserType.decode(raw);

//     this.wallet = wallet;
//     this.id = id;
//     this.available = available;

//     if (isLeft(result)) {
//       throw new Error(
//         `Error Serializing User! Constructor expected: \n {
//           ...GithubProfile?,
//           wallet: string | null,
//           id: string,
//           available: boolean | null
//         } got ${inferObjectType(raw)}`,
//       );
//     }
//   }
// }
