import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, OrganizationAlias, NoRelations } from "../types";

export type OrganizationAliasProps = ExtractProps<OrganizationAlias>;

export type OrganizationAliasInstance = NeogmaInstance<
  OrganizationAliasProps,
  NoRelations
>;

export const OrganizationAliases = (
  neogma: Neogma,
): NeogmaModel<OrganizationAliasProps, NoRelations> =>
  ModelFactory<OrganizationAliasProps, NoRelations>(
    {
      label: "OrganizationAlias",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: { type: "string", allowEmpty: false, required: true },
      },
    },
    neogma,
  );
