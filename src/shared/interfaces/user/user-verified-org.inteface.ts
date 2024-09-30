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
  account: string; // Email or GH Username affiliated with the org

  constructor(raw: UserVerifiedOrg) {
    const { id, name, slug, url, logo, account } = raw;

    const result = UserVerifiedOrg.UserVerifiedOrgType.decode(raw);

    this.id = id;
    this.name = name;
    this.slug = slug;
    this.url = url;
    this.logo = logo;
    this.account = account;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user verified org instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
