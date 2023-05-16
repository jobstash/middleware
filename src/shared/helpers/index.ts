import { Integer } from "neo4j-driver";
import { DateRange, JobListOrderBy } from "../enums";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
} from "date-fns";
import {
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { getSchemaPath } from "@nestjs/swagger";
import { Response } from "../entities";

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
  roundVar: string;
  orderBy: JobListOrderBy;
}): string | null => {
  const { jobVar, projectVar, orgVar, roundVar, orderBy } = args;
  switch (orderBy) {
    case "publicationDate":
      return `${jobVar}.jobCreatedTimestamp`;

    case "tvl":
      return `(CASE WHEN ${projectVar} IS NOT NULL THEN ${projectVar}.tvl ELSE ${jobVar}.jobCreatedTimestamp / 1000000000 END)`;

    case "salary":
      return `${jobVar}.medianSalary`;

    case "fundingDate":
      return `${roundVar}`;

    case "monthlyVolume":
      return `(CASE WHEN ${projectVar} IS NOT NULL THEN ${projectVar}.monthlyVolume ELSE ${jobVar}.jobCreatedTimestamp / 1000000000 END)`;

    case "monthlyFees":
      return `(CASE WHEN ${projectVar} IS NOT NULL THEN ${projectVar}.monthlyFees ELSE ${jobVar}.jobCreatedTimestamp / 1000000000 END)`;

    case "monthlyRevenue":
      return `(CASE WHEN ${projectVar} IS NOT NULL THEN ${projectVar}.monthlyRevenue ELSE ${jobVar}.jobCreatedTimestamp / 1000000000 END)`;

    case "audits":
      return `auditCount`;

    case "hacks":
      return `hackCount`;

    case "chains":
      return `chainCount`;

    case "headCount":
      return `${orgVar}.headCount`;

    case "teamSize":
      return `(CASE WHEN ${projectVar} IS NOT NULL THEN ${projectVar}.teamSize ELSE ${jobVar}.jobCreatedTimestamp / 1000000000 END)`;

    default:
      return null;
  }
};

export const intConverter = (
  value: { low: number; high: number } | number | undefined | null,
): number => {
  if (typeof value === "undefined" || value === null) {
    return 0;
  } else {
    if (typeof value === "number") {
      return value;
    } else {
      return new Integer(value.low, value.high).toNumber();
    }
  }
};

export const notStringOrNull = (
  value: string | null | undefined,
  space: string[] = [""],
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

export const publicationDateRangeParser = (
  dateRange: DateRange,
  jobVar: string,
): string => {
  const now = Date.now();
  switch (dateRange) {
    case "today":
      return `${jobVar}.jobCreatedTimestamp / 1000000000 >= ${startOfDay(
        now,
      ).getTime()} AND ${jobVar}.jobCreatedTimestamp / 1000000000 <= ${endOfDay(
        now,
      ).getTime()} AND `;
    case "this-week":
      return `${jobVar}.jobCreatedTimestamp / 1000000000 >= ${startOfWeek(
        now,
      ).getTime()} AND ${jobVar}.jobCreatedTimestamp / 1000000000 <= ${endOfWeek(
        now,
      ).getTime()} AND `;
    case "this-month":
      return `${jobVar}.jobCreatedTimestamp / 1000000000 >= ${startOfMonth(
        now,
      ).getTime()} AND ${jobVar}.jobCreatedTimestamp / 1000000000 <= ${endOfMonth(
        now,
      ).getTime()} AND `;
    case "past-2-weeks":
      const twoWeeksAgo = subWeeks(now, 2);
      return `${jobVar}.jobCreatedTimestamp / 1000000000 >= ${startOfDay(
        twoWeeksAgo,
      ).getTime()} AND ${jobVar}.jobCreatedTimestamp / 1000000000 <= ${endOfDay(
        now,
      ).getTime()} AND `;
    case "past-3-months":
      const threeMonthsAgo = subMonths(now, 3);
      return `${jobVar}.jobCreatedTimestamp / 1000000000 >= ${startOfDay(
        threeMonthsAgo,
      ).getTime()} AND ${jobVar}.jobCreatedTimestamp / 1000000000 <= ${endOfDay(
        now,
      ).getTime()} AND `;
    case "past-6-months":
      const sixMonthsAgo = subMonths(now, 6);
      return `${jobVar}.jobCreatedTimestamp / 1000000000 >= ${startOfDay(
        sixMonthsAgo,
      ).getTime()} AND ${jobVar}.jobCreatedTimestamp / 1000000000 <= ${endOfDay(
        now,
      ).getTime()} AND `;
    default:
      throw new Error(`Invalid date range: ${dateRange}`);
  }
};

export const responseSchemaWrapper = (
  child: SchemaObject | ReferenceObject,
): SchemaObject | ReferenceObject => {
  return {
    $ref: getSchemaPath(Response),
    properties: {
      success: {
        type: "boolean",
      },
      message: {
        type: "string",
      },
      data: child,
    },
  };
};
