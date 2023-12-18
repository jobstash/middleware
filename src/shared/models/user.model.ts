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
import { GithubUserInstance, GithubUsers } from "./github-user.model";
import { UserProfileInstance, UserProfiles } from "./user-profile.model";
import { UserContactInstance, UserContacts } from "./user-contact.model";

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
  githubUser: ModelRelatedNodesI<
    ReturnType<typeof GithubUsers>,
    GithubUserInstance
  >;
  email: ModelRelatedNodesI<ReturnType<typeof UserEmails>, UserEmailInstance>;
  profile: ModelRelatedNodesI<
    ReturnType<typeof UserProfiles>,
    UserProfileInstance
  >;
  contact: ModelRelatedNodesI<
    ReturnType<typeof UserContacts>,
    UserContactInstance
  >;
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
        profile: {
          model: UserProfiles(neogma),
          direction: "out",
          name: "HAS_PROFILE",
        },
        contact: {
          model: UserContacts(neogma),
          direction: "out",
          name: "HAS_CONTACT_INFO",
        },
        githubUser: {
          model: GithubUsers(neogma),
          direction: "out",
          name: "HAS_GITHUB_USER",
        },
      },
    },
    neogma,
  );
