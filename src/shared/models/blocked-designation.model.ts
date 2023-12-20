import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type BlockedDesignationProps = ExtractProps<{
  id: string;
  name: string;
}>;

export type BlockedDesignationInstance = NeogmaInstance<
  BlockedDesignationProps,
  NoRelations
>;

export const BlockedDesignations = (
  neogma: Neogma,
): NeogmaModel<BlockedDesignationProps, NoRelations> =>
  ModelFactory<BlockedDesignationProps, NoRelations>(
    {
      label: "BlockedDesignation",
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
          enum: ["BlockedDesignation"],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
