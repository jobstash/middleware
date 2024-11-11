import { HttpService } from "@nestjs/axios";
import { getSchemaPath } from "@nestjs/swagger";
import {
  OpenAPIObject,
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { AxiosError } from "axios";
import { TransformFnParams } from "class-transformer";
import { randomUUID } from "crypto";
import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { sort } from "fast-sort";
import { Integer, Node } from "neo4j-driver";
import { Neo4jSupportedProperties, NeogmaInstance } from "neogma";
import { catchError, firstValueFrom } from "rxjs";
import ShortUniqueId from "short-unique-id";
import { NON_PUBLIC_API_ROUTES } from "../constants";
import { DateRange, JobListOrderBy } from "../enums";
import {
  OrgDetailsResult,
  OrgRating,
  PaginatedData,
  ShortOrg,
} from "../interfaces";
import { Response } from "../interfaces/response.interface";
import { PUBLIC_API_SCHEMAS } from "../presets/public-api-schemas";
import { CustomLogger } from "../utils/custom-logger";
import { emojiRegex } from "./emoji-regex";
import Sqids from "sqids";

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
    normalizedName,
    headcountEstimate,
    aggregateRating,
    reviewCount,
    community,
    ecosystems,
    grants,
  } = org;
  const lastFundingRound = sort(org.fundingRounds).desc(x => x.date)[0];
  return {
    orgId,
    url: website,
    name,
    logoUrl,
    location,
    normalizedName,
    headcountEstimate,
    aggregateRating,
    reviewCount,
    community,
    ecosystems,
    grants,
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

export function normalizeString(original: string): string {
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

  if (!original) return null;

  const normalized = original
    .trim()
    .split("")
    .map(x => {
      if (charToStringMap.has(x)) {
        return charToStringMap.get(x);
      } else {
        return x;
      }
    })
    .join("")
    .split(" ")
    .join("-")
    .toLowerCase()
    .replace(emojiRegex(), "");
  return normalized;
}

export const sluggify = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const paginate = <T>(
  page: number,
  limit: number,
  data: T[],
): PaginatedData<T> => {
  return {
    page: Number((data.length > 0 ? page ?? 1 : -1) ?? -1),
    count: Number(
      limit > data.length
        ? data.length
        : page * limit > data.length
        ? 0
        : limit,
    ),
    total: Number(data.length),
    data:
      page * limit > data.length
        ? []
        : data.slice((page - 1) * limit, page * limit),
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

export const randomToken = (): string => {
  const uid = new ShortUniqueId();
  const generate = uid.randomUUID(64);
  return generate;
};

export const uuidfy = (from: string, minLength = 64): string => {
  const sqids = new Sqids({
    minLength,
  });
  return sqids.encode(from.split("-").map(x => x.charCodeAt(0)));
};

export const obfuscate = (value: string | null): string | null => {
  if (value) {
    const lastFour = value.slice(-4);
    const firstFour = value.slice(0, 4);
    const middle = value.slice(4, -4).replace(/./g, "*");
    return `${firstFour}${middle}${lastFour}`;
  } else {
    return null;
  }
};

export const generatePublicApiSpec = (
  defaultSpec: OpenAPIObject,
): OpenAPIObject => {
  return {
    ...defaultSpec,
    paths: Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(defaultSpec.paths).filter(([path, _]) => {
        return !NON_PUBLIC_API_ROUTES.includes(path);
      }),
    ),
    components: {
      schemas: PUBLIC_API_SCHEMAS,
    },
  };
};

export const isValidUrl = (urlString: string): boolean => {
  try {
    if (urlString.startsWith("@")) {
      throw new Error("Not a valid URL but a Username instead: " + urlString);
    }
    const url = new URL(urlString);
    return ["http:", "https:"].includes(url.protocol);
  } catch (_) {
    throw new Error("Not a valid URL: " + urlString);
  }
};

export const ensureProtocol = (url: string): string[] => {
  return ["https://" + url, "http://" + url];
};

export const toAbsoluteURL = (url: string, baseUrl?: string): string => {
  try {
    // If the URL is already absolute, return as is
    new URL(url);
    return url;
  } catch {
    // If URL creation failed, check if it's a domain name or a relative path
    if (url.includes(".")) {
      // It's likely a domain name, prepend 'https://'
      return "https://" + url;
    } else {
      // It's a relative path, use the base URL to create an absolute URL
      return new URL(url, baseUrl).href;
    }
  }
};

export const getWebsiteText = (
  website: string | null,
): { link: string; hostname: string } => {
  if (!website) return { link: "", hostname: "" };

  const isUrl = website.startsWith("http");
  const url = new URL(isUrl ? website : `https://${website}`);

  return {
    link: url.toString(),
    hostname: url.hostname,
  };
};

const URL_PREFIX = "https://www.google.com/s2/favicons?domain=";
const URL_SUFFIX = "&sz=64";

export const getGoogleLogoUrl = (url: string | null): string =>
  `${URL_PREFIX}${getWebsiteText(url).hostname}${URL_SUFFIX}`;

export const getLogoUrlHttpsAlternative = (
  googleString: string,
  frontendUrl: string,
): string => {
  const url = new URL(
    `${googleString.startsWith("http") ? "" : frontendUrl}${googleString}`,
  );
  const domain = url.searchParams.get("domain");

  return `${URL_PREFIX}https://${domain}${URL_SUFFIX}`;
};
