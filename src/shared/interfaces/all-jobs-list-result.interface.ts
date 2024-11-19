import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { Organization } from "./organization.interface";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { JobListResult } from "./job-list-result.interface";

@ApiExtraModels(StructuredJobpostWithRelations, Organization)
export class AllJobsListResult extends StructuredJobpostWithRelations {
  public static readonly AllJobsListResultType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      isBlocked: t.boolean,
      isOnline: t.boolean,
      organization: t.union([
        t.strict({
          orgId: t.string,
          name: t.string,
          projects: t.array(t.strict({ id: t.string, name: t.string })),
        }),
        t.null,
      ]),
      project: t.union([t.strict({ id: t.string, name: t.string }), t.null]),
    }),
  ]);

  @ApiProperty()
  isBlocked: boolean;

  @ApiProperty()
  isOnline: boolean;

  @ApiProperty()
  organization: {
    orgId: string;
    name: string;
    projects: { id: string; name: string }[];
  } | null;

  @ApiProperty()
  project: { id: string; name: string } | null;

  constructor(raw: AllJobsListResult) {
    const { organization, isBlocked, isOnline, project, ...jobpostProperties } =
      raw;
    super(jobpostProperties);
    const result = AllJobsListResult.AllJobsListResultType.decode(raw);

    if (organization === null && project === null) {
      throw new Error(
        `all job list result instance with id ${this.shortUUID} has no org or project`,
      );
    }

    this.organization = organization;
    this.project = project;
    this.isBlocked = isBlocked;
    this.isOnline = isOnline;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `all jobs list instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}

@ApiExtraModels(StructuredJobpostWithRelations, Organization)
export class AllOrgJobsListResult extends JobListResult {
  public static readonly AllOrgJobsListResultType = t.intersection([
    JobListResult.JobListResultType,
    t.strict({
      isBlocked: t.boolean,
      isOnline: t.boolean,
      project: t.union([t.strict({ id: t.string, name: t.string }), t.null]),
    }),
  ]);

  @ApiProperty()
  isBlocked: boolean;

  @ApiProperty()
  isOnline: boolean;

  constructor(raw: AllOrgJobsListResult) {
    const { isBlocked, isOnline, ...jobpostProperties } = raw;
    super(jobpostProperties);
    const result = AllOrgJobsListResult.AllOrgJobsListResultType.decode(raw);

    this.isBlocked = isBlocked;
    this.isOnline = isOnline;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `all org jobs list instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
