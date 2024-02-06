import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type PairedDesignationProps = ExtractProps<{
  id: string;
  name: string;
}>;

export type PairedDesignationInstance = NeogmaInstance<
  PairedDesignationProps,
  NoRelations
>;

export const PairedDesignations = (
  neogma: Neogma,
): NeogmaModel<PairedDesignationProps, NoRelations> =>
  ModelFactory<PairedDesignationProps, NoRelations>(
    {
      label: "PairedDesignation",
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
          enum: ["PairedDesignation"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
