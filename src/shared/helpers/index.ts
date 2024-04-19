import { Integer, Node } from "neo4j-driver";
import { DateRange, JobListOrderBy } from "../enums";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  subDays,
} from "date-fns";
import {
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { getSchemaPath } from "@nestjs/swagger";
import { Response } from "../interfaces/response.interface";
import { CustomLogger } from "../utils/custom-logger";
import {
  AggregatedRepositoryWorkHistory,
  OrgDetailsResult,
  OrgRating,
  OrganizationWorkHistory,
  PaginatedData,
  RepositoryWorkHistory,
  ShortOrg,
} from "../interfaces";
import { sort } from "fast-sort";
import { TransformFnParams } from "class-transformer";
import { Neo4jSupportedProperties, NeogmaInstance } from "neogma";
import { randomUUID } from "crypto";
import { AxiosError } from "axios";
import { firstValueFrom, catchError } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { emojiRegex } from "./emoji-regex";
import { UserWorkHistory } from "../interfaces/user/user-work-history.interface";

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

export const jobListOrderBySelector = (args: {
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
    // projectVar,
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
      return `${jobVar}.jobCreatedTimestamp`;

    case "salary":
      return `${jobVar}.medianSalary`;

    case "fundingDate":
      return `${roundVar}`;

    case "monthlyVolume":
      return `${jobVar}.jobCreatedTimestamp`;

    case "monthlyFees":
      return `${jobVar}.jobCreatedTimestamp`;

    case "monthlyRevenue":
      return `${jobVar}.jobCreatedTimestamp`;

    case "audits":
      return auditsVar;

    case "hacks":
      return hacksVar;

    case "chains":
      return chainsVar;

    case "headcountEstimate":
      return `${orgVar}.headcountEstimate`;

    case "teamSize":
      return `${jobVar}.jobCreatedTimestamp`;

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
    value === null ||
    value === undefined
  ) {
    return null;
  } else {
    return value;
  }
};

export const nonZeroOrNull = (
  value: { low: number; high: number } | number | string | null | undefined,
): number | null => {
  if (
    value === 0 ||
    typeof value === "undefined" ||
    value === null ||
    value === undefined
  ) {
    return null;
  } else {
    if (typeof value === "string") {
      const trial = Number(value);
      if (Number.isNaN(trial)) {
        return null;
      } else {
        return trial;
      }
    } else {
      return typeof value === "object" ? intConverter(value) : value;
    }
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
      const sevenDaysAgo = subDays(now, 7);
      return {
        startDate: startOfDay(sevenDaysAgo).getTime(),
        endDate: endOfDay(now).getTime(),
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

export const toList = ({ value }: TransformFnParams): string[] | null => {
  if (typeof value === "string") {
    return value.split(",");
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
        if (typeof first === "undefined") {
          objectString = "Array<unknown>";
        } else {
          const types = Array.from(
            new Set([...Array.from(obj).map(x => inferObjectType(x))]),
          );
          objectString = `Array<${types.join(" | ")}>`;
        }
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
  if (array) {
    const props = array.map(getUniqueProperty);
    const propsSet = new Set([...props]);

    if (props.length === propsSet.size) {
      return false;
    } else {
      return printDuplicateItems(propsSet, props, arrayName);
    }
  } else {
    return false;
  }
};

export const generateOrgAggregateRating = (rating: OrgRating): number => {
  const keys = Object.keys(rating);
  return keys.map(x => rating[x]).reduce((a, b) => b + a) / keys.length;
};

export const generateOrgAggregateRatings = (
  ratings: OrgRating[],
): OrgRating => {
  return {
    benefits:
      ratings.length > 0
        ? ratings.map(x => x.benefits).reduce((x, y) => x + y) / ratings.length
        : 0,
    careerGrowth:
      ratings.length > 0
        ? ratings.map(x => x.careerGrowth).reduce((x, y) => x + y) /
          ratings.length
        : 0,
    diversityInclusion:
      ratings.length > 0
        ? ratings.map(x => x.diversityInclusion).reduce((x, y) => x + y) /
          ratings.length
        : 0,
    management:
      ratings.length > 0
        ? ratings.map(x => x.management).reduce((x, y) => x + y) /
          ratings.length
        : 0,
    onboarding:
      ratings.length > 0
        ? ratings.map(x => x.onboarding).reduce((x, y) => x + y) /
          ratings.length
        : 0,
    product:
      ratings.length > 0
        ? ratings.map(x => x.product).reduce((x, y) => x + y) / ratings.length
        : 0,
    compensation:
      ratings.length > 0
        ? ratings.map(x => x.compensation).reduce((x, y) => x + y) /
          ratings.length
        : 0,
    workLifeBalance:
      ratings.length > 0
        ? ratings.map(x => x.workLifeBalance).reduce((x, y) => x + y) /
          ratings.length
        : 0,
  };
};

export const toShortOrg = (org: OrgDetailsResult): ShortOrg => {
  const {
    orgId,
    website,
    name,
    logoUrl,
    location,
    headcountEstimate,
    aggregateRating,
    reviewCount,
    community,
  } = org;
  const lastFundingRound = sort(org.fundingRounds).desc(x => x.date)[0];
  return {
    orgId,
    url: website,
    name,
    logoUrl,
    location,
    headcountEstimate,
    aggregateRating,
    reviewCount,
    community,
    jobCount: org.jobs.length,
    projectCount: org.projects.length,
    lastFundingAmount: lastFundingRound?.raisedAmount ?? 0,
    lastFundingDate: lastFundingRound?.date ?? 0,
  };
};

export function propertiesMatch<T extends object, U extends object>(
  existingNode: T,
  updateObject: U,
): boolean {
  for (const key in updateObject) {
    if (updateObject[key] !== undefined) {
      if (
        (existingNode[key as unknown as keyof T] as unknown) !==
        (updateObject[key as unknown as keyof U] as unknown)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function normalizeString(original: string | null): string | null {
  const specialChars = "!@#$%^&*<>()-+=,";
  const charToStringMap = new Map([
    ["!", "_bang_"],
    ["@", "_at_"],
    ["#", "_hash_"],
    ["$", "_dollar_"],
    ["%", "_percent_"],
    [",", "_comma_"],
    ["^", "_caret_"],
    ["&", "_and_"],
    ["*", "_asterisk_"],
    ["(", "_lparen_"],
    [")", "_rparen_"],
    ["<", "_langle_"],
    [">", "_rangle_"],
    ["-", "_hyphen_"],
    ["+", "_plus_"],
    ["=", "_equals_"],
  ]);
  if (!original) {
    return null;
  }
  const normalized = original
    .split("")
    .map(x => {
      if (specialChars.includes(x)) {
        return charToStringMap.get(x);
      } else {
        return x;
      }
    })
    .join("")
    .replace(emojiRegex(), "");
  return normalized.toLowerCase();
}

export const paginate = <T>(
  page: number,
  limit: number,
  data: T[],
): PaginatedData<T> => {
  return {
    page: (data.length > 0 ? page ?? 1 : -1) ?? -1,
    count: limit > data.length ? data.length : limit,
    total: data.length,
    data: data.slice((page - 1) * limit, page * limit),
  };
};

export const instanceToNode = <M extends Neo4jSupportedProperties, V, K>(
  instance: NeogmaInstance<M, V, K>,
): Node => {
  return {
    labels: instance.labels,
    properties: instance.getDataValues(),
    identity: Integer.MAX_VALUE,
    elementId: randomUUID(),
  };
};

export const resetTestDB = async (
  httpService: HttpService,
  logger: CustomLogger,
): Promise<void> => {
  await firstValueFrom(
    httpService.post<string>("execute-commands").pipe(
      catchError((err: AxiosError) => {
        logger.error(`${err.name} ${err.message}`);
        throw Error(
          "There was an unexpected error refreshing the test database",
        );
      }),
    ),
  );
};

export type Grouped<T, K extends keyof T> = { [propertyName in K]: T[] };

export const groupBy = <T, K extends keyof T>(
  xs: T[],
  key: K | ((x: T) => T[K]),
): Grouped<T, K> =>
  xs.reduce(function (rv, x) {
    const v = key instanceof Function ? key(x).toString() : x[key].toString();
    (rv[v] = rv[v] || []).push(x);
    return rv;
  }, {} as Grouped<T, K>);

export const repoWorkHistoryAggregator = (
  repoData: RepositoryWorkHistory,
): AggregatedRepositoryWorkHistory => {
  const relevantData =
    repoData?.data?.filter(x => {
      if (x.type === "PullRequestEvent") {
        if (x.action === "closed" && x.merged === "true") {
          return x;
        } else {
          return null;
        }
      } else {
        return x;
      }
    }) ?? [];

  return {
    name: repoData.name,
    commits: {
      count: relevantData
        ?.map(x => x?.commit_count)
        ?.filter(Boolean)
        ?.reduce((a, b) => a + b, 0),
      first: relevantData
        ?.map(x => (x?.commit_count ? x : null))
        ?.filter(Boolean)
        ?.map(val => new Date(val.first.value).getTime())
        ?.sort()[0],
      last: relevantData
        ?.map(x => (x?.commit_count ? x : null))
        ?.filter(Boolean)
        ?.map(val => new Date(val.last.value).getTime())
        ?.sort()
        ?.reverse()[0],
    },
    issues: {
      count: relevantData
        ?.filter(x => x.type === "IssuesEvent")
        ?.map(x => Number(x.count))
        ?.filter(Boolean)
        ?.reduce((a, b) => a + b, 0),
      first: relevantData
        ?.filter(x => x.type === "IssuesEvent")
        ?.map(val => new Date(val.first.value).getTime())
        ?.filter(Boolean)
        ?.sort()[0],
      last: relevantData
        ?.filter(x => x.type === "IssuesEvent")
        ?.map(val => new Date(val.last.value).getTime())
        ?.filter(Boolean)
        ?.sort()
        ?.reverse()[0],
    },
    pull_requests: {
      count: relevantData
        ?.filter(
          x =>
            x.type === "PullRequestEvent" &&
            x.action === "closed" &&
            x.merged === "true",
        )
        ?.map(x => Number(x.count))
        ?.filter(Boolean)
        ?.reduce((a, b) => a + b, 0),
      first: relevantData
        ?.filter(
          x =>
            x.type === "PullRequestEvent" &&
            x.action === "closed" &&
            x.merged === "true",
        )
        ?.map(val => new Date(val.first.value).getTime())
        ?.filter(Boolean)
        ?.sort()[0],
      last: relevantData
        ?.filter(
          x =>
            x.type === "PullRequestEvent" &&
            x.action === "closed" &&
            x.merged === "true",
        )
        ?.map(val => new Date(val.last.value).getTime())
        ?.filter(Boolean)
        ?.sort()
        ?.reverse()[0],
    },
  };
};

export const workHistoryConverter = (
  workHistory: OrganizationWorkHistory,
  orgs: OrgDetailsResult[],
): UserWorkHistory => {
  const jobstashOrg = orgs.find(org1 => {
    const q1 = new RegExp(workHistory.name, "gi");
    const q2 = new RegExp(org1.name, "gi");
    return org1.name.match(q1) || workHistory.name.match(q2);
  });
  const repositories = workHistory.repositories
    .map(repo => ({
      name: repo.name,
      url: `https://github.com/${workHistory.login}/${repo.name}`,
      cryptoNative: repo.commits.count > 0 && repo.pull_requests.count > 0,
      commitsCount: repo.commits.count,
      createdAt: new Date().getTime(),
      firstContributedAt: [
        repo.commits.first,
        repo.issues.first,
        repo.pull_requests.first,
      ]
        .filter(Boolean)
        .map(val => new Date(val).getTime())
        .sort()[0],
      lastContributedAt: [
        repo.commits.last,
        repo.issues.last,
        repo.pull_requests.last,
      ]
        .filter(Boolean)
        .map(val => new Date(val).getTime())
        .sort()
        .reverse()[0],
    }))
    .filter(repo => repo.cryptoNative);

  return {
    login: workHistory.login,
    logoUrl: jobstashOrg?.logoUrl,
    url: jobstashOrg?.website,
    name: workHistory.name,
    firstContributedAt: repositories
      .map(repo => repo.firstContributedAt)
      .filter(Boolean)
      .sort()[0],
    lastContributedAt: repositories
      .map(repo => repo.lastContributedAt)
      .filter(Boolean)
      .sort()
      .reverse()[0],
    repositories,
    createdAt: new Date().getTime(),
  };
};
