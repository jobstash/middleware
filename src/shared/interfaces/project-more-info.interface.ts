import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { Project } from "./project.interface";

export class ProjectMoreInfo extends Project {
  public static readonly ProjectMoreInfoType = t.intersection([
    Project.ProjectType,
    t.strict({
      description: t.string,
      defiLlamaId: t.union([t.string, t.null]),
      tokenAddress: t.union([t.string, t.null]),
      defiLlamaSlug: t.union([t.string, t.null]),
      defiLlamaParent: t.union([t.string, t.null]),
      createdTimestamp: t.union([t.number, t.null]),
      updatedTimestamp: t.union([t.number, t.null]),
    }),
  ]);

  @ApiPropertyOptional()
  description: string;
  @ApiPropertyOptional()
  defiLlamaId: string | null;
  @ApiPropertyOptional()
  defiLlamaSlug: string | null;
  @ApiPropertyOptional()
  defiLlamaParent: string | null;
  @ApiPropertyOptional()
  tokenAddress: string | null;
  @ApiProperty()
  createdTimestamp: number | null;
  @ApiPropertyOptional()
  updatedTimestamp: number | null;

  constructor(raw: ProjectMoreInfo) {
    const {
      defiLlamaId,
      description,
      tokenAddress,
      defiLlamaSlug,
      defiLlamaParent,
      createdTimestamp,
      updatedTimestamp,
      ...projectProps
    } = raw;
    super(projectProps);

    const result = ProjectMoreInfo.ProjectMoreInfoType.decode(raw);

    this.defiLlamaId = defiLlamaId;
    this.description = description;
    this.tokenAddress = tokenAddress;
    this.defiLlamaSlug = defiLlamaSlug;
    this.defiLlamaParent = defiLlamaParent;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `project more info instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
