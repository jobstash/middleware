import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { ShortOrgWithSummary } from "../organization.interface";
import { OrganizationEcosystemWithOrgs } from "./organization-ecosystem.interface";

export type WhiteLabelBoardSource = "organization" | "ecosystem";

export class WhiteLabelBoard {
  public static readonly WhiteLabelBoardType = t.strict({
    id: t.string,
    name: t.string,
    route: t.string,
    domain: t.union([t.string, t.null]),
    visibility: t.union([t.literal("public"), t.literal("private")]),
    createdTimestamp: t.number,
    updatedTimestamp: t.number,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  route: string;

  @ApiProperty()
  domain: string | null;

  @ApiProperty()
  visibility: "public" | "private";

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  updatedTimestamp: number;

  constructor(raw: WhiteLabelBoard) {
    const {
      id,
      name,
      route,
      domain,
      visibility,
      createdTimestamp,
      updatedTimestamp,
    } = raw;
    this.id = id;
    this.name = name;
    this.route = route;
    this.domain = domain;
    this.visibility = visibility;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    const result = WhiteLabelBoard.WhiteLabelBoardType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(e => {
        throw new Error(
          `white label board instance with id ${this.id} failed validation with error '${e}'`,
        );
      });
    }
  }
}

export class WhiteLabelBoardWithSource extends WhiteLabelBoard {
  public static readonly WhiteLabelBoardWithSourceType = t.intersection([
    WhiteLabelBoard.WhiteLabelBoardType,
    t.strict({
      sourceType: t.union([t.literal("organization"), t.literal("ecosystem")]),
      org: t.union([ShortOrgWithSummary.ShortOrgWithSummaryType, t.null]),
      ecosystem: t.union([
        OrganizationEcosystemWithOrgs.OrganizationEcosystemWithOrgsType,
        t.null,
      ]),
    }),
  ]);

  @ApiProperty()
  sourceType: WhiteLabelBoardSource;

  @ApiProperty()
  org: ShortOrgWithSummary | null;

  @ApiProperty()
  ecosystem: OrganizationEcosystemWithOrgs | null;

  constructor(raw: WhiteLabelBoardWithSource) {
    super(raw);
    const { sourceType, org, ecosystem } = raw;
    this.sourceType = sourceType;
    this.org = org;
    this.ecosystem = ecosystem;

    const result =
      WhiteLabelBoardWithSource.WhiteLabelBoardWithSourceType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(e => {
        throw new Error(
          `white label board with source instance with id ${this.id} failed validation with error '${e}'`,
        );
      });
    }

    if (this.sourceType === "organization" && !this.org) {
      throw new Error(
        `white label board with source instance with id ${this.id} has invalid source type ${this.sourceType}: org is null`,
      );
    } else if (this.sourceType === "ecosystem" && !this.ecosystem) {
      throw new Error(
        `white label board with source instance with id ${this.id} has invalid source type ${this.sourceType}: ecosystem is null`,
      );
    }
  }
}
