import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";
import { OrganizationEcosystem } from "../interfaces/org";

export type OrganizationEcosystemProps = ExtractProps<OrganizationEcosystem>;

export type OrganizationEcosystemInstance = NeogmaInstance<
  OrganizationEcosystemProps,
  NoRelations
>;

export const OrganizationEcosystems = (
  neogma: Neogma,
): NeogmaModel<OrganizationEcosystemProps, NoRelations> =>
  ModelFactory<OrganizationEcosystemProps, NoRelations>(
    {
      label: "OrganizationEcosystem",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: { type: "string", allowEmpty: false, required: true },
        normalizedName: { type: "string", allowEmpty: false, required: true },
        createdTimestamp: { type: "number", allowEmpty: true, required: false },
        updatedTimestamp: { type: "number", allowEmpty: true, required: false },
      },
    },
    neogma,
  );
