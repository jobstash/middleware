import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { StructuredJobpost } from "../interfaces";
import { ExtractProps } from "../types";
import {
  TechnologyInstance,
  Technologies,
  TechnologyProps,
} from "./technology.model";
import { OrganizationInstance, Organizations } from "./organization.model";
import {
  JobpostCategories,
  JobpostCategoryInstance,
} from "./jobpost-category.model";

export type StructuredJobpostProps = ExtractProps<StructuredJobpost>;

export type StructuredJobpostInstance = NeogmaInstance<
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobpostMethods
>;

export interface StructuredJobpostMethods {
  getUnblockedTechnologies: () => Promise<TechnologyInstance[]>;
  getUnblockedTechnologiesData: () => Promise<TechnologyProps[]>;
  getJobpostCategory: () => Promise<JobpostCategoryInstance>;
}

export interface StructuredJobposStatics {
  getJobOrgByUUID: (uuid: string) => Promise<OrganizationInstance | undefined>;
}

export interface StructuredJobpostRelations {
  technologies: ModelRelatedNodesI<
    ReturnType<typeof Technologies>,
    TechnologyInstance
  >;
}

export const StructuredJobposts = (
  neogma: Neogma,
): NeogmaModel<
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobpostMethods,
  StructuredJobposStatics
> =>
  ModelFactory<
    StructuredJobpostProps,
    StructuredJobpostRelations,
    StructuredJobposStatics,
    StructuredJobpostMethods
  >(
    {
      label: "StructuredJobpost",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        shortUUID: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        jobApplyPageUrl: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        jobFoundTimestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        extractedTimestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        jobCreatedTimestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        role: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        team: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        culture: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        benefits: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        jobTitle: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        seniority: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        jobPageUrl: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        jobLocation: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        medianSalary: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        paysInCrypto: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
        jobCommitment: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        minSalaryRange: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        maxSalaryRange: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        salaryCurrency: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        offersTokenAllocation: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
        aiDetectedTechnologies: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
      },
      primaryKeyField: "id",
      relationships: {
        technologies: {
          model: Technologies(neogma),
          direction: "out",
          name: "USES_TECHNOLOGY",
        },
      },
      methods: {
        getUnblockedTechnologies: async function (): Promise<
          TechnologyInstance[]
        > {
          const technologies: TechnologyInstance[] = [];
          const allTechnologies = await this.findRelationships({
            alias: "technologies",
          });
          for (const technology of allTechnologies) {
            const isBlockedTerm = await technology.target.isBlockedTerm();
            if (!isBlockedTerm) {
              technologies.push(technology.target);
            }
          }
          return technologies;
        },
        getUnblockedTechnologiesData: async function (): Promise<
          TechnologyProps[]
        > {
          const query = new QueryBuilder()
            .match({
              optional: true,
              related: [
                {
                  label: "StructuredJobpost",
                  where: {
                    shortUUID: this.shortUUID,
                  },
                },
                {
                  direction: "out",
                  name: "USES_TECHNOLOGY",
                },
                {
                  label: "Technology",
                  identifier: "technology",
                },
              ],
            })
            .raw("WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()")
            .with("COLLECT(DISTINCT PROPERTIES(technology)) as technologies")
            .return("technologies");
          const result = await query.run(neogma.queryRunner);
          const technologies: TechnologyProps[] = result?.records[0]
            .get("technologies")
            .map(record => record as TechnologyProps);
          return technologies;
        },
        getJobpostCategory:
          async function (): Promise<JobpostCategoryInstance> {
            const query = new QueryBuilder()
              .match({
                related: [
                  {
                    label: "Jobpost",
                    identifier: "jobPost",
                  },
                  {
                    name: "IS_CATEGORIZED_AS",
                    direction: "out",
                  },
                  {
                    label: "JobpostCategory",
                    identifier: "category",
                  },
                ],
              })
              .match({
                related: [
                  {
                    identifier: "jobPost",
                  },
                  {
                    name: "HAS_STRUCTURED_JOBPOST",
                    direction: "out",
                  },
                  {
                    label: "StructuredJobpost",
                    where: {
                      shortUUID: this.shortUUID,
                    },
                  },
                ],
              })
              .return("category");
            const result = (await query.run(neogma.queryRunner)).records[0].get(
              "category",
            );
            return JobpostCategories(neogma).buildFromRecord(result);
          },
      },
      statics: {
        getJobOrgByUUID: async function (
          uuid: string,
        ): Promise<OrganizationInstance | undefined> {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Organization",
                  identifier: "organization",
                },
                {
                  name: "HAS_JOBSITE",
                  direction: "out",
                },
                {
                  label: "Jobsite",
                },
                {
                  name: "HAS_JOBPOST",
                  direction: "out",
                },
                {
                  label: "Jobpost",
                  identifier: "jobPost",
                },
                {
                  name: "IS_CATEGORIZED_AS",
                  direction: "out",
                },
                {
                  label: "JobpostCategory",
                  where: {
                    name: "technical",
                  },
                },
              ],
            })
            .match({
              related: [
                {
                  identifier: "jobPost",
                },
                {
                  name: "HAS_STATUS",
                  direction: "out",
                },
                {
                  label: "JobpostStatus",
                  where: {
                    status: "active",
                  },
                },
              ],
            })
            .match({
              related: [
                {
                  identifier: "jobPost",
                },
                {
                  name: "HAS_STRUCTURED_JOBPOST",
                  direction: "out",
                },
                {
                  label: "StructuredJobpost",
                  where: {
                    shortUUID: uuid,
                  },
                },
              ],
            })
            .return("organization");
          const result = (await query.run(neogma.queryRunner)).records[0].get(
            "organization",
          );
          return result
            ? Organizations(neogma).buildFromRecord(result)
            : undefined;
        },
      },
    },
    neogma,
  );
