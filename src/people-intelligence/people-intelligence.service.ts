import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  DeveloperReport,
  DeveloperReportCohort,
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

const developerReportCohort = (value: unknown): DeveloperReportCohort =>
  ["all", "crypto", "fintech", "ai", "banking", "tech"].includes(String(value))
    ? (String(value) as DeveloperReportCohort)
    : "all";

const developerReportRange = (value: unknown): "all" | "3y" | "1y" =>
  ["all", "3y", "1y"].includes(String(value))
    ? (String(value) as "all" | "3y" | "1y")
    : "all";

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
    const chain =
      typeof query.chain === "string" &&
      /^[a-z0-9][a-z0-9-]{0,119}$/.test(query.chain)
        ? query.chain
        : undefined;
    const cohort = developerReportCohort(query.cohort);
    const range = developerReportRange(query.range);
    const scorerQuery = chain
      ? {
          chain,
          range,
          ...(query.cohort === undefined ? {} : { cohort }),
        }
      : { cohort, range };
    return this.get("developer-report", scorerQuery, {
      available: false,
      asOf: null,
      completeThrough: null,
      methodologyVersion: "developer-report",
      range: {
        key: range,
        label:
          range === "all"
            ? "Since inception"
            : range === "3y"
              ? "Last 3 years"
              : "Last year",
        from: "",
        to: "",
      },
      summary: {
        contributors: 0,
        internalPeople: 0,
        maintainers: 0,
        activeLeads: 0,
        organizations: 0,
        repositoryCount: 0,
        indexedCommitRecords: 0,
        internalCommitRecords: 0,
        mergeRecords: 0,
      },
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
        label: "All contributors and verified internal subsets",
        definition:
          "The broad layer counts human commit authors. The verified internal subset keeps the canonical employee calculation; maintainers are internal people who merge pull requests and active leads have recent merge authority.",
        excludes: ["external contributors", "bots", "banned organizations"],
      },
      corpus: {
        indexedCommitRecords: 0,
        distinctCommitShas: 0,
        githubLinkedAuthors: 0,
        indexedRepositories: 0,
        indexedGithubOrganizations: 0,
        historicalInternalPeople: 0,
        currentInternalPeople: 0,
        verifiedInternalCommitRecords: 0,
        verifiedInternalMergeRecords: 0,
        historicalMaintainers: 0,
        currentMaintainers: 0,
        currentActiveLeads: 0,
      },
      current: null,
      history: [],
      repositoryHistory: [],
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
