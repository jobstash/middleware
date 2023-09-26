import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
} from "neogma";
import { ExtractProps, Audit } from "../types";
import { AuditorInstance, Auditors } from "./auditor.model";

export type AuditProps = ExtractProps<Audit>;

export interface AuditRelations {
  auditor: ModelRelatedNodesI<ReturnType<typeof Auditors>, AuditorInstance>;
}

export type AuditInstance = NeogmaInstance<AuditProps, AuditRelations>;

export const Audits = (
  neogma: Neogma,
): NeogmaModel<AuditProps, AuditRelations> =>
  ModelFactory<AuditProps, AuditRelations>(
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
        date: { type: "number", allowEmpty: true, required: false },
      },
      relationships: {
        auditor: {
          name: "HAS_AUDITOR",
          direction: "out",
          model: Auditors(neogma),
        },
      },
    },
    neogma,
  );
