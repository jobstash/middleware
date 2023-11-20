import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Repository, NoRelations } from "../types";

export type RepositoryProps = ExtractProps<Repository>;

export type RepositoryInstance = NeogmaInstance<RepositoryProps, NoRelations>;

export const Repositories = (
  neogma: Neogma,
): NeogmaModel<RepositoryProps, NoRelations> =>
  ModelFactory<RepositoryProps, NoRelations>(
    {
      label: "Repository",
      schema: {
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        fullName: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        description: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        fork: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
        homepage: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        language: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        forksCount: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        stargazersCount: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        watchersCount: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        size: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        defaultBranch: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        openIssuesCount: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        archived: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
        disabled: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
        pushedAt: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        createdAt: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        updatedAt: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
    },
    neogma,
  );
