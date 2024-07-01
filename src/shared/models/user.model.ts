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
import { UserContactInstance, UserContacts } from "./user-contact.model";
import {
  OrganizationReviewInstance,
  OrganizationReviews,
} from "./organization-review.model";
import { UserLocationInstance, UserLocations } from "./user-location.model";
import { JobpostFolderInstance, JobpostFolders } from "./jobpost-folder.model";

export type UserProps = ExtractProps<User> & {
  createdTimestamp: number;
  updatedTimestamp: number;
};

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
  location: ModelRelatedNodesI<
    ReturnType<typeof UserLocations>,
    UserLocationInstance
  >;
  contact: ModelRelatedNodesI<
    ReturnType<typeof UserContacts>,
    UserContactInstance
  >;
  reviews: ModelRelatedNodesI<
    ReturnType<typeof OrganizationReviews>,
    OrganizationReviewInstance
  >;
  folders: ModelRelatedNodesI<
    ReturnType<typeof JobpostFolders>,
    JobpostFolderInstance
  >;
}

export const Users = (
  neogma: Neogma,
): NeogmaModel<UserProps, UserRelations> => {
  const fn = ModelFactory<UserProps, UserRelations>(
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
        createdTimestamp: {
          type: "number",
          allowEmpty: false,
          required: true,
        },
        updatedTimestamp: {
          type: "number",
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
                required: true,
                allowEmpty: false,
              },
            },
          },
        },
        email: {
          model: UserEmails(neogma),
          direction: "out",
          name: "HAS_EMAIL",
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
        reviews: {
          model: OrganizationReviews(neogma),
          direction: "out",
          name: "LEFT_REVIEW",
        },
        folders: {
          model: JobpostFolders(neogma),
          direction: "out",
          name: "CREATED_FOLDER",
        },
        location: {
          model: UserLocations(neogma),
          direction: "out",
          name: "HAS_LOCATION",
        },
      },
    },
    neogma,
  );
  fn.beforeCreate = (instance: UserInstance): void => {
    if (instance.__existsInDatabase && instance.changed) {
      instance.updatedTimestamp = new Date().getTime();
    } else {
      instance.createdTimestamp = new Date().getTime();
    }
  };
  return fn;
};
