import { ApiExtraModels, ApiPropertyOptional } from "@nestjs/swagger";
import { FundingRound } from "./funding-round.interface";
import { Investor } from "./investor.interface";
import { OrganizationWithRelations } from "./organization.interface";
import { ProjectCategory } from "./project-category.interface";
import { StructuredJobpost } from "./structured-jobpost.interface";
import { Tag } from "./tag.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { ProjectWithBaseRelations } from "./project-with-relations.interface";

@ApiExtraModels(
  StructuredJobpost,
  Tag,
  ProjectCategory,
  FundingRound,
  Investor,
  OrganizationWithRelations,
)
export class JobDetailsResult extends StructuredJobpostWithRelations {
  public static readonly JobListDetailsType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      organization: t.union([
        t.intersection([
          OrganizationWithRelations.OrganizationWithRelationsType,
          t.strict({
            hasUser: t.boolean,
            atsClient: t.union([
              t.literal("jobstash"),
              t.literal("greenhouse"),
              t.literal("workable"),
              t.literal("lever"),
              t.null,
            ]),
          }),
        ]),
        t.null,
      ]),
      project: t.union([
        t.intersection([
          ProjectWithBaseRelations.ProjectWithBaseRelationsType,
          t.strict({
            hasUser: t.boolean,
            atsClient: t.union([
              t.literal("jobstash"),
              t.literal("greenhouse"),
              t.literal("workable"),
              t.literal("lever"),
              t.null,
            ]),
          }),
        ]),
        t.null,
      ]),
    }),
  ]);

  @ApiPropertyOptional()
  organization:
    | (OrganizationWithRelations & {
        hasUser: boolean;
        atsClient: "jobstash" | "greenhouse" | "workable" | "lever" | null;
      })
    | null;

  @ApiPropertyOptional()
  project:
    | (ProjectWithBaseRelations & {
        hasUser: boolean;
        atsClient: "jobstash" | "greenhouse" | "workable" | "lever" | null;
      })
    | null;

  constructor(raw: JobDetailsResult) {
    const { organization, project, ...jobpostProperties } = raw;
    super(jobpostProperties);
    const result = JobDetailsResult.JobListDetailsType.decode(raw);

    if (organization === null && project === null) {
      throw new Error(
        `job details instance with id ${this.shortUUID} has no org or project`,
      );
    }

    this.organization = organization;
    this.project = project;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `job details instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
