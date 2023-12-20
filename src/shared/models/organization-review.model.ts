import { ModelFactory, Neogma, NeogmaInstance, NeogmaModel } from "neogma";
import { ExtractProps, NoRelations } from "../types";

export type OrganizationReviewProps = ExtractProps<{
  salary: number | null;
  currency: string | null;
  offersTokenAllocation: boolean | null;
  reviewedTimestamp: number | null;
  onboarding: number | null;
  careerGrowth: number | null;
  product: string | null;
  compensation: string | null;
  benefits: number | null;
  workLifeBalance: number | null;
  diversityInclusion: number | null;
  travel: number | null;
  title: string | null;
  location: string | null;
  timezone: string | null;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  pros: string | null;
  cons: string | null;
}>;

export type OrganizationReviewInstance = NeogmaInstance<
  OrganizationReviewProps,
  NoRelations
>;

export const OrganizationReviews = (
  neogma: Neogma,
): NeogmaModel<OrganizationReviewProps, NoRelations> =>
  ModelFactory<OrganizationReviewProps, NoRelations>(
    {
      label: "OrgReview",
      schema: {
        salary: { type: "number", allowEmpty: true, required: false },
        currency: { type: "string", allowEmpty: true, required: false },
        offersTokenAllocation: {
          type: "boolean",
          allowEmpty: true,
          required: false,
        },
        reviewedTimestamp: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        onboarding: { type: "number", allowEmpty: true, required: false },
        careerGrowth: { type: "number", allowEmpty: true, required: false },
        benefits: { type: "number", allowEmpty: true, required: false },
        workLifeBalance: { type: "number", allowEmpty: true, required: false },
        product: { type: "number", allowEmpty: true, required: false },
        compensation: { type: "number", allowEmpty: true, required: false },
        diversityInclusion: {
          type: "number",
          allowEmpty: true,
          required: false,
        },
        travel: { type: "number", allowEmpty: true, required: false },
        title: { type: "string", allowEmpty: true, required: false },
        location: { type: "string", allowEmpty: true, required: false },
        timezone: { type: "string", allowEmpty: true, required: false },
        workingHoursStart: {
          type: "string",
          allowEmpty: true,
          required: false,
        },
        workingHoursEnd: { type: "string", allowEmpty: true, required: false },
        pros: { type: "string", allowEmpty: true, required: false },
        cons: { type: "string", allowEmpty: true, required: false },
      },
    },
    neogma,
  );
