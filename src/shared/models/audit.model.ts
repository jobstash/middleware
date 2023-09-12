import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, Audit, NoRelations } from "../types";

export type AuditProps = ExtractProps<Audit>;

export type AuditInstance = NeogmaInstance<AuditProps, NoRelations>;

export const Audits = (neogma: Neogma): NeogmaModel<AuditProps, NoRelations> =>
  ModelFactory<AuditProps, NoRelations>(
    {
      label: "Audit",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: { type: "string", allowEmpty: true, required: false },
        defiId: { type: "string", allowEmpty: true, required: false },
        techIssues: { type: "number", allowEmpty: true, required: false },
        link: { type: "string", allowEmpty: true, required: false },
        auditor: { type: "string", allowEmpty: true, required: false },
        date: { type: "number", allowEmpty: true, required: false },
      },
    },
    neogma,
  );
