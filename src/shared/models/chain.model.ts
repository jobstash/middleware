import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Chain, NoRelations } from "../types";

export type ChainProps = ExtractProps<Chain>;

export type ChainInstance = NeogmaInstance<ChainProps, NoRelations>;

export const Chains = (neogma: Neogma): NeogmaModel<ChainProps, NoRelations> =>
  ModelFactory<ChainProps, NoRelations>(
    {
      label: "Chain",
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
        logo: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
