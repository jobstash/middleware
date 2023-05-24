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
import { Response } from "../interfaces/response.interface";
import { TransformFnParams } from "class-transformer";
import { CustomLogger } from "../utils/custom-logger";
import { FundingRound, JobListResult, Project } from "../interfaces";

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
  auditsVar: string;
  hacksVar: string;
  chainsVar: string;
  orderBy: JobListOrderBy;
}): string | null => {
  const {
    jobVar,
    projectVar,
    orgVar,
    roundVar,
    auditsVar,
    hacksVar,
    chainsVar,
    orderBy,
  } = args;
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
      return auditsVar;

    case "hacks":
      return hacksVar;

    case "chains":
      return chainsVar;

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

export const publicationDateRangeGenerator = (
  dateRange: DateRange | null,
): { startDate: number; endDate: number } => {
  const logger = new CustomLogger("PublicationDateRangeGenerator");
  const now = Date.now();
  switch (dateRange) {
    case "today":
      return {
        startDate: startOfDay(now).getTime(),
        endDate: endOfDay(now).getTime(),
      };
    case "this-week":
      return {
        startDate: startOfWeek(now).getTime(),
        endDate: endOfWeek(now).getTime(),
      };
    case "this-month":
      return {
        startDate: startOfMonth(now).getTime(),
        endDate: endOfMonth(now).getTime(),
      };
    case "past-2-weeks":
      const twoWeeksAgo = subWeeks(now, 2);
      return {
        startDate: startOfDay(twoWeeksAgo).getTime(),
        endDate: endOfDay(now).getTime(),
      };
    case "past-3-months":
      const threeMonthsAgo = subMonths(now, 3);
      return {
        startDate: startOfDay(threeMonthsAgo).getTime(),
        endDate: endOfDay(now).getTime(),
      };
    case "past-6-months":
      const sixMonthsAgo = subMonths(now, 6);
      return {
        startDate: startOfDay(sixMonthsAgo).getTime(),
        endDate: endOfDay(now).getTime(),
      };
    default:
      if (dateRange !== null) {
        logger.error(`Invalid date range: ${dateRange}`);
      }
      return { startDate: null, endDate: null };
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

export const btoaList = ({ value }: TransformFnParams): string[] | null => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map(encodedString =>
        Buffer.from(encodedString, "base64").toString("ascii"),
      );
  } else if (typeof value === "undefined") {
    return null;
  } else {
    return value;
  }
};

export const transformToNullIfUndefined = (
  value: unknown | undefined,
): unknown => {
  return value === undefined ? null : value;
};

export const inferObjectType = (obj: unknown): string => {
  const objectType = typeof obj;
  let objectString = "";

  if (objectType === "object") {
    if (Array.isArray(obj)) {
      const first = inferObjectType(obj[0]);
      if (Array.from(obj).every(x => inferObjectType(x) === first)) {
        objectString = `Array<${first}>`;
      } else {
        objectString = "Array<any>";
      }
    } else if (obj === null) {
      objectString = "null";
    } else {
      const propertyStrings = Object.entries(obj)
        .map(([key, value]) => `          ${key}: ${inferObjectType(value)}`)
        .sort((a: string, b: string) => a.length - b.length);
      objectString = `{ \n${propertyStrings.join(",\n")}\n }`;
    }
  } else {
    objectString = objectType;
  }

  return objectString;
};

export const printDuplicateItems = <T>(
  uniqueItems: Set<T>,
  itemsArray: T[],
  itemName: string,
): boolean => {
  let hasDuplicates = false;
  const countMap: Map<T, number> = new Map();
  const indexesMap: Map<T, number[]> = new Map();

  for (let i = 0; i < itemsArray.length; i++) {
    const item = itemsArray[i];
    if (uniqueItems.has(item)) {
      // Increment the count for duplicated items
      countMap.set(item, (countMap.get(item) || 0) + 1);
      // Store the index of the duplicated item
      const indexes = indexesMap.get(item) || [];
      indexes.push(i);
      indexesMap.set(item, indexes);
    }
  }

  for (const [item, count] of countMap.entries()) {
    if (count > 1) {
      const indexes = indexesMap.get(item);
      const firstX = indexes.slice(undefined, indexes.length - 1);
      console.log(
        `${itemName} '${item}' is found ${count} times at indexes: ${firstX.join(
          ", ",
        )} and ${indexes[indexes.length - 1]}`,
      );
      hasDuplicates = true;
    }
  }
  return hasDuplicates;
};

export const hasDuplicates = <A, B>(
  array: A[],
  getUniqueProperty: (x: A) => B,
  arrayName: string,
): boolean => {
  const props = array.map(getUniqueProperty);
  const propsSet = new Set([...props]);

  return printDuplicateItems(propsSet, props, arrayName);
};

const projectHasArrayPropsDuplication = (
  project: Project,
  jobPostUUID: string,
): boolean => {
  return (
    hasDuplicates(
      project.audits,
      a => a.auditor.toLowerCase(),
      `Audit for Project ${project.id} for Jobpost ${jobPostUUID}`,
    ) &&
    hasDuplicates(
      project.hacks,
      h => h.id,
      `Hack for Project ${project.id} for Jobpost ${jobPostUUID}`,
    ) &&
    hasDuplicates(
      project.chains,
      c => c.id,
      `Chain for Project ${project.id} for Jobpost ${jobPostUUID}`,
    ) &&
    hasDuplicates(
      project.categories,
      c => c.id,
      `Category for Project ${project.id} for Jobpost ${jobPostUUID}`,
    )
  );
};

const fundingRoundHasArrayPropsDuplication = (
  fundingRound: FundingRound,
  jobPostUUID: string,
): boolean => {
  return hasDuplicates(
    fundingRound.investors,
    i => i.id,
    `Investor for Funding Round ${fundingRound.id} for Jobpost ${jobPostUUID}`,
  );
};

export const jlrHasArrayPropsDuplication = (
  jobListResult: JobListResult,
): boolean => {
  return (
    hasDuplicates(
      jobListResult.organization.projects,
      p => p.id,
      `Org Projects for Jobpost ${jobListResult.shortUUID}`,
    ) &&
    hasDuplicates(
      jobListResult.technologies,
      x => x.id,
      `Technologies for Jobpost ${jobListResult.shortUUID}`,
    ) &&
    hasDuplicates(
      jobListResult.organization.fundingRounds,
      x => x.id,
      `Org Funding Rounds for Jobpost ${jobListResult.shortUUID}`,
    ) &&
    jobListResult.organization.projects.every(
      x =>
        projectHasArrayPropsDuplication(x, jobListResult.shortUUID) === false,
    ) === true &&
    jobListResult.organization.fundingRounds.every(
      x =>
        fundingRoundHasArrayPropsDuplication(x, jobListResult.shortUUID) ===
        false,
    ) === true
  );
};
