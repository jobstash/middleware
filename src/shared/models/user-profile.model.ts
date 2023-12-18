import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type UserProfileProps = ExtractProps<{
  id: string;
  availableForWork: boolean;
}>;

export type UserProfileInstance = NeogmaInstance<UserProfileProps, NoRelations>;

export const UserProfiles = (
  neogma: Neogma,
): NeogmaModel<UserProfileProps, NoRelations> =>
  ModelFactory<UserProfileProps, NoRelations>(
    {
      label: "UserProfile",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        availableForWork: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
