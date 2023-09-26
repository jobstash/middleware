import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Telegram, NoRelations } from "../types";

export type TelegramProps = ExtractProps<Telegram>;

export type TelegramInstance = NeogmaInstance<TelegramProps, NoRelations>;

export const Telegrams = (
  neogma: Neogma,
): NeogmaModel<TelegramProps, NoRelations> =>
  ModelFactory<TelegramProps, NoRelations>(
    {
      label: "Telegram",
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
