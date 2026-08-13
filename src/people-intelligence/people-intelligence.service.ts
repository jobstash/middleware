import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  DeveloperReport,
  DeveloperReportV2,
  DeveloperCohort,
  PeopleActivityMap,
  PeopleAtlasFrame,
  PeopleDirectoryPage,
  PeopleMetric,
  PeopleOverview,
  PersonProfile,
} from "./people-intelligence.types";

type Query = Record<string, string | number | boolean | undefined>;

const PEOPLE_METRICS: PeopleMetric[] = [
  "activePeople",
  "affiliatedPeople",
  "activeMaintainers",
  "activeLeads",
  "joins",
  "exits",
  "movements",
  "activity",
  "commits",
  "merges",
];

const positiveInteger = (
  value: unknown,
  fallback: number,
  maximum: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
};

const developerCohort = (value: unknown): DeveloperCohort =>
  ["crypto", "fintech", "ai", "banking", "tech"].includes(String(value))
    ? (String(value) as DeveloperCohort)
    : "crypto";

@Injectable()
export class PeopleIntelligenceService {
  private readonly logger = new CustomLogger(PeopleIntelligenceService.name);

  constructor(private readonly http: HttpService) {}

  overview(query: Query): Promise<PeopleOverview> {
    return this.get("overview", query, {
      available: false,
      asOf: null,
      bucket:
        query.bucket === "quarter" || query.bucket === "year"
          ? query.bucket
          : "month",
      points: [],
    });
  }

  developerReport(query: Query = {}): Promise<DeveloperReport> {
    const cohort = developerCohort(query.cohort);
    return this.get(
      "developer-report",
      { cohort },
      {
        available: false,
        asOf: null,
        completeThrough: null,
        methodologyVersion: "developer-report-v1",
        selectedCohort: cohort,
        cohorts: [],
        population: {
          label: "Verified internal contributors",
          definition:
            "People with repeated recorded write authority at an organization; maintainers are internal contributors who merge pull requests.",
          excludes: ["external contributors", "bots", "banned organizations"],
        },
        current: null,
        history: [],
        retention: [],
        maintainerLeverage: {
          period: null,
          maintainerCount: 0,
          mergedPrCount: 0,
          medianAuthorsSupported: null,
          p25AuthorsSupported: null,
          p75AuthorsSupported: null,
        },
        organizations: [],
        movements: [],
      },
    );
  }

  developerReportV2(query: Query = {}): Promise<DeveloperReportV2> {
    const chain =
      typeof query.chain === "string" &&
      /^[a-z0-9][a-z0-9-]{0,119}$/.test(query.chain)
        ? query.chain
        : undefined;
    const cohort = developerCohort(query.cohort);
    const scorerQuery = chain
      ? {
          chain,
          ...(query.cohort === undefined ? {} : { cohort }),
        }
      : { cohort };
    return this.get("developer-report-v2", scorerQuery, {
      available: false,
      asOf: null,
      completeThrough: null,
      methodologyVersion: "developer-report-v2",
      scope: {
        type: chain ? "chain" : "cohort",
        key: chain ?? cohort,
        label: chain ?? cohort,
        slug: chain ?? null,
        logoUrl: null,
        overlapping: Boolean(chain),
      },
      scopes: { cohorts: [], chains: [] },
      coverage: {
        githubOrganizations: 0,
        chainMappedGithubOrganizations: 0,
        chainMappedPercent: 0,
        note: "Chain cohorts overlap. Global and sector totals count each internal person once.",
      },
      population: {
        label: "Verified internal contributors",
        definition:
          "Canonical internal people only; maintainers are internal people who merge pull requests and active leads have recent merge authority.",
        excludes: ["external contributors", "bots", "banned organizations"],
      },
      current: null,
      history: [],
      totals: { repositoryCount: 0, commitCount: 0 },
      repositoryHistory: [],
      breakdown: [],
      organizations: [],
      movements: [],
    });
  }

  activityMap(query: Query): Promise<PeopleActivityMap> {
    const metric = PEOPLE_METRICS.includes(query.metric as PeopleMetric)
      ? (query.metric as PeopleMetric)
      : "activePeople";
    return this.get("activity-map", query, {
      available: false,
      asOf: null,
      metric,
      page: positiveInteger(query.page, 1, 10_000),
      limit: positiveInteger(query.limit, 100, 500),
      total: 0,
      rows: [],
    });
  }

  atlas(query: Query): Promise<PeopleAtlasFrame> {
    return this.get("atlas", query, {
      available: false,
      asOf: null,
      fromPeriod: null,
      toPeriod: null,
      focusOrganizationKey:
        typeof query.organizationKey === "string"
          ? query.organizationKey
          : null,
      totalMovements: 0,
      visibleMovements: 0,
      organizations: [],
      flows: [],
    });
  }

  directory(query: Query): Promise<PeopleDirectoryPage> {
    return this.get("directory", query, {
      available: false,
      asOf: null,
      count: 0,
      nextCursor: null,
      data: [],
    });
  }

  async profile(login: string): Promise<PersonProfile | undefined> {
    try {
      const response = await firstValueFrom(
        this.http.get<PersonProfile>(
          `/scorer/people/${encodeURIComponent(login)}`,
        ),
      );
      return response.data;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) return undefined;
      this.capture("profile", error, { login });
      return undefined;
    }
  }

  private async get<T>(path: string, query: Query, fallback: T): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(`/scorer/people/${path}`, { params: query }),
      );
      return response.data;
    } catch (error) {
      this.capture(path, error, query);
      return fallback;
    }
  }

  private capture(action: string, error: unknown, input: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "proxy-call", source: "people-intelligence" });
      scope.setExtra("input", input);
      Sentry.captureException(error);
    });
    this.logger.error(
      `PeopleIntelligenceService::${action} ${(error as Error).message}`,
    );
  }
}
