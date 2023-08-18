import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Investor, NoRelations } from "../types";

export type InvestorProps = ExtractProps<Investor>;

export type InvestorInstance = NeogmaInstance<InvestorProps, NoRelations>;

export const Investors = (
  neogma: Neogma,
): NeogmaModel<InvestorProps, NoRelations> =>
  ModelFactory<InvestorProps, NoRelations>(
    {
      label: "Investor",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
