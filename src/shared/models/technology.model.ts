import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, Technology } from "../types";
import {
  TechnolgyBlockedTermInstance,
  TechnolgyBlockedTerms,
} from "./technology-blocked-term.model";

export type TechnologyProps = ExtractProps<Technology>;

export type TechnologyInstance = NeogmaInstance<
  TechnologyProps,
  TechnologyRelations,
  TechnologyMethods
>;

export interface TechnologyRelations {
  blocked: ModelRelatedNodesI<
    ReturnType<typeof TechnolgyBlockedTerms>,
    TechnolgyBlockedTermInstance
  >;
}
export interface TechnologyMethods {
  isBlockedTerm: (this: TechnologyInstance) => Promise<boolean>;
}

export const Technologies = (
  neogma: Neogma,
): NeogmaModel<TechnologyProps, TechnologyRelations, TechnologyMethods> =>
  ModelFactory<TechnologyProps, TechnologyRelations, never, TechnologyMethods>(
    {
      label: "Technology",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        normalizedName: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
      methods: {
        isBlockedTerm: async function (
          this: TechnologyInstance,
        ): Promise<boolean> {
          const blocked = await this.findRelationships({
            alias: "blocked",
            limit: 1,
          });
          return blocked[0].target.__existsInDatabase;
        },
      },
    },
    neogma,
  );
