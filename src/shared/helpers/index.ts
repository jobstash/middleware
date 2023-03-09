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
      return `WHERE ${jobVar}.jobCreatedTimestamp IS NOT NULL ORDER BY ${jobVar}.jobCreatedTimestamp`;

    case "tvl":
      return `WHERE ${projectVar}.tvl IS NOT NULL ORDER BY ${projectVar}.tvl`;

    case "salary":
      return `WHERE ${jobVar}.medianSalary IS NOT NULL ORDER BY ${jobVar}.medianSalary`;

    case "fundingDate":
      return `WHERE ${projectVar}.fundingDate IS NOT NULL ORDER BY ${projectVar}.fundingDate`;

    case "monthlyVolume":
      return `WHERE ${projectVar}.monthlyRevenue IS NOT NULL ORDER BY ${projectVar}.monthlyVolume`;

    case "monthlyFees":
      return `WHERE ${projectVar}.monthlyFees IS NOT NULL ORDER BY ${projectVar}.monthlyFees`;

    case "monthlyRevenue":
      return `WHERE ${projectVar}.monthlyRevenue IS NOT NULL ORDER BY ${projectVar}.monthlyRevenue`;

    case "audits":
      return `WHERE auditCount IS NOT NULL ORDER BY auditCount`;

    case "hacks":
      return `WHERE hackCount IS NOT NULL ORDER BY hackCount`;

    case "chains":
      return `WHERE chainCount IS NOT NULL ORDER BY chainCount`;

    case "headCount":
      return `WHERE ${orgVar}.headCount IS NOT NULL ORDER BY ${orgVar}.headCount`;

    case "teamSize":
      return `WHERE ${projectVar}.teamSize IS NOT NULL ORDER BY ${projectVar}.teamSize`;

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
