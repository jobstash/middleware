import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { ShortOrgWithSummary } from "../organization.interface";

export class OrganizationEcosystem {
  public static readonly OrganizationEcosystemType = t.strict({
    id: t.string,
    name: t.string,
    normalizedName: t.string,
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  normalizedName: string;

  @ApiPropertyOptional()
  createdTimestamp: number | null;

  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: OrganizationEcosystem) {
    const { id, name, normalizedName, createdTimestamp, updatedTimestamp } =
      raw;
    const result = OrganizationEcosystem.OrganizationEcosystemType.decode(raw);

    this.id = id;
    this.name = name;
    this.normalizedName = normalizedName;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `organization ecosystem instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class OrganizationEcosystemWithOrgs extends OrganizationEcosystem {
  public static readonly OrganizationEcosystemWithOrgsType = t.intersection([
    OrganizationEcosystem.OrganizationEcosystemType,
    t.strict({
      orgs: t.array(ShortOrgWithSummary.ShortOrgWithSummaryType),
    }),
  ]);

  @ApiProperty()
  orgs: ShortOrgWithSummary[];

  constructor(raw: OrganizationEcosystemWithOrgs) {
    const { orgs, ...parentProps } = raw;
    super(parentProps);
    const result =
      OrganizationEcosystemWithOrgs.OrganizationEcosystemWithOrgsType.decode(
        raw,
      );

    this.orgs = orgs;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `organization ecosystem with orgs instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
