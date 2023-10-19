import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, JobpostClassification, NoRelations } from "../types";

export type JobpostClassificationProps = ExtractProps<JobpostClassification>;

export type JobpostClassificationInstance = NeogmaInstance<
  JobpostClassificationProps,
  NoRelations
>;

export const JobpostClassifications = (
  neogma: Neogma,
): NeogmaModel<JobpostClassificationProps, NoRelations> =>
  ModelFactory<JobpostClassificationProps, NoRelations>(
    {
      label: "JobpostClassification",
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
          enum: [
            "ACCOUNTING",
            "BIZDEV",
            "COMMUNITY",
            "CUSTOMER_SUPPORT",
            "CYBERSECURITY",
            "DESIGN",
            "DEVREL",
            "DEVOPS",
            "ENGINEERING",
            "EVENTS",
            "FINANCE",
            "GROWTH",
            "LEGAL",
            "MANAGEMENT",
            "MARKETING",
            "OPERATIONS",
            "PARTNERSHIPS",
            "PEOPLE",
            "PRODUCT",
            "SALES",
            "TECHNICAL_WRITING",
            "OTHER",
          ],
        },
      },
      primaryKeyField: "id",
    },
    neogma,
  );
