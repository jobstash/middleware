import { Integer } from "neo4j-driver";
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
      return `${jobVar}.jobCreatedTimestamp`;

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
      return `auditCount`;

    case "hacks":
      return `hackCount`;

    case "chains":
      return `chainCount`;

    case "headCount":
      return `${orgVar}.headCount`;

    case "teamSize":
      return `${projectVar}.teamSize`;

    default:
      return null;
  }
};

export const intConverter = (
  value: { low: number; high: number } | number,
): number => {
  if (typeof value === "number") {
    return value;
  } else {
    return new Integer(value.low, value.high).toNumber();
  }
};

export const notStringOrNull = (
  value: string | null | undefined,
  space: string[],
): string | null => {
  if (
    space.includes(value) ||
    value === "" ||
    typeof value === "undefined" ||
    value === null
  ) {
    return null;
  } else {
    return value;
  }
};
