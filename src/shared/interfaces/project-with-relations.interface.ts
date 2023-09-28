import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Chain } from "./chain.interface";
import { Audit } from "./audit.interface";
import { Hack } from "./hack.interface";
import { ProjectMoreInfo } from "./project-more-info.interface";

export class ProjectWithRelations extends ProjectMoreInfo {
  public static readonly ProjectWithRelationsType = t.intersection([
    ProjectMoreInfo.ProjectMoreInfoType,
    t.strict({
      github: t.union([t.string, t.null]),
      docs: t.union([t.string, t.null]),
      category: t.union([t.string, t.null]),
      twitter: t.union([t.string, t.null]),
      discord: t.union([t.string, t.null]),
      telegram: t.union([t.string, t.null]),
      hacks: t.array(Hack.HackType),
      audits: t.array(Audit.AuditType),
      chains: t.array(Chain.ChainType),
    }),
  ]);

  @ApiProperty()
  category: string | null;

  @ApiProperty()
  github: string | null;

  @ApiProperty()
  twitter: string | null;

  @ApiProperty()
  telegram: string | null;

  @ApiProperty()
  discord: string | null;

  @ApiProperty()
  docs: string | null;

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Hack) },
  })
  hacks: Hack[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Audit) },
  })
  audits: Audit[];

  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Chain) },
  })
  chains: Chain[];

  constructor(raw: ProjectWithRelations) {
    const {
      github,
      docs,
      category,
      twitter,
      discord,
      telegram,
      hacks,
      audits,
      chains,
      ...projectProperties
    } = raw;
    super(projectProperties);
    const result = ProjectWithRelations.ProjectWithRelationsType.decode(raw);

    this.github = github;
    this.docs = docs;
    this.category = category;
    this.twitter = twitter;
    this.discord = discord;
    this.telegram = telegram;
    this.hacks = hacks;
    this.audits = audits;
    this.chains = chains;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
