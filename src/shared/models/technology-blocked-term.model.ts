import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations, TechnologyBlockedTerm } from "../types";

export type TechnologyBlockedTermProps = ExtractProps<TechnologyBlockedTerm>;

export type TechnolgyBlockedTermInstance = NeogmaInstance<
  TechnologyBlockedTermProps,
  NoRelations
>;

export const TechnologyBlockedTerms = (
  neogma: Neogma,
): NeogmaModel<TechnologyBlockedTermProps, NoRelations> =>
  ModelFactory<TechnologyBlockedTermProps, NoRelations>(
    {
      label: "TechnologyBlockedTerm",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
    },
    neogma,
  );
