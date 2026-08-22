import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";
import { slugify } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  DeveloperReport,
  DeveloperReportPoint,
  DeveloperReportRange,
  DeveloperReportScopeSummary,
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

const reportSlug = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,119}$/.test(value)
    ? value
    : undefined;

const developerReportRange = (value: unknown): DeveloperReportRange =>
  ["3m", "6m", "1y", "3y", "max"].includes(String(value))
    ? (String(value) as DeveloperReportRange)
    : "max";

const canonicalScopeSummaries = <
  T extends DeveloperReport["scopes"]["chains"][number],
>(
  scopes: T[],
): T[] => {
  const canonical = new Map<
    string,
    { scope: T; sourceWasCanonical: boolean }
  >();

  for (const scope of scopes) {
    const canonicalSlug = slugify(scope.slug);
    if (!canonicalSlug) continue;
    const sourceWasCanonical = scope.slug === canonicalSlug;
    const existing = canonical.get(canonicalSlug);
    if (existing?.sourceWasCanonical && !sourceWasCanonical) continue;
    canonical.set(canonicalSlug, {
      scope: { ...scope, slug: canonicalSlug },
      sourceWasCanonical,
    });
  }

  return [...canonical.values()].map(({ scope }) => scope);
};

const canonicalDeveloperReport = (report: DeveloperReport): DeveloperReport => {
  const chain = report.scope.chain ? slugify(report.scope.chain) : null;
  const chains = canonicalScopeSummaries(report.scopes.chains);

  return {
    ...report,
    scope: { ...report.scope, chain },
    scopes: { ...report.scopes, chains },
    top: {
      ...report.top,
      chains: chain
        ? chains.filter(scope => scope.slug === chain).slice(0, 10)
        : chains.slice(0, 10),
    },
  };
};

const PUBLIC_K = 5;
const PERSON_COUNT_FIELDS = [
  "allContributors",
  "activeDevelopers",
  "internalDevelopers",
  "canonicalInternalPeople",
  "activeMaintainers",
  "activeLeads",
  "fullTimeDevelopers",
  "partTimeDevelopers",
  "oneTimeDevelopers",
  "newcomerDevelopers",
  "emergingDevelopers",
  "establishedDevelopers",
  "newDevelopers",
] as const;

/**
 * Public privacy representation: unsafe rows/period cells are omitted. Any
 * remaining person-count cell from 1 through 4 is returned as zero and its
 * JSON path is listed in privacy.suppressedFields, so zero is never ambiguous.
 */
export const suppressDeveloperReportK5 = (
  report: DeveloperReport,
): DeveloperReport => {
  const suppressedFields: string[] = [];
  let omittedRows = 0;
  const count = (path: string, value: number): number => {
    if (value > 0 && value < PUBLIC_K) {
      suppressedFields.push(path);
      return 0;
    }
    return value;
  };
  const safePopulation = (value: number): boolean =>
    value === 0 || value >= PUBLIC_K;
  const point = (
    value: DeveloperReportPoint,
    path: string,
  ): DeveloperReportPoint => {
    const next = { ...value };
    for (const field of PERSON_COUNT_FIELDS) {
      next[field] = count(`${path}.${field}`, next[field]) as never;
    }
    if (value.internalDevelopers > 0 && value.internalDevelopers < PUBLIC_K) {
      next.internalDeveloperShare = 0;
      suppressedFields.push(`${path}.internalDeveloperShare`);
    }
    return next;
  };
  const points = (
    values: DeveloperReportPoint[],
    path: string,
  ): DeveloperReportPoint[] =>
    values.flatMap(value => {
      if (!safePopulation(value.activeDevelopers)) {
        omittedRows += 1;
        return [];
      }
      return [point(value, `${path}[${value.period}]`)];
    });
  const scope = (
    value: DeveloperReportScopeSummary,
    path: string,
  ): DeveloperReportScopeSummary => ({
    ...value,
    allContributors: count(`${path}.allContributors`, value.allContributors),
    activeDevelopers: count(`${path}.activeDevelopers`, value.activeDevelopers),
    internalDevelopers: count(
      `${path}.internalDevelopers`,
      value.internalDevelopers,
    ),
    activeMaintainers: count(
      `${path}.activeMaintainers`,
      value.activeMaintainers,
    ),
    activeLeads: count(`${path}.activeLeads`, value.activeLeads),
  });
  const scopes = <T extends DeveloperReportScopeSummary>(
    values: T[],
    path: string,
  ): T[] =>
    values.flatMap(value => {
      if (!safePopulation(value.activeDevelopers)) {
        omittedRows += 1;
        return [];
      }
      const sanitized = scope(value, `${path}[${value.slug}]`) as T;
      if ("history" in value && Array.isArray(value.history)) {
        Object.assign(sanitized, {
          history: points(
            value.history as DeveloperReportPoint[],
            `${path}[${value.slug}].history`,
          ),
        });
      }
      return [sanitized];
    });

  const history = points(report.history, "history");
  const organizations = report.organizations.flatMap(organization => {
    if (!safePopulation(organization.activeDevelopers)) {
      omittedRows += 1;
      return [];
    }
    const path = `organizations[${organization.organizationKey}]`;
    return [
      {
        ...organization,
        allContributors: count(
          `${path}.allContributors`,
          organization.allContributors,
        ),
        internalDevelopers: count(
          `${path}.internalDevelopers`,
          organization.internalDevelopers,
        ),
        canonicalInternalPeople: count(
          `${path}.canonicalInternalPeople`,
          organization.canonicalInternalPeople,
        ),
        maintainers: count(`${path}.maintainers`, organization.maintainers),
        leads: count(`${path}.leads`, organization.leads),
        series: organization.series.flatMap(cell => {
          if (!safePopulation(cell.activeDevelopers)) {
            omittedRows += 1;
            return [];
          }
          const cellPath = `${path}.series[${cell.period}]`;
          return [
            {
              ...cell,
              internalDevelopers: count(
                `${cellPath}.internalDevelopers`,
                cell.internalDevelopers,
              ),
              activeMaintainers: count(
                `${cellPath}.activeMaintainers`,
                cell.activeMaintainers,
              ),
              activeLeads: count(`${cellPath}.activeLeads`, cell.activeLeads),
            },
          ];
        }),
      },
    ];
  });
  const summary = { ...report.summary };
  for (const field of [
    "allContributors",
    "activeDevelopers",
    "internalDevelopers",
    "canonicalInternalPeople",
    "maintainers",
    "activeLeads",
    "newDevelopers",
  ] as const) {
    summary[field] = count(`summary.${field}`, summary[field]);
  }
  if (
    report.summary.internalDevelopers > 0 &&
    report.summary.internalDevelopers < PUBLIC_K
  ) {
    summary.internalDeveloperShare = 0;
    suppressedFields.push("summary.internalDeveloperShare");
  }
  const verticals = scopes(report.scopes.verticals, "scopes.verticals");
  const chains = scopes(report.scopes.chains, "scopes.chains");
  const overall = scope(report.scopes.overall, "scopes.overall");
  const topVerticals = scopes(report.top.verticals, "top.verticals");
  const topChains = scopes(report.top.chains, "top.chains");
  const topOrganizationKeys = new Set(
    organizations.map(organization => organization.organizationKey),
  );
  const coverage = {
    ...report.coverage,
    developersTotal: count(
      "coverage.developersTotal",
      report.coverage.developersTotal,
    ),
    categorizedDevelopers: count(
      "coverage.categorizedDevelopers",
      report.coverage.categorizedDevelopers,
    ),
    unclassifiedDevelopers: count(
      "coverage.unclassifiedDevelopers",
      report.coverage.unclassifiedDevelopers,
    ),
    developerPercent: [
      report.coverage.developersTotal,
      report.coverage.categorizedDevelopers,
      report.coverage.unclassifiedDevelopers,
    ].some(value => value > 0 && value < PUBLIC_K)
      ? (suppressedFields.push("coverage.developerPercent"), 0)
      : report.coverage.developerPercent,
  };

  return {
    ...report,
    privacy: {
      minimumAggregateSize: 5,
      suppressedValue: 0,
      suppressedFields: [...new Set(suppressedFields)].sort(),
      omittedRows,
    },
    summary,
    scopes: {
      overall,
      verticals,
      chains,
    },
    coverage,
    current: history.at(-1) ?? null,
    history,
    top: {
      verticals: topVerticals,
      chains: topChains,
      organizations: report.top.organizations.filter(
        organization =>
          topOrganizationKeys.has(organization.organizationKey) &&
          safePopulation(organization.activeDevelopers),
      ),
    },
    organizations,
  };
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

  developerReport(query: Query = {}): Promise<DeveloperReport> {
    const vertical = reportSlug(query.vertical);
    const chain = reportSlug(query.chain);
    const range = developerReportRange(query.range);
    const scorerQuery = {
      range,
      ...(vertical ? { vertical } : {}),
      ...(chain ? { chain } : {}),
    };
    const scopeType = vertical
      ? chain
        ? "vertical_chain"
        : "vertical"
      : chain
        ? "chain"
        : "overall";
    return this.get("developer-report", scorerQuery, {
      privacy: {
        minimumAggregateSize: 5,
        suppressedValue: 0,
        suppressedFields: [],
        omittedRows: 0,
      },
      available: false,
      asOf: null,
      completeThrough: null,
      methodologyVersion: "developer-report-v2",
      range: {
        key: range,
        label:
          range === "max"
            ? "Since inception"
            : range === "3y"
              ? "Last 3 years"
              : range === "1y"
                ? "Last year"
                : range === "6m"
                  ? "Last 6 months"
                  : "Last 3 months",
        from: "",
        to: "",
      },
      summary: {
        allTimeIngestedCommitRows: 0,
        reportCommitRecords: 0,
        rawIndexedCommitRecords: 0,
        commitsWritten: 0,
        creditedOriginalCommits: 0,
        mergedPullRequests: 0,
        inheritedForkCommits: 0,
        inheritedUnattributedCopyCommits: 0,
        allContributors: 0,
        activeDevelopers: 0,
        internalDevelopers: 0,
        canonicalInternalPeople: 0,
        maintainers: 0,
        activeLeads: 0,
        organizations: 0,
        activeRepositories: 0,
        newDevelopers: 0,
        newRepositories: 0,
        newForkRepositories: 0,
        newUnattributedCopyRepositories: 0,
        internalDeveloperShare: 0,
      },
      scope: {
        type: scopeType,
        label:
          [vertical, chain].filter(Boolean).join(" · ") || "All developers",
        vertical: vertical ?? null,
        chain: chain ?? null,
        logoUrl: null,
        verticalsAreExclusive: true,
        chainsOverlap: Boolean(chain),
      },
      scopes: {
        overall: {
          slug: "overall",
          label: "Overall",
          logoUrl: null,
          allContributors: 0,
          activeDevelopers: 0,
          internalDevelopers: 0,
          activeMaintainers: 0,
          activeLeads: 0,
          activeOrganizations: 0,
          activeRepositories: 0,
        },
        verticals: [],
        chains: [],
      },
      coverage: {
        organizationsTotal: 0,
        categorizedOrganizations: 0,
        unclassifiedOrganizations: 0,
        organizationPercent: 0,
        developersTotal: 0,
        categorizedDevelopers: 0,
        unclassifiedDevelopers: 0,
        developerPercent: 0,
        note: "Vertical totals are exclusive under the current scalar taxonomy; chain totals overlap.",
      },
      population: {
        label: "Original-work developers and verified internal intersections",
        definition:
          "Active developers are canonical numeric GitHub authors of provenance-approved original commits. Internal roles retain the canonical classifiers and are nested intersections.",
        excludes: ["bots", "banned organizations", "copied history"],
      },
      current: null,
      history: [],
      top: { verticals: [], chains: [], organizations: [] },
      organizations: [],
    })
      .then(canonicalDeveloperReport)
      .then(suppressDeveloperReportK5);
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
