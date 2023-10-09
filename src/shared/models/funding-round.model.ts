import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, FundingRound } from "../types";
import { Investors, InvestorInstance } from "./investor.model";

export type FundingRoundProps = ExtractProps<FundingRound>;

export type FundingRoundInstance = NeogmaInstance<
  FundingRoundProps,
  FundingRoundRelations
>;

export interface FundingRoundRelations {
  investors: ModelRelatedNodesI<ReturnType<typeof Investors>, InvestorInstance>;
}

export const FundingRounds = (
  neogma: Neogma,
): NeogmaModel<FundingRoundProps, FundingRoundRelations> =>
  ModelFactory<FundingRoundProps, FundingRoundRelations>(
    {
      label: "FundingRound",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        date: { type: "number", allowEmpty: false, required: true },
        createdTimestamp: { type: "number", allowEmpty: false, required: true },
        updatedTimestamp: { type: "number", allowEmpty: false, required: true },
        roundName: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        sourceLink: { type: "string", allowEmpty: true, required: false },
        raisedAmount: { type: "number", allowEmpty: true, required: false },
      },
      primaryKeyField: "id",
      relationships: {
        investors: {
          model: Investors(neogma),
          direction: "out",
          name: "HAS_INVESTOR",
        },
      },
    },
    neogma,
  );
