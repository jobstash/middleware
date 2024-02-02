import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, OrganizationCommunity, NoRelations } from "../types";

export type OrganizationCommunityProps = ExtractProps<OrganizationCommunity>;

export type OrganizationCommunityInstance = NeogmaInstance<
  OrganizationCommunityProps,
  NoRelations
>;

export const OrganizationCommunities = (
  neogma: Neogma,
): NeogmaModel<OrganizationCommunityProps, NoRelations> =>
  ModelFactory<OrganizationCommunityProps, NoRelations>(
    {
      label: "OrganizationCommunity",
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
