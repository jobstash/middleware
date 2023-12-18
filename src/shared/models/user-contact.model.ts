import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type UserContactProps = ExtractProps<{
  id: string;
  value: string | null;
  preferred: string | null;
}>;

export type UserContactInstance = NeogmaInstance<UserContactProps, NoRelations>;

export const UserContacts = (
  neogma: Neogma,
): NeogmaModel<UserContactProps, NoRelations> =>
  ModelFactory<UserContactProps, NoRelations>(
    {
      label: "UserContact",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        value: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        preferred: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
