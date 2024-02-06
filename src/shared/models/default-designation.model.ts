import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type DefaultDesignationProps = ExtractProps<{
  id: string;
  name: string;
}>;

export type DefaultDesignationInstance = NeogmaInstance<
  DefaultDesignationProps,
  NoRelations
>;

export const DefaultDesignations = (
  neogma: Neogma,
): NeogmaModel<DefaultDesignationProps, NoRelations> =>
  ModelFactory<DefaultDesignationProps, NoRelations>(
    {
      label: "DefaultDesignation",
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
          enum: ["DefaultDesignation"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
