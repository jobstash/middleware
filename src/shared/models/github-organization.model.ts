import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, GithubOrganization, NoRelations } from "../types";

export type GithubOrganizationProps = ExtractProps<GithubOrganization>;

export type GithubOrganizationInstance = NeogmaInstance<
  GithubOrganizationProps,
  NoRelations
>;

export const GithubOrganizations = (
  neogma: Neogma,
): NeogmaModel<GithubOrganizationProps, NoRelations> =>
  ModelFactory<GithubOrganizationProps, NoRelations>(
    {
      label: "GithubOrganization",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        login: { type: "string", allowEmpty: false, required: true },
      },
    },
    neogma,
  );
