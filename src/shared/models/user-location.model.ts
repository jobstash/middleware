import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type UserLocationProps = ExtractProps<{
  id: string;
  country: string | null;
  city: string | null;
}>;

export type UserLocationInstance = NeogmaInstance<
  UserLocationProps,
  NoRelations
>;

export const UserLocations = (
  neogma: Neogma,
): NeogmaModel<UserLocationProps, NoRelations> =>
  ModelFactory<UserLocationProps, NoRelations>(
    {
      label: "UserLocation",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        country: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        city: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
