import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, UserEmail, NoRelations } from "../types";

export type UserEmailProps = ExtractProps<UserEmail>;

export type UserEmailInstance = NeogmaInstance<UserEmailProps, NoRelations>;

export const UserEmails = (
  neogma: Neogma,
): NeogmaModel<UserEmailProps, NoRelations> =>
  ModelFactory<UserEmailProps, NoRelations>(
    {
      label: "UserEmail",
      schema: {
        email: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        verified: {
          type: "boolean",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "email",
    },
    neogma,
  );
