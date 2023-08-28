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

export type StructuredJobpostProps = ExtractProps<StructuredJobpost>;

export type StructuredJobpostInstance = NeogmaInstance<
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobpostMethods
>;

export interface StructuredJobpostMethods {
  getUnblockedTechnologies: () => Promise<TechnologyInstance[]>;
  getUnblockedTechnologiesData: () => Promise<TechnologyProps[]>;
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
  StructuredJobpostMethods
> =>
  ModelFactory<
    StructuredJobpostProps,
    StructuredJobpostRelations,
    never,
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
      },
    },
    neogma,
  );
