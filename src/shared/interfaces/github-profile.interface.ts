import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class GithubProfile {
  public static readonly GithubProfileType = t.strict({
    githubId: t.number,
    githubLogin: t.string,
    githubNodeId: t.string,
    githubAvatarUrl: t.string,
    githubGravatarId: t.union([t.string, t.null]),
  });

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  githubLogin: string;

  @IsNumber()
  @ApiProperty()
  githubId: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  githubNodeId: string;

  @IsString()
  @ApiPropertyOptional()
  githubGravatarId: string | null;

  @IsString()
  @ApiProperty()
  githubAvatarUrl: string;

  // constructor(raw: GithubProfile) {
  //   const {
  //     githubId,
  //     githubLogin,
  //     githubNodeId,
  //     githubAvatarUrl,
  //     githubGravatarId,
  //   } = raw;

  //   const result = GithubProfile.GithubProfileType.decode(raw);

  //   this.githubId = githubId;
  //   this.githubLogin = githubLogin;
  //   this.githubNodeId = githubNodeId;
  //   this.githubAvatarUrl = githubAvatarUrl;
  //   this.githubGravatarId = githubGravatarId;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing GithubProfile! Constructor expected: \n {
  //         githubId: number,
  //         githubLogin: string,
  //         githubNodeId: string,
  //         githubAvatarUrl: string,
  //         githubGravatarId: string | null,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
