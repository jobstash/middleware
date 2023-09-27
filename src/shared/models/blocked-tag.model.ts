import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations, BlockedTag } from "../types";

export type BlockedTagProps = ExtractProps<BlockedTag>;

export type BlockedTagInstance = NeogmaInstance<BlockedTagProps, NoRelations>;

export const BlockedTags = (
  neogma: Neogma,
): NeogmaModel<BlockedTagProps, NoRelations> =>
  ModelFactory<BlockedTagProps, NoRelations>(
    {
      label: "BlockedTag",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        tagName: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        creatorWallet: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
    },
    neogma,
  );
