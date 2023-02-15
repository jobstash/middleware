import { JobListOrderBy } from "../enums";

/* 
    optionalMinMaxFilter is a function that conditionally applies a filter to a cypher query if min or max numeric values are set.
    It accepts args for the values to filter with and the cypher filter to apply based on the various combinations of value existence possible
*/
export const optionalMinMaxFilter = (
  vals: { min?: number | undefined; max?: number | undefined },
  both: string,
  min_only: string,
  max_only: string,
): string => {
  const { min, max } = vals;
  if (min !== undefined && max !== undefined) {
    return both + " AND ";
  } else if (min !== undefined && max === undefined) {
    return min_only + " AND ";
  } else if (min === undefined && max !== undefined) {
    return max_only + " AND ";
  } else {
    return "";
  }
};

export const orderBySelector = (args: {
  job_var: string;
  project_var: string;
  org_var: string;
  order_by: JobListOrderBy;
}): string | null => {
  const { job_var, project_var, org_var, order_by } = args;
  switch (order_by) {
    case "publication_date":
      return `${project_var}.publicationDate`;

    case "tvl":
      return `${project_var}.tvl`;

    case "salary":
      return `${job_var}.medianSalary`;

    case "funding_date":
      return `${project_var}.fundingDate`;

    case "monthly_volume":
      return `${project_var}.monthlyVolume`;

    case "monthly_active_users":
      return `${project_var}.monthlyActiveUsers`;

    case "monthly_revenue":
      return `${project_var}.monthlyRevenue`;

    case "audits":
      return ``;

    case "hacks":
      return ``;

    case "chains":
      return ``;

    case "head_count":
      return `${org_var}.teamSize`;

    default:
      return null;
  }
};
