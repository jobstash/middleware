import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import {
  ExtractProps,
  GithubOrganization as Github,
  NoRelations,
} from "../types";

export type GithubProps = ExtractProps<Github>;

export type GithubInstance = NeogmaInstance<GithubProps, NoRelations>;

export const Githubs = (
  neogma: Neogma,
): NeogmaModel<GithubProps, NoRelations> =>
  ModelFactory<GithubProps, NoRelations>(
    {
      label: "Github",
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
