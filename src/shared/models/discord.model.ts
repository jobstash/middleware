import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Discord, NoRelations } from "../types";

export type DiscordProps = ExtractProps<Discord>;

export type DiscordInstance = NeogmaInstance<DiscordProps, NoRelations>;

export const Discords = (
  neogma: Neogma,
): NeogmaModel<DiscordProps, NoRelations> =>
  ModelFactory<DiscordProps, NoRelations>(
    {
      label: "Discord",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        invite: { type: "string", allowEmpty: false, required: true },
      },
    },
    neogma,
  );
