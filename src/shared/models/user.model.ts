import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, User, NoRelations } from "../types";
import { UserShowcaseInstance, UserShowcases } from "./user-showcase.model";
import { UserEmailInstance, UserEmails } from "./user-email.model";
import { TagInstance, Tags } from "./tag.model";

export type UserProps = ExtractProps<User>;

export type UserInstance = NeogmaInstance<UserProps, NoRelations>;

export interface UserRelations {
  showcases: ModelRelatedNodesI<
    ReturnType<typeof UserShowcases>,
    UserShowcaseInstance
  >;
  skills: ModelRelatedNodesI<
    ReturnType<typeof Tags>,
    TagInstance,
    { canTeach: boolean },
    { canTeach: boolean }
  >;
  email: ModelRelatedNodesI<ReturnType<typeof UserEmails>, UserEmailInstance>;
}

export const Users = (neogma: Neogma): NeogmaModel<UserProps, UserRelations> =>
  ModelFactory<UserProps, UserRelations>(
    {
      label: "User",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        wallet: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        available: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
      relationships: {
        showcases: {
          model: UserShowcases(neogma),
          direction: "out",
          name: "HAS_SHOWCASE",
        },
        skills: {
          model: Tags(neogma),
          direction: "out",
          name: "HAS_SKILL",
          properties: {
            canTeach: {
              property: "canTeach",
              schema: {
                type: "boolean",
              },
            },
          },
        },
        email: {
          model: UserEmails(neogma),
          direction: "out",
          name: "HAS_EMAIL",
        },
      },
    },
    neogma,
  );
