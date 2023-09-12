import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations, TechnologyBlockedTerm } from "../types";

export type TechnolgyBlockedTermProps = ExtractProps<TechnologyBlockedTerm>;

export type TechnolgyBlockedTermInstance = NeogmaInstance<
  TechnolgyBlockedTermProps,
  NoRelations
>;

export const TechnolgyBlockedTerms = (
  neogma: Neogma,
): NeogmaModel<TechnolgyBlockedTermProps, NoRelations> =>
  ModelFactory<TechnolgyBlockedTermProps, NoRelations>(
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
