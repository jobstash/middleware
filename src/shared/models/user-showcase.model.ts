import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import {
  ExtractProps,
  UserShowCase as UserShowcase,
  NoRelations,
} from "../types";

export type UserShowcaseProps = ExtractProps<UserShowcase>;

export type UserShowcaseInstance = NeogmaInstance<
  UserShowcaseProps,
  NoRelations
>;

export const UserShowcases = (
  neogma: Neogma,
): NeogmaModel<UserShowcaseProps, NoRelations> =>
  ModelFactory<UserShowcaseProps, NoRelations>(
    {
      label: "UserShowcase",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        label: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        url: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "label",
    },
    neogma,
  );
