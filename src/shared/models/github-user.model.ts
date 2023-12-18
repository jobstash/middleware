import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import {
  ExtractProps,
  GithubUserProperties as GithubUser,
  NoRelations,
} from "../types";

export type GithubUserProps = ExtractProps<GithubUser>;

export type GithubUserInstance = NeogmaInstance<GithubUserProps, NoRelations>;

export const GithubUsers = (
  neogma: Neogma,
): NeogmaModel<GithubUserProps, NoRelations> =>
  ModelFactory<GithubUserProps, NoRelations>(
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
        gravatarId: { type: "string", allowEmpty: false, required: true },
        avatarUrl: { type: "string", allowEmpty: false, required: true },
        accessToken: { type: "string", allowEmpty: false, required: true },
        refreshToken: { type: "string", allowEmpty: false, required: true },
      },
    },
    neogma,
  );
