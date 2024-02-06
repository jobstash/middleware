import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type PreferredDesignationProps = ExtractProps<{
  id: string;
  name: string;
}>;

export type PreferredDesignationInstance = NeogmaInstance<
  PreferredDesignationProps,
  NoRelations
>;

export const PreferredDesignations = (
  neogma: Neogma,
): NeogmaModel<PreferredDesignationProps, NoRelations> =>
  ModelFactory<PreferredDesignationProps, NoRelations>(
    {
      label: "PreferredDesignation",
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
          enum: ["PreferredDesignation"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
