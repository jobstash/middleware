import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Hack, NoRelations } from "../types";

export type HackProps = ExtractProps<Hack>;

export type HackInstance = NeogmaInstance<HackProps, NoRelations>;

export const Hacks = (neogma: Neogma): NeogmaModel<HackProps, NoRelations> =>
  ModelFactory<HackProps, NoRelations>(
    {
      label: "Hack",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        defiId: { type: "string", allowEmpty: false, required: true },
        category: { type: "string", allowEmpty: false, required: true },
        fundsLost: { type: "number", allowEmpty: false, required: true },
        issueType: { type: "string", allowEmpty: false, required: true },
        date: { type: "number", allowEmpty: true, required: false },
        description: { type: "string", allowEmpty: true, required: false },
        fundsReturned: { type: "number", allowEmpty: true, required: false },
      },
    },
    neogma,
  );
