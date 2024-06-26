import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, DocSite, NoRelations } from "../types";

export type DocsiteProps = ExtractProps<DocSite>;

export type DocsiteInstance = NeogmaInstance<DocsiteProps, NoRelations>;

export const Docsites = (
  neogma: Neogma,
): NeogmaModel<DocsiteProps, NoRelations> =>
  ModelFactory<DocsiteProps, NoRelations>(
    {
      label: "DocSite",
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
