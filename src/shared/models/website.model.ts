import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Website, NoRelations } from "../types";

export type WebsiteProps = ExtractProps<Website>;

export type WebsiteInstance = NeogmaInstance<WebsiteProps, NoRelations>;

export const Websites = (
  neogma: Neogma,
): NeogmaModel<WebsiteProps, NoRelations> =>
  ModelFactory<WebsiteProps, NoRelations>(
    {
      label: "Website",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        url: { type: "string", allowEmpty: false, required: true },
      },
    },
    neogma,
  );
