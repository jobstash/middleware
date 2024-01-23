import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, GithubUser, NoRelations } from "../types";
import { Repositories, RepositoryInstance } from "./repository.model";

export type GithubUserProps = ExtractProps<GithubUser>;

export type GithubUserInstance = NeogmaInstance<GithubUserProps, NoRelations>;

export interface GithubUserRelations {
  repositories: ModelRelatedNodesI<
    ReturnType<typeof Repositories>,
    RepositoryInstance,
    {
      summary: string | null;
      authoredCount: number | null;
      committedCount: number | null;
      mergedPrCount: number | null;
      firstAuthoredDate: number | null;
      firstCommittedDate: number | null;
      firstMergedDate: number | null;
      lastAuthoredDate: number | null;
      lastCommittedDate: number | null;
      lastMergedDate: number | null;
    },
    {
      summary: string | null;
      authoredCount: number | null;
      committedCount: number | null;
      mergedPrCount: number | null;
      firstAuthoredDate: number | null;
      firstCommittedDate: number | null;
      firstMergedDate: number | null;
      lastAuthoredDate: number | null;
      lastCommittedDate: number | null;
      lastMergedDate: number | null;
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
          type: "string",
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
          name: "CONTRIBUTED_TO",
          properties: {
            summary: {
              property: "summary",
              schema: {
                type: "string",
                required: false,
                allowEmpty: true,
              },
            },
            authoredCount: {
              property: "authoredCount",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            committedCount: {
              property: "committedCount",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            mergedPrCount: {
              property: "mergedPrCount",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            firstAuthoredDate: {
              property: "firstAuthoredDate",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            firstCommittedDate: {
              property: "firstCommittedDate",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            firstMergedDate: {
              property: "firstMergedDate",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            lastAuthoredDate: {
              property: "lastAuthoredDate",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            lastCommittedDate: {
              property: "lastCommittedDate",
              schema: {
                type: "number",
                required: false,
                allowEmpty: true,
              },
            },
            lastMergedDate: {
              property: "lastMergedDate",
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
