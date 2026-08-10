import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
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

const positiveInteger = (value: unknown, fallback: number, maximum: number) => {
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
      period: null,
      comparePeriod: null,
      nodes: [],
      edges: [],
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
