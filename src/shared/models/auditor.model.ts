import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { Auditor } from "../interfaces/auditor.interface";
import { ExtractProps, NoRelations } from "../types";

export type AuditorProps = ExtractProps<Auditor>;

export type AuditorInstance = NeogmaInstance<AuditorProps, NoRelations>;

export const Auditors = (
  neogma: Neogma,
): NeogmaModel<AuditorProps, NoRelations> =>
  ModelFactory<AuditorProps, NoRelations>(
    {
      label: "Auditor",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: { type: "string", allowEmpty: true, required: false },
        defiId: { type: "string", allowEmpty: true, required: false },
      },
    },
    neogma,
  );
