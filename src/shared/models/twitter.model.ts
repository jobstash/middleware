import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Twitter, NoRelations } from "../types";

export type TwitterProps = ExtractProps<Twitter>;

export type TwitterInstance = NeogmaInstance<TwitterProps, NoRelations>;

export const Twitters = (
  neogma: Neogma,
): NeogmaModel<TwitterProps, NoRelations> =>
  ModelFactory<TwitterProps, NoRelations>(
    {
      label: "Twitter",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        username: { type: "string", allowEmpty: false, required: true },
      },
    },
    neogma,
  );
