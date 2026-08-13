import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  DeveloperReport,
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

  developerReport(): Promise<DeveloperReport> {
    return this.get(
      "developer-report",
      {},
      {
        available: false,
        asOf: null,
        completeThrough: null,
        methodologyVersion: "developer-report-v1",
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
