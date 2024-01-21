import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import {
  ExtractProps,
  GithubUserProperties as GithubUser,
  NoRelations,
} from "../types";
import { Repositories, RepositoryInstance } from "./repository.model";

export type GithubUserProps = ExtractProps<GithubUser>;

export type GithubUserInstance = NeogmaInstance<GithubUserProps, NoRelations>;

export interface GithubUserRelations {
  repositories: ModelRelatedNodesI<
    ReturnType<typeof Repositories>,
    RepositoryInstance,
    {
      summary: string | null;
      commits: number | null;
    },
    {
      summary: string | null;
      commits: number | null;
    }
  >;
}

export const GithubUsers = (
  neogma: Neogma,
): NeogmaModel<GithubUserProps, GithubUserRelations> =>
  ModelFactory<GithubUserProps, GithubUserRelations>(
    {
      label: "GithubUser",
      schema: {
        id: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        login: { type: "string", allowEmpty: false, required: true },
        nodeId: { type: "string", allowEmpty: false, required: true },
        gravatarId: { type: "string", allowEmpty: true, required: false },
        avatarUrl: { type: "string", allowEmpty: false, required: true },
        accessToken: { type: "string", allowEmpty: false, required: true },
        refreshToken: { type: "string", allowEmpty: true, required: false },
      },
      relationships: {
        repositories: {
          model: Repositories(neogma),
          direction: "out",
          name: "HISTORICALLY_CONTRIBUTED_TO",
          properties: {
            summary: {
              property: "summary",
              schema: {
                type: "string",
                required: false,
                allowEmpty: true,
              },
            },
            commits: {
              property: "commits",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
          },
        },
      },
    },
    neogma,
  );
