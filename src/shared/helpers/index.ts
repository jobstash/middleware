import { JobListOrderBy } from "../enums";

/* 
    optionalMinMaxFilter is a function that conditionally applies a filter to a cypher query if min or max numeric values are set.
    It accepts args for the values to filter with and the cypher filter to apply based on the various combinations of value existence possible
*/
export const optionalMinMaxFilter = (
  vals: { min?: number | undefined; max?: number | undefined },
  both: string,
  minOnly: string,
  maxOnly: string,
): string => {
  const { min, max } = vals;
  if (min !== undefined && max !== undefined) {
    return both + " AND ";
  } else if (min !== undefined && max === undefined) {
    return minOnly + " AND ";
  } else if (min === undefined && max !== undefined) {
    return maxOnly + " AND ";
  } else {
    return "";
  }
};

export const orderBySelector = (args: {
  jobVar: string;
  projectVar: string;
  orgVar: string;
  orderBy: JobListOrderBy;
}): string | null => {
  const { jobVar, projectVar, orgVar, orderBy } = args;
  switch (orderBy) {
    case "publicationDate":
      return `${projectVar}.publicationDate`;

    case "tvl":
      return `${projectVar}.tvl`;

    case "salary":
      return `${jobVar}.medianSalary`;

    case "fundingDate":
      return `${projectVar}.fundingDate`;

    case "monthlyVolume":
      return `${projectVar}.monthlyVolume`;

    case "monthlyFees":
      return `${projectVar}.monthlyFees`;

    case "monthlyRevenue":
      return `${projectVar}.monthlyRevenue`;

    case "audits":
      return ``;

    case "hacks":
      return ``;

    case "chains":
      return ``;

    case "headCount":
      return `${projectVar}.headCount`;

    case "teamSize":
      return `${orgVar}.teamSize`;

    default:
      return null;
  }
};
