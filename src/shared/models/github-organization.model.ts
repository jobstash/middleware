import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, GithubOrganization, NoRelations } from "../types";
import { Repositories, RepositoryInstance } from "./repository.model";

export type GithubOrganizationProps = ExtractProps<GithubOrganization>;

export type GithubOrganizationInstance = NeogmaInstance<
  GithubOrganizationProps,
  NoRelations
>;

export interface GithubOrganizationRelations {
  repositories: ModelRelatedNodesI<
    ReturnType<typeof Repositories>,
    RepositoryInstance
  >;
}

export const GithubOrganizations = (
  neogma: Neogma,
): NeogmaModel<GithubOrganizationProps, GithubOrganizationRelations> =>
  ModelFactory<GithubOrganizationProps, GithubOrganizationRelations>(
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
      relationships: {
        repositories: {
          model: Repositories(neogma),
          direction: "out",
          name: "HAS_REPOSITORY",
        },
      },
    },
    neogma,
  );
