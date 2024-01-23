import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class GithubUser {
  public static readonly GithubUserType = t.strict({
    id: t.string,
    login: t.string,
    nodeId: t.string,
    gravatarId: t.union([t.string, t.null]),
    avatarUrl: t.string,
    accessToken: t.string,
    refreshToken: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  login: string;

  @ApiProperty()
  nodeId: string;

  @ApiPropertyOptional()
  gravatarId?: string | null;

  @ApiProperty()
  avatarUrl: string;

  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  constructor(raw: GithubUser) {
    const {
      id,
      login,
      nodeId,
      gravatarId,
      avatarUrl,
      accessToken,
      refreshToken,
    } = raw;
    const result = GithubUser.GithubUserType.decode(raw);
    this.id = id;
    this.login = login;
    this.nodeId = nodeId;
    this.gravatarId = gravatarId;
    this.avatarUrl = avatarUrl;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `github user instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
