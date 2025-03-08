import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class UserVerifiedOrg {
  public static readonly UserVerifiedOrgType = t.strict({
    id: t.string,
    name: t.string,
    slug: t.string,
    url: t.string,
    logo: t.union([t.string, t.null]),
    account: t.union([t.string, t.null]),
    credential: t.union([
      t.literal("email"),
      t.literal("github"),
      t.literal("ecosystemActivation"),
      t.literal("membership"),
    ]),
    hasOwner: t.boolean,
    isOwner: t.boolean,
    isMember: t.boolean,
  });

  @ApiProperty()
  id: string; // OrgId used for lookup

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  url: string;

  @ApiPropertyOptional()
  logo: string | null;

  @ApiProperty()
  account: string;

  @ApiProperty()
  credential: "email" | "github" | "ecosystemActivation" | "membership";

  @ApiProperty()
  hasOwner: boolean;

  @ApiProperty()
  isOwner: boolean;

  @ApiProperty()
  isMember: boolean;

  constructor(raw: UserVerifiedOrg) {
    const {
      id,
      name,
      slug,
      url,
      logo,
      account,
      credential,
      hasOwner,
      isOwner,
      isMember,
    } = raw;

    const result = UserVerifiedOrg.UserVerifiedOrgType.decode(raw);

    this.id = id;
    this.name = name;
    this.slug = slug;
    this.url = url;
    this.logo = logo;
    this.account = account;
    this.credential = credential;
    this.hasOwner = hasOwner;
    this.isOwner = isOwner;
    this.isMember = isMember;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user verified org instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
