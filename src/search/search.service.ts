import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { go } from "fuzzysort";
import { capitalize, lowerCase } from "lodash";
import { toHeaderCase } from "js-convert-case";
import {
  ResolvedPlacePillar,
  SearchRepository,
} from "src/postgres/search.repository";
import {
  NAV_FILTER_CONFIGS,
  NAV_FILTER_LABEL_MAPPINGS,
  NAV_PILLAR_ORDERING,
  NAV_PILLAR_SLUG_PREFIX_MAPPINGS,
  NAV_PILLAR_TITLES,
  CANONICAL_JOB_CLASSIFICATIONS,
} from "src/shared/constants";
import {
  MultiSelectFilter,
  PaginatedData,
  Pillar,
  PillarInfo,
  ResponseWithOptionalData,
  SearchNav,
  SearchRangeFilter,
  SearchResult,
  SearchResultItem,
  SearchResultNav,
  SingleSelectFilter,
} from "src/shared/interfaces";
import {
  isValidFilterConfig,
  paginate,
  publicationDateRangeGenerator,
  slugify,
} from "src/shared/helpers";
import {
  FILTER_CONFIG_PRESETS,
  FILTER_PARAM_KEY_PRESETS,
} from "src/shared/presets/search-filter-configs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";
import {
  JobSuggestionsInput,
  SUGGESTION_GROUPS,
  SuggestionGroupId,
} from "./dto/job-suggestions.input";
import { GroupInfo, SuggestionsResponse } from "./dto/job-suggestions.output";
import {
  PillarJob,
  PillarPageData,
  PillarPageOrg,
  SuggestedPillar,
  SitemapJob,
} from "./dto/pillar-page.output";
import { SearchPillarFiltersParams } from "./dto/search-pillar-filters-params.input";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { SearchPillarParams } from "./dto/search-pillar.input";
import { SearchParams } from "./dto/search.input";
import { SkillSuggestionsInput } from "./dto/skill-suggestions.input";
import { SkillSuggestionsData } from "./dto/skill-suggestions.output";
import { TeamIntelligenceService } from "src/team-intelligence/team-intelligence.service";
import {
  JobMarketCompensationBandRow,
  JobMarketMetricRow,
  JobMarketGeographyRow,
  JobMarketRepository,
  JobMarketSkillRow,
  JobMarketSkillWeeklyRow,
} from "src/postgres/job-market.repository";
import {
  JobMarketActivity,
  JobMarketChangeMetric,
  JobMarketCompensation,
  JobMarketCompensationBand,
  JobMarketEvidenceLevel,
  JobMarketFilter,
  JobMarketMomentum,
  JobMarketOverviewData,
  JobMarketPoint,
  JobMarketSalary,
  JobMarketSkillDetailData,
  JobMarketSkillListData,
  JobMarketSkillSignal,
  JobMarketSkillSummary,
  JobMarketSkillWeeklyPoint,
  JobMarketStateData,
  JobMarketTicker,
  JobMarketTopPayingBreakdown,
  JobMarketTopPayingData,
  PillarMarketData,
} from "./dto/job-market.output";
import {
  OrganizationTeamSummary,
  TeamFilterInput,
} from "src/team-intelligence/team-intelligence.types";

type FilterConfig = Record<string, unknown>;

const TEAM_FILTER_FIELDS = new Set([
  "currentMaintainers",
  "activeLeads",
  "newActiveLeads",
  "steppedDownLeads",
  "movedLeads",
  "earlyLeadDepartures",
]);

const JOB_CLASSIFICATION_LABELS = new Map(
  CANONICAL_JOB_CLASSIFICATIONS.map(classification => [
    classification.filterKey,
    classification.label,
  ]),
);

const navigationLinkSegments: Partial<
  Record<SearchNav, Record<string, string>>
> = {
  projects: {
    categories: "categories",
    chains: "chains",
    organizations: "organizations",
    investors: "investors",
    names: "names",
    tags: "tags",
  },
  organizations: {
    locations: "locations",
    investors: "investors",
    fundingRounds: "funding-rounds",
    fundingStages: "fundingStages",
    chains: "chains",
    names: "names",
    tags: "tags",
    projects: "projects",
  },
  vcs: { names: "names" },
};

const rangeFilters: Partial<
  Record<SearchNav, Record<string, { minimum: string; maximum: string }>>
> = {
  projects: {
    tvl: { minimum: "minTvl", maximum: "maxTvl" },
    monthlyVolume: {
      minimum: "minMonthlyVolume",
      maximum: "maxMonthlyVolume",
    },
    monthlyFees: {
      minimum: "minMonthlyFees",
      maximum: "maxMonthlyFees",
    },
    monthlyRevenue: {
      minimum: "minMonthlyRevenue",
      maximum: "maxMonthlyRevenue",
    },
  },
  organizations: {
    headCount: { minimum: "minHeadCount", maximum: "maxHeadCount" },
    currentMaintainers: {
      minimum: "minCurrentMaintainers",
      maximum: "maxCurrentMaintainers",
    },
    activeLeads: {
      minimum: "minActiveLeads",
      maximum: "maxActiveLeads",
    },
  },
};

const booleanFilters: Partial<Record<SearchNav, Record<string, string>>> = {
  projects: {
    audits: "hasAudits",
    hacks: "hasHacks",
    token: "hasToken",
  },
  organizations: {
    hasProjects: "hasProjects",
    hasJobs: "hasJobs",
    newActiveLeads: "newActiveLeads",
    steppedDownLeads: "steppedDownLeads",
    movedLeads: "movedLeads",
    earlyLeadDepartures: "earlyLeadDepartures",
    recentlyFunded: "recentlyFunded",
  },
};

@Injectable()
export class SearchService {
  private readonly logger = new CustomLogger(SearchService.name);

  private readonly groupLabels: Record<SuggestionGroupId, string> = {
    jobs: "Job Titles",
    organizations: "Organizations",
    tags: "Tags",
    classifications: "Job Category",
    workModes: "Work Mode",
    locations: "Locations",
    investors: "Investors",
    fundingRounds: "Funding Rounds",
  };

  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly teamIntelligence: TeamIntelligenceService,
    private readonly jobMarketRepository: JobMarketRepository,
  ) {}

  async getPillarMarket(
    slug: string,
    range = "365",
  ): Promise<ResponseWithOptionalData<PillarMarketData>> {
    try {
      const canonicalSlug = this.marketApiSlug(slug);
      const days = this.marketRangeDays(range);
      const [rows, compensationRows, signalRows] = await Promise.all([
        this.jobMarketRepository.getPillarHistory(canonicalSlug, days),
        this.jobMarketRepository.getGeography(
          canonicalSlug,
          this.marketRangeKey(range),
        ),
        canonicalSlug.startsWith("t-")
          ? this.jobMarketRepository.getLatestSkillSignals(canonicalSlug)
          : Promise.resolve([]),
      ]);
      if (rows.length === 0) {
        return {
          success: true,
          message: "Pillar market not found",
          data: null,
        };
      }
      const history = rows.map(row => this.marketPoint(row));
      const current = history[history.length - 1];
      const pillarFilter = await this.marketPillarFilter(
        rows[0].kind,
        canonicalSlug,
      );
      return {
        success: true,
        message: "Retrieved pillar market data",
        data: {
          asOf: current.date,
          pillar: {
            kind: rows[0].kind,
            slug: rows[0].slug,
            label: this.marketLabel(rows[0].kind, rows[0].label),
            filter: pillarFilter,
          },
          current,
          momentum: this.marketMomentum(history),
          history,
          compensation: compensationRows.map(row =>
            this.marketCompensation(row),
          ),
          skillSignals: signalRows.map(row => this.marketSkillSignal(row)),
        },
      };
    } catch (error) {
      this.captureDatabaseError("getPillarMarket", error);
      return { success: false, message: "Error retrieving pillar market" };
    }
  }

  async getMarketOverview(): Promise<
    ResponseWithOptionalData<JobMarketOverviewData>
  > {
    try {
      const [rows, historyRows] = await Promise.all([
        this.jobMarketRepository.getOverview(),
        this.jobMarketRepository.getOverviewHistory(),
      ]);
      const historyBySlug = new Map<string, JobMarketPoint[]>();
      for (const row of historyRows) {
        const history = historyBySlug.get(row.slug) ?? [];
        history.push(this.marketPoint(row));
        historyBySlug.set(row.slug, history);
      }
      const marketRow = rows.find(row => row.slug === "market");
      const tickers = rows.map(row =>
        this.marketTicker(row, marketRow, historyBySlug.get(row.slug) ?? []),
      );
      const market = tickers.find(ticker => ticker.slug === "market");
      if (!market) {
        return { success: true, message: "Job market not ready", data: null };
      }
      const classifications = tickers.filter(
        ticker => ticker.kind === "classifications",
      );
      const movers = classifications.filter(ticker => ticker.eligibleMover);
      const moveScore = (ticker: JobMarketTicker): number =>
        ticker.activity.marketComparison.openInventoryPercentagePoints ?? 0;
      return {
        success: true,
        message: "Retrieved job market overview",
        data: {
          asOf: market.current.date,
          market,
          classifications,
          movers: {
            bullish: [...movers]
              .filter(ticker => moveScore(ticker) > 0)
              .sort((a, b) => moveScore(b) - moveScore(a))
              .slice(0, 5),
            cooling: [...movers]
              .filter(ticker => moveScore(ticker) < 0)
              .sort((a, b) => moveScore(a) - moveScore(b))
              .slice(0, 5),
          },
        },
      };
    } catch (error) {
      this.captureDatabaseError("getMarketOverview", error);
      return { success: false, message: "Error retrieving job market" };
    }
  }

  async getMarketState(
    range = "max",
    classification = "market",
  ): Promise<ResponseWithOptionalData<JobMarketStateData>> {
    try {
      const rangeKey = this.marketRangeKey(range);
      const canonicalClassification = classification.startsWith("cl-")
        ? classification
        : classification === "market"
          ? "market"
          : `cl-${slugify(classification)}`;
      const overview = await this.getMarketOverview();
      if (!overview.success || !("data" in overview) || !overview.data) {
        return { success: true, message: "Job market not ready", data: null };
      }
      const overviewData = overview.data;
      const validClassifications = new Set([
        "market",
        ...overviewData.classifications.map(ticker => ticker.slug),
      ]);
      const selectedClassification = validClassifications.has(
        canonicalClassification,
      )
        ? canonicalClassification
        : "market";
      const [geographyRows, compensationBandRows] = await Promise.all([
        this.jobMarketRepository.getGeography(selectedClassification, rangeKey),
        this.jobMarketRepository.getClassificationCompensationBands(
          selectedClassification,
          rangeKey,
        ),
      ]);
      const selectedTicker =
        selectedClassification === "market"
          ? overviewData.market
          : overviewData.classifications.find(
              ticker => ticker.slug === selectedClassification,
            );
      return {
        success: true,
        message: "Retrieved job market state",
        data: {
          ...overviewData,
          completeThrough: overviewData.asOf,
          methodologyVersion: "market-state-v3",
          selectedClassification,
          selectedClassificationLabel:
            selectedTicker?.label ?? overviewData.market.label,
          range: rangeKey,
          geography: geographyRows.map(row => this.marketCompensation(row)),
          compensationBands: compensationBandRows.map(row =>
            this.marketCompensationBand(row),
          ),
        },
      };
    } catch (error) {
      this.captureDatabaseError("getMarketState", error);
      return { success: false, message: "Error retrieving market state" };
    }
  }

  async getMarketTopPaying(
    segmentInput = "remote",
    classificationInput = "market",
    regionTypeInput = "",
    regionInput = "",
  ): Promise<ResponseWithOptionalData<JobMarketTopPayingData>> {
    try {
      const segment = segmentInput === "local" ? "local" : "remote";
      const canonicalClassification = classificationInput.startsWith("cl-")
        ? classificationInput
        : classificationInput === "market"
          ? "market"
          : `cl-${slugify(classificationInput)}`;
      const overviewRows = await this.jobMarketRepository.getOverview();
      const marketRow = overviewRows.find(row => row.slug === "market");
      const classificationRow = overviewRows.find(
        row => row.slug === canonicalClassification,
      );
      const classification =
        canonicalClassification === "market" || classificationRow
          ? canonicalClassification
          : "market";
      const geographyRows = await this.jobMarketRepository.getGeography(
        classification,
        "max",
      );
      const allowedRegionTypes = new Set([
        "aggregate",
        "continent",
        "country",
        "region",
        "city",
      ]);
      const requestedRegionType = allowedRegionTypes.has(regionTypeInput)
        ? regionTypeInput
        : "aggregate";
      const selectedGeography =
        segment === "remote"
          ? geographyRows.find(
              row => row.segment === "remote" && row.regionSlug === "remote",
            )
          : (geographyRows.find(
              row =>
                row.segment === "local" &&
                row.regionType === requestedRegionType &&
                row.regionSlug === regionInput,
            ) ??
            geographyRows.find(
              row => row.segment === "local" && row.regionType === "aggregate",
            ));
      if (!selectedGeography || !marketRow) {
        return {
          success: true,
          message: "Top-paying market not ready",
          data: null,
        };
      }
      const rows = await this.jobMarketRepository.getTopPayingJobs(
        classification,
        segment,
        selectedGeography.filterKey ? selectedGeography.regionKey : null,
        selectedGeography.filterKey,
        selectedGeography.filterValue,
      );
      const salaries = rows
        .map(row => this.asNumber(row.salaryMonthlyUsd))
        .filter((salary): salary is number => salary !== null);
      const median = (values: number[]): number | null => {
        if (values.length === 0) return null;
        const sorted = [...values].sort((left, right) => left - right);
        const middle = Math.floor(sorted.length / 2);
        const value =
          sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle];
        return Math.round(value * 100) / 100;
      };
      const seniority = (
        value: string | null,
      ): { slug: string; label: string } | null => {
        if (!value) return null;
        const established: Record<string, string> = {
          "1": "Intern",
          "2": "Junior",
          "3": "Senior",
          "4": "Lead",
          "5": "Head",
        };
        const label =
          established[value] ?? this.marketLabel("seniority", value);
        return { slug: `s-${slugify(label)}`, label };
      };
      const createBreakdown = (
        entries: Array<{ slug: string; label: string; salary: number }>,
        limit: number,
      ): JobMarketTopPayingBreakdown[] => {
        const groups = new Map<
          string,
          { slug: string; label: string; salaries: number[] }
        >();
        for (const entry of entries) {
          const current = groups.get(entry.slug) ?? {
            slug: entry.slug,
            label: entry.label,
            salaries: [],
          };
          current.salaries.push(entry.salary);
          groups.set(entry.slug, current);
        }
        return [...groups.values()]
          .map(group => ({
            slug: group.slug,
            label: group.label,
            jobCount: group.salaries.length,
            sharePercent:
              rows.length === 0
                ? 0
                : Math.round((group.salaries.length / rows.length) * 1_000) /
                  10,
            medianMonthlyUsd: median(group.salaries) ?? 0,
          }))
          .sort(
            (left, right) =>
              right.jobCount - left.jobCount ||
              right.medianMonthlyUsd - left.medianMonthlyUsd ||
              left.label.localeCompare(right.label),
          )
          .slice(0, limit);
      };
      const classificationEntries = rows.flatMap(row => {
        const salary = this.asNumber(row.salaryMonthlyUsd);
        return salary === null
          ? []
          : [
              {
                slug: row.classificationSlug,
                label: this.marketLabel(
                  "classifications",
                  row.classificationLabel,
                ),
                salary,
              },
            ];
      });
      const seniorityEntries = rows.flatMap(row => {
        const salary = this.asNumber(row.salaryMonthlyUsd);
        const level = seniority(row.seniority);
        return salary === null || !level ? [] : [{ ...level, salary }];
      });
      const tagEntries = rows.flatMap(row => {
        const salary = this.asNumber(row.salaryMonthlyUsd);
        if (salary === null || !Array.isArray(row.tags)) return [];
        return row.tags.map(tag => ({
          slug: tag.slug,
          label: tag.label,
          salary,
        }));
      });
      const openJobsInScope = Number(
        rows[0]?.openJobsInScope ?? selectedGeography.regionalActiveJobs ?? 0,
      );
      const salaryJobCount = Number(rows[0]?.salaryJobCount ?? 0);
      const classificationLabel =
        classification === "market"
          ? this.marketLabel(marketRow.kind, marketRow.label)
          : this.marketLabel(
              classificationRow?.kind ?? "classifications",
              classificationRow?.label ?? classification,
            );
      return {
        success: true,
        message: "Retrieved top-paying opportunities",
        data: {
          asOf: rows[0]?.asOfDate ?? selectedGeography.asOfDate,
          methodologyVersion: "market-top-pay-v2",
          scope: {
            classification,
            classificationLabel,
            segment,
            regionSlug: selectedGeography.regionSlug,
            regionLabel: selectedGeography.regionLabel,
            regionType: selectedGeography.regionType,
            filter:
              selectedGeography.filterKey && selectedGeography.filterValue
                ? {
                    paramKey: selectedGeography.filterKey,
                    value: selectedGeography.filterValue,
                  }
                : null,
          },
          availableRegions: geographyRows
            .filter(
              row =>
                row.segment === "local" &&
                row.regionType !== "remote" &&
                Number(row.regionalActiveJobs ?? 0) > 0 &&
                Number(row.salarySampleCount ?? 0) > 0,
            )
            .map(row => ({
              regionSlug: row.regionSlug,
              regionLabel: row.regionLabel,
              regionType: row.regionType as Exclude<
                JobMarketCompensation["regionType"],
                "remote"
              >,
              activeJobs: Number(row.regionalActiveJobs ?? 0),
              salarySampleCount: Number(row.salarySampleCount ?? 0),
            })),
          openJobsInScope,
          salaryJobCount,
          salaryCoveragePercent:
            openJobsInScope > 0
              ? Math.min(
                  100,
                  Math.round((salaryJobCount / openJobsInScope) * 1_000) / 10,
                )
              : 0,
          topDecileThresholdMonthlyUsd: this.roundMarketNumber(
            rows[0]?.topDecileThresholdMonthlyUsd ?? null,
          ),
          topDecileJobCount: Number(rows[0]?.topDecileJobCount ?? 0),
          medianTopDecileMonthlyUsd: median(salaries),
          breakdowns: {
            classifications: createBreakdown(classificationEntries, 10),
            seniorities: createBreakdown(seniorityEntries, 10),
            tags: createBreakdown(tagEntries, 12),
          },
          jobs: rows.slice(0, 12).flatMap(row => {
            const salary = this.roundMarketNumber(row.salaryMonthlyUsd);
            if (salary === null) return [];
            const level = seniority(row.seniority);
            const workModes = new Set(
              this.asStringArray(row.locationTypes).map(mode =>
                mode.toLowerCase(),
              ),
            );
            if (row.onsite) workModes.add("onsite");
            if (row.hybrid) workModes.add("hybrid");
            if (row.remote) workModes.add("remote");
            const organizationSuffix = row.organizationName
              ? `-${row.organizationName}`
              : "";
            return [
              {
                id: row.jobNodeId,
                shortUuid: row.shortUuid,
                title: row.title,
                href: `/${slugify(`${row.title}${organizationSuffix}`)}/${row.shortUuid}`,
                organizationName: row.organizationName,
                organizationLogoUrl: row.organizationLogoUrl,
                classificationSlug: row.classificationSlug,
                classificationLabel: this.marketLabel(
                  "classifications",
                  row.classificationLabel,
                ),
                senioritySlug: level?.slug ?? null,
                seniorityLabel: level?.label ?? null,
                location: row.location,
                workModes: [...workModes],
                publishedAt: row.publishedAt,
                salaryMonthlyUsd: salary,
                tags: Array.isArray(row.tags) ? row.tags.slice(0, 8) : [],
              },
            ];
          }),
        },
      };
    } catch (error) {
      this.captureDatabaseError("getMarketTopPaying", error);
      return {
        success: false,
        message: "Error retrieving top-paying opportunities",
      };
    }
  }

  async getMarketSkills(
    segmentInput = "remote",
    sortInput = "breakout",
    query = "",
    classificationInput = "market",
  ): Promise<ResponseWithOptionalData<JobMarketSkillListData>> {
    try {
      const segment = segmentInput === "local" ? "local" : "remote";
      const allowedSorts = new Set([
        "breakout",
        "repricing",
        "salary",
        "demand",
        "cooling",
      ]);
      const sort = allowedSorts.has(sortInput) ? sortInput : "breakout";
      const canonicalClassification = classificationInput.startsWith("cl-")
        ? classificationInput
        : classificationInput === "market"
          ? "market"
          : `cl-${slugify(classificationInput)}`;
      const overviewRows = await this.jobMarketRepository.getOverview();
      const marketRow = overviewRows.find(row => row.slug === "market");
      const classificationRow = overviewRows.find(
        row => row.slug === canonicalClassification,
      );
      const classification =
        canonicalClassification === "market" || classificationRow
          ? canonicalClassification
          : "market";
      const rows =
        classification === "market"
          ? await this.jobMarketRepository.getSkillSummaries(
              segment,
              query.trim(),
            )
          : await this.jobMarketRepository.getClassificationSkillSummaries(
              classification,
              segment,
              query.trim(),
            );
      const skills = rows.map(row =>
        this.marketSkillSummary(
          row,
          marketRow,
          Number(classificationRow?.activeJobs ?? marketRow?.activeJobs ?? 0),
        ),
      );
      const score = (skill: JobMarketSkillSummary): number => {
        const repricing = skill.signal?.adjustedChangePercent ?? -Infinity;
        const demand = skill.momentum.marketRelativeScore ?? -Infinity;
        const salary = skill.current.medianMonthlyUsd ?? -Infinity;
        if (sort === "salary") return salary;
        if (sort === "repricing") return repricing;
        if (sort === "demand") return demand;
        if (sort === "cooling") return -demand;
        return Number.isFinite(repricing) || Number.isFinite(demand)
          ? (skill.strongBreakout ? 1_000_000 : 0) + repricing * 100 + demand
          : skill.activeJobs * 10 + skill.hiringCompanies;
      };
      const sorted = skills
        .filter(skill =>
          sort === "cooling"
            ? (skill.momentum.marketRelativeScore ?? 0) < -5
            : sort === "repricing"
              ? skill.signal?.status === "rising"
              : true,
        )
        .sort((left, right) => score(right) - score(left))
        .slice(0, 250);
      const asOf = rows[0]?.asOfDate ?? marketRow?.sampleDate;
      if (!asOf) {
        return { success: true, message: "Skill market not ready", data: null };
      }
      return {
        success: true,
        message: "Retrieved skill market",
        data: {
          asOf,
          completeThrough: asOf,
          methodologyVersion: "market-state-v3",
          classification,
          classificationLabel:
            classification === "market"
              ? "All roles"
              : this.marketLabel(
                  classificationRow?.kind ?? "classifications",
                  classificationRow?.label ?? classification,
                ),
          segment,
          sort: sort as JobMarketSkillListData["sort"],
          query: query.trim(),
          skills: sorted,
        },
      };
    } catch (error) {
      this.captureDatabaseError("getMarketSkills", error);
      return { success: false, message: "Error retrieving skill market" };
    }
  }

  async getMarketSkillDetail(
    slug: string,
    range = "max",
  ): Promise<ResponseWithOptionalData<JobMarketSkillDetailData>> {
    try {
      const canonicalSlug = slug.startsWith("t-") ? slug : `t-${slugify(slug)}`;
      const days = this.marketRangeDays(range);
      const [historyRows, geographyRows, signalRows] = await Promise.all([
        this.jobMarketRepository.getSkillWeeklyHistory(canonicalSlug, days),
        this.jobMarketRepository.getGeography(
          canonicalSlug,
          this.marketRangeKey(range),
        ),
        this.jobMarketRepository.getLatestSkillSignals(canonicalSlug),
      ]);
      const first = historyRows[0];
      const asOf =
        geographyRows[0]?.asOfDate ?? signalRows[0]?.signalAsOf ?? null;
      if (!first || !asOf) {
        return { success: true, message: "Skill market not found", data: null };
      }
      return {
        success: true,
        message: "Retrieved skill market detail",
        data: {
          asOf,
          completeThrough: asOf,
          methodologyVersion: "market-state-v2",
          skill: { slug: first.slug, label: first.label },
          signals: signalRows.map(row => this.marketSkillSignal(row)),
          compensation: geographyRows.map(row => this.marketCompensation(row)),
          history: historyRows.map(row => this.marketSkillWeeklyPoint(row)),
        },
      };
    } catch (error) {
      this.captureDatabaseError("getMarketSkillDetail", error);
      return { success: false, message: "Error retrieving skill detail" };
    }
  }

  async searchChains(
    query: string,
    group: "projects" | "organizations",
  ): Promise<SearchResultItem[]> {
    return (await this.buildNavigation(group, query)).chains ?? [];
  }

  async search(params: SearchParams): Promise<SearchResult> {
    try {
      const query = params?.query?.trim() || null;
      const nav = params?.nav;
      const excluded = params?.excluded ?? null;
      if (nav) {
        const result = await this.buildNavigation(nav, query);
        if (excluded?.length) {
          for (const key of Object.keys(result)) {
            result[key] = result[key].filter(
              item => !excluded.includes(slugify(item.value)),
            );
          }
        }
        return { [nav]: result };
      }
      const [projects, organizations, vcs] = await Promise.all([
        this.buildNavigation("projects", query),
        this.buildNavigation("organizations", query),
        this.buildNavigation("vcs", query),
      ]);
      return { projects, organizations, vcs };
    } catch (error) {
      this.captureDatabaseError("search", error);
      return {
        projects: { names: [] },
        organizations: { names: [] },
        vcs: { names: [] },
      };
    }
  }

  async fetchHeaderText(
    nav: SearchNav,
    basePillar: string,
    item?: string,
  ): Promise<{ title: string; description: string } | undefined> {
    const pillar = basePillar ?? NAV_PILLAR_ORDERING[nav]?.[0];
    if (pillar === "names") {
      const title = NAV_PILLAR_TITLES[nav];
      return {
        title: `${title} ${capitalize(pillar)}`,
        description: `A list of ${lowerCase(title)} ${pillar}${item ? ` called ${item}` : ""}`,
      };
    }
    if (nav === "jobs") {
      const text = this.getJobsPillarText(pillar, item);
      if (text) return text;
    }
    return this.searchRepository.getStoredPillarText(
      nav,
      pillar,
      item ? slugify(item) : undefined,
    );
  }

  async getPillar(
    params: SearchPillarFiltersParams & { pillar: string },
    ecosystem: string | undefined,
  ): Promise<Pillar | undefined> {
    const configs = await this.loadPillarConfigs(params.nav, ecosystem, params);
    return this.buildPillar(configs, params);
  }

  async searchPillar(
    params: SearchPillarParams,
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    try {
      const pillar = params.pillar ?? NAV_PILLAR_ORDERING[params.nav]?.[0];
      if (!pillar)
        return { success: true, message: "Pillar not found", data: null };
      const configs = await this.loadPillarConfigs(
        params.nav,
        ecosystem,
        params,
      );
      const active = this.buildPillar(configs, { ...params, pillar });
      const headerText = await this.fetchHeaderText(
        params.nav,
        pillar,
        params.item,
      );
      if (!active || !headerText) {
        return { success: true, message: "Pillar not found", data: null };
      }
      const wanted = active.items.find(item => slugify(item) === params.item);
      const activeItems = [
        ...(wanted ? [wanted] : []),
        ...active.items
          .filter(item => slugify(item) !== params.item)
          .slice(0, 20),
      ];
      const altPillars = (NAV_PILLAR_ORDERING[params.nav] ?? [])
        .filter(candidate => candidate !== pillar)
        .map(candidate =>
          this.buildPillar(configs, { ...params, pillar: candidate }),
        )
        .filter((candidate): candidate is Pillar => Boolean(candidate))
        .map(candidate => ({
          ...candidate,
          items: candidate.items.slice(0, 20),
        }));
      return {
        success: true,
        message: "Retrieved pillar info successfully",
        data: {
          ...headerText,
          activePillar: { ...active, items: activeItems },
          altPillars,
        },
      };
    } catch (error) {
      this.captureDatabaseError("searchPillar", error);
      return { success: false, message: "Error searching pillar" };
    }
  }

  async searchPillarItems(
    params: SearchPillarItemParams,
    ecosystem: string | undefined,
  ): Promise<PaginatedData<string>> {
    try {
      const pillar = await this.getPillar(params, ecosystem);
      if (!pillar) return this.emptyPage();
      const results = params.query
        ? go(params.query, pillar.items, { threshold: 0.3 }).map(
            result => result.target,
          )
        : pillar.items;
      return results.length
        ? paginate(params.page, params.limit, results)
        : this.emptyPage();
    } catch (error) {
      this.captureDatabaseError("searchPillarItems", error);
      return this.emptyPage();
    }
  }

  async searchPillarSlugs(
    nav: SearchNav,
    ecosystem: string | undefined,
  ): Promise<string[]> {
    const configs = await this.loadPillarConfigs(nav, ecosystem);
    return (NAV_PILLAR_ORDERING[nav] ?? []).flatMap(pillar => {
      const prefix = NAV_PILLAR_SLUG_PREFIX_MAPPINGS[nav]?.[pillar];
      const data = this.buildPillar(configs, {
        nav,
        pillar,
      } as SearchPillarFiltersParams & { pillar: string });
      return prefix
        ? (data?.items ?? []).map(item => `${prefix}-${slugify(item)}`)
        : [];
    });
  }

  async searchJobPillarSlugs(): Promise<string[]> {
    const entries = await this.searchRepository.getJobPillarSitemap(
      this.getPillarDateRange(),
    );
    const slugs = entries.flatMap(entry => {
      const prefix = NAV_PILLAR_SLUG_PREFIX_MAPPINGS.jobs[entry.type];
      if (!prefix) return [];
      return [
        `${prefix}-${entry.type === "booleans" ? entry.key : slugify(entry.key)}`,
      ];
    });
    return [...new Set([...slugs, "b-expertJobs", "b-onboardIntoWeb3"])];
  }

  async searchPillarSitemapSlugs(): Promise<
    { slug: string; lastModified: string; jobCount: number }[]
  > {
    try {
      const entries = await this.searchRepository.getJobPillarSitemap(
        this.getPillarDateRange(),
      );
      return entries.flatMap(entry => {
        const prefix = NAV_PILLAR_SLUG_PREFIX_MAPPINGS.jobs[entry.type];
        if (!prefix || !entry.lastModified) return [];
        return [
          {
            slug: `${prefix}-${entry.type === "booleans" ? entry.key : slugify(entry.key)}`,
            lastModified: new Date(entry.lastModified).toISOString(),
            jobCount: entry.jobCount,
          },
        ];
      });
    } catch (error) {
      this.captureDatabaseError("searchPillarSitemapSlugs", error);
      return [];
    }
  }

  async searchPillarDetailsBySlug(
    nav: SearchNav,
    slug: string,
  ): Promise<ResponseWithOptionalData<{ title: string; description: string }>> {
    const prefix = slug.match(/^([^-]+)/)?.[1];
    const pillar = (NAV_PILLAR_ORDERING[nav] ?? []).find(
      candidate => NAV_PILLAR_SLUG_PREFIX_MAPPINGS[nav][candidate] === prefix,
    );
    const item = slug.match(/^[^-]+-(.*)/)?.[1];
    if (!pillar || !item) return { success: true, message: "Pillar not found" };
    const text = await this.fetchHeaderText(nav, pillar, item);
    return text
      ? {
          success: true,
          message: "Retrieved pillar details successfully",
          data: text,
        }
      : { success: true, message: "Pillar not found" };
  }

  async fetchPillarItemLabels(
    params: FetchPillarItemLabelsInput,
  ): Promise<ResponseWithOptionalData<{ slug: string; label: string }[]>> {
    try {
      const pillars = (params.pillars ?? []).filter(pillar =>
        NAV_PILLAR_ORDERING[params.nav]?.includes(pillar),
      );
      if (!pillars.length) {
        return { success: true, message: "Pillar not found", data: [] };
      }
      const configs = await this.loadPillarConfigs(params.nav);
      const wanted = new Set(params.slugs ?? []);
      const labels = new Map<string, string>();
      for (const pillar of pillars) {
        const data = this.buildPillar(configs, {
          nav: params.nav,
          pillar,
        } as SearchPillarFiltersParams & { pillar: string });
        for (const label of data?.items ?? []) {
          const key = slugify(label);
          if (wanted.has(key)) {
            labels.set(
              key,
              pillar === "collaborationHours"
                ? (this.formatCollaborationHour(label) ?? label)
                : label,
            );
          }
        }
      }
      return {
        success: true,
        message: labels.size
          ? "Retrieved pillar item labels successfully"
          : "No result found",
        data: [...labels].map(([slug, label]) => ({ slug, label })),
      };
    } catch (error) {
      this.captureDatabaseError("fetchPillarItemLabels", error);
      return { success: false, message: "Error fetching pillar item labels" };
    }
  }

  async searchPillarFilters(
    params: SearchPillarFiltersParams,
    ecosystem: string | undefined,
  ): Promise<
    ResponseWithOptionalData<
      (SearchRangeFilter | SingleSelectFilter | MultiSelectFilter)[]
    >
  > {
    try {
      const presets = FILTER_CONFIG_PRESETS[params.nav];
      const configured = NAV_FILTER_CONFIGS[params.nav];
      if (!presets || !configured) {
        return {
          success: true,
          message: "Filter config not found",
          data: null,
        };
      }
      const allConfigs = await this.loadPillarConfigs(
        params.nav,
        ecosystem,
        params,
      );
      const teamSignalsAvailable =
        params.nav !== "organizations" ||
        allConfigs.some(config => config.teamSignalsAvailable === true);
      const filterNames = [
        ...new Set(
          configured.map(
            filter =>
              ({ audits: "hasAudits", hacks: "hasHacks", token: "hasToken" })[
                filter
              ] ?? filter,
          ),
        ),
      ];
      const filters: (
        SearchRangeFilter | SingleSelectFilter | MultiSelectFilter
      )[] = [];
      for (const filter of filterNames) {
        const configs = this.filterConfigs(allConfigs, params, filter);
        const preset = presets[filter];
        if (!preset) continue;
        const visiblePreset = TEAM_FILTER_FIELDS.has(filter)
          ? { ...preset, show: preset.show && teamSignalsAvailable }
          : preset;
        const paramPreset = FILTER_PARAM_KEY_PRESETS[params.nav]?.[filter];
        if (preset.kind === "RANGE") {
          const values = configs
            .map(config => this.asNumber(config[filter]))
            .filter((value): value is number => value !== null)
            .map(value => Math.max(0, value));
          const range = paramPreset as { lowest: string; highest: string };
          filters.push(
            new SearchRangeFilter({
              ...visiblePreset,
              min: {
                value: values.length ? Math.min(...values) : 0,
                paramKey: range.lowest,
              },
              max: {
                value: values.length ? Math.max(...values) : 0,
                paramKey: range.highest,
              },
            }),
          );
          continue;
        }
        if (
          preset.kind === "SINGLE_SELECT" ||
          preset.kind === "ORDER" ||
          preset.kind === "ORDER_BY"
        ) {
          filters.push(
            new SingleSelectFilter({
              ...visiblePreset,
              kind: preset.kind,
              paramKey: paramPreset as string,
              options: preset.options ?? [],
            }),
          );
          continue;
        }
        const labels = this.collectValues(configs, filter).slice(0, 20);
        filters.push(
          new MultiSelectFilter({
            ...visiblePreset,
            paramKey: paramPreset as string,
            options: labels.map(label => ({
              label:
                filter === "collaborationHours"
                  ? (this.formatCollaborationHour(label) ?? label)
                  : label,
              value: filter === "collaborationHours" ? label : slugify(label),
            })),
          }),
        );
      }
      return {
        success: true,
        message: "Retrieved filter configs successfully",
        data: filters,
      };
    } catch (error) {
      this.captureDatabaseError("searchPillarFilters", error);
      return { success: false, message: "Error fetching filter configs" };
    }
  }

  async getPillarPageData(
    slug: string,
    ecosystem?: string,
  ): Promise<ResponseWithOptionalData<PillarPageData>> {
    try {
      const parsed = this.parsePillarSlug(slug);
      if (!parsed)
        return { success: false, message: `Invalid slug format: ${slug}` };
      const rawOrganization =
        parsed.pillarType === "organizations"
          ? await this.searchRepository.getOrganizationPillar(parsed.value)
          : undefined;
      const [hydratedOrganization] = rawOrganization
        ? await this.hydrateTeamOrganizations([rawOrganization])
        : [];
      const organization =
        this.normalizePillarOrganization(hydratedOrganization);
      const header = await this.fetchHeaderText(
        "jobs",
        parsed.pillarType,
        parsed.value,
      );
      if (!header) {
        return { success: true, message: "Pillar not found", data: null };
      }
      const { startDate, endDate } = this.getPillarDateRange();
      const rawJobs = await this.searchRepository.getPillarJobs({
        pillarType: parsed.pillarType,
        value: parsed.value,
        ecosystem,
        startDate,
        endDate,
        // Match the maximum public /jobs/list page size. The smaller
        // pillar-only cap silently dropped eligible jobs from the SEO page.
        limit: 100,
      });
      const jobs = (await this.hydratePillarJobs(rawJobs)).map(job =>
        this.normalizePillarJob(job),
      );
      const canonicalClassificationPillar =
        parsed.pillarType === "classifications" &&
        CANONICAL_JOB_CLASSIFICATIONS.some(
          classification => classification.pillarSlug === slug,
        );
      if (!jobs.length && !organization && !canonicalClassificationPillar) {
        return {
          success: true,
          message: "No jobs found for this pillar",
          data: null,
        };
      }
      return {
        success: true,
        message: "Retrieved pillar page data",
        data: {
          ...header,
          jobs,
          indexing: jobs.length > 0 ? "index" : "noindex",
          hasEligibleOpenJobs: jobs.length > 0,
          organization,
          suggestedPillars: this.deriveSuggestedPillars(
            jobs,
            parsed.pillarType,
            parsed.value,
          ),
        },
      };
    } catch (error) {
      this.captureDatabaseError("getPillarPageData", error);
      return { success: false, message: "Error retrieving pillar page data" };
    }
  }

  resolveLocationPillar(
    value: string,
  ): Promise<ResolvedPlacePillar | undefined> {
    return this.searchRepository.resolvePlacePillar(value);
  }

  async getSkillSuggestions(
    params: SkillSuggestionsInput,
  ): Promise<ResponseWithOptionalData<SkillSuggestionsData>> {
    try {
      const page = params.page ?? 1;
      const limit = params.limit ?? 10;
      const { startDate, endDate } = this.getPillarDateRange();
      const items = await this.searchRepository.getSkillSuggestions({
        query: params.q?.trim() || null,
        startDate,
        endDate,
        offset: (page - 1) * limit,
        limit: limit + 1,
      });
      const unique = [...new Map(items.map(item => [item.id, item])).values()];
      return {
        success: true,
        message: "Retrieved skill suggestions successfully",
        data: {
          items: unique.slice(0, limit),
          page,
          hasMore: unique.length > limit,
        },
      };
    } catch (error) {
      this.captureDatabaseError("getSkillSuggestions", error);
      return {
        success: false,
        message: "Failed to retrieve skill suggestions",
      };
    }
  }

  async getJobSuggestions(
    params: JobSuggestionsInput,
  ): Promise<SuggestionsResponse> {
    try {
      const query = params.q?.trim() || null;
      const page = params.page ?? 1;
      const limit = params.limit ?? 10;
      const { startDate, endDate } = this.getPillarDateRange();
      const available = query
        ? await this.searchRepository.getSuggestionGroups(
            query,
            startDate,
            endDate,
          )
        : [...SUGGESTION_GROUPS];
      const groups: GroupInfo[] = SUGGESTION_GROUPS.filter(group =>
        available.includes(group),
      ).map(id => ({ id, label: this.groupLabels[id] }));
      const requested = params.group;
      const activeGroup =
        requested && available.includes(requested)
          ? requested
          : available.includes("jobs")
            ? "jobs"
            : (available[0] ?? "jobs");
      const items = await this.searchRepository.getSuggestionItems({
        group: activeGroup,
        query,
        startDate,
        endDate,
        offset: (page - 1) * limit,
        limit: limit + 1,
      });
      const unique = [...new Map(items.map(item => [item.id, item])).values()];
      const normalized =
        activeGroup === "classifications"
          ? unique.map(item => ({
              ...item,
              label: JOB_CLASSIFICATION_LABELS.get(item.id) ?? item.label,
            }))
          : unique;
      return {
        groups,
        activeGroup,
        items: normalized.slice(0, limit),
        page,
        hasMore: normalized.length > limit,
      };
    } catch (error) {
      this.captureDatabaseError("getJobSuggestions", error);
      return {
        groups: [],
        activeGroup: params.group || "jobs",
        items: [],
        page: params.page || 1,
        hasMore: false,
      };
    }
  }

  async getSitemapJobs(): Promise<ResponseWithOptionalData<SitemapJob[]>> {
    try {
      const jobs = await this.searchRepository.getSitemapJobs();
      return {
        success: true,
        message: `Found ${jobs.length} jobs for sitemap`,
        data: jobs,
      };
    } catch (error) {
      this.captureDatabaseError("getSitemapJobs", error);
      return { success: false, message: "Error fetching sitemap jobs" };
    }
  }

  private async buildNavigation(
    nav: SearchNav,
    query?: string | null,
  ): Promise<SearchResultNav> {
    const facets = await this.searchRepository.getNavigationFacets(nav, query);
    const result: SearchResultNav = { names: [] };
    for (const pillar of NAV_PILLAR_ORDERING[nav] ?? ["names"]) {
      result[pillar] = [];
    }
    const seen = new Set<string>();
    for (const facet of facets) {
      const segment = navigationLinkSegments[nav]?.[facet.pillar];
      if (!segment) continue;
      const key = `${facet.pillar}:${slugify(facet.label)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const base = nav === "vcs" ? "projects" : nav;
      result[facet.pillar] ??= [];
      result[facet.pillar].push({
        value: facet.label,
        link: `/${base}/${segment}/${slugify(facet.label)}`,
      });
    }
    return result;
  }

  private async loadPillarConfigs(
    nav: SearchNav,
    ecosystem?: string,
    filters: TeamFilterInput = {},
  ): Promise<FilterConfig[]> {
    void filters;
    const configs = await this.searchRepository.getPillarConfigs(
      nav,
      ecosystem,
    );
    if (nav !== "organizations") return configs;
    const organizationIds = configs.flatMap(config =>
      typeof config.organizationId === "string" ? [config.organizationId] : [],
    );
    if (!organizationIds.length) return configs;
    const state =
      await this.teamIntelligence.getSummaryStateById(organizationIds);
    const summaries = state.summaries;
    return configs.map(config => {
      const organizationId =
        typeof config.organizationId === "string"
          ? config.organizationId
          : null;
      const summary = organizationId
        ? summaries.get(organizationId)
        : undefined;
      return {
        ...config,
        teamSignalsAvailable: state.available,
        currentMaintainers: summary?.currentMaintainerCount ?? null,
        activeLeads: summary?.activeLeadCount ?? null,
        newActiveLeads:
          summary?.newActiveLeadCount === null ||
          summary?.newActiveLeadCount === undefined
            ? null
            : summary.newActiveLeadCount > 0,
        steppedDownLeads:
          summary?.steppedDownLeadCount === null ||
          summary?.steppedDownLeadCount === undefined
            ? null
            : summary.steppedDownLeadCount > 0,
        movedLeads:
          summary?.movedLeadCount === null ||
          summary?.movedLeadCount === undefined
            ? null
            : summary.movedLeadCount > 0,
        earlyLeadDepartures:
          summary?.earlyLeadDepartureCount === null ||
          summary?.earlyLeadDepartureCount === undefined
            ? null
            : summary.earlyLeadDepartureCount > 0,
      };
    });
  }

  private async hydrateTeamOrganizations(
    organizations: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const organizationIds = organizations.flatMap(organization =>
      typeof organization.orgId === "string" ? [organization.orgId] : [],
    );
    const summaries = await this.loadTeamSummaries(organizationIds, false);
    return organizations.map(organization => {
      const organizationId =
        typeof organization.orgId === "string" ? organization.orgId : null;
      const summary = organizationId
        ? summaries.get(organizationId)
        : undefined;
      return {
        ...organization,
        teamCoverageStatus: summary?.coverageStatus ?? null,
        teamSignalsAsOf: summary?.asOf ?? null,
        currentMaintainerCount: summary?.currentMaintainerCount ?? null,
        activeLeadCount: summary?.activeLeadCount ?? null,
        newActiveLeadCount: summary?.newActiveLeadCount ?? null,
        steppedDownLeadCount: summary?.steppedDownLeadCount ?? null,
        movedLeadCount: summary?.movedLeadCount ?? null,
        earlyLeadDepartureCount: summary?.earlyLeadDepartureCount ?? null,
      };
    });
  }

  private async hydratePillarJobs(
    jobs: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const organizations = jobs.flatMap(job =>
      job.organization && typeof job.organization === "object"
        ? [job.organization as Record<string, unknown>]
        : [],
    );
    const hydratedOrganizations =
      await this.hydrateTeamOrganizations(organizations);
    let index = 0;
    return jobs.map(job => {
      if (!job.organization || typeof job.organization !== "object") {
        return job;
      }
      return { ...job, organization: hydratedOrganizations[index++] };
    });
  }

  private async loadTeamSummaries(
    organizationIds: string[],
    required: boolean,
  ): Promise<Map<string, OrganizationTeamSummary>> {
    try {
      return await this.teamIntelligence.getSummariesById(organizationIds);
    } catch (error) {
      if (required) throw error;
      Sentry.captureException(error);
      this.logger.error(
        `SearchService::loadTeamSummaries ${(error as Error).message}`,
      );
      return new Map();
    }
  }

  private buildPillar(
    allConfigs: FilterConfig[],
    params: SearchPillarFiltersParams & { pillar: string },
  ): Pillar | undefined {
    if (!NAV_PILLAR_ORDERING[params.nav]?.includes(params.pillar)) {
      return undefined;
    }
    const configs = this.filterConfigs(allConfigs, params, params.pillar);
    return {
      slug: params.pillar,
      label: NAV_FILTER_LABEL_MAPPINGS[params.nav]?.[params.pillar],
      items: this.collectValues(configs, params.pillar),
    };
  }

  private filterConfigs(
    configs: FilterConfig[],
    params: SearchPillarFiltersParams,
    excludedField?: string,
  ): FilterConfig[] {
    const values = params as unknown as Record<string, unknown>;
    const teamSignalsAvailable = configs.some(
      config => config.teamSignalsAvailable === true,
    );
    const listFields = [
      "names",
      "chains",
      "categories",
      "locations",
      "investors",
      "fundingRounds",
      "fundingStages",
      "tags",
      "classifications",
      "commitments",
      "locationTypes",
      "timezones",
      "collaborationHours",
      "organizations",
      "projects",
      "ecosystems",
      "seniority",
    ];
    return configs.filter(config => {
      for (const field of listFields) {
        if (field === excludedField) continue;
        const requested = values[field];
        if (!Array.isArray(requested) || !requested.length) continue;
        const available = this.asStringArray(config[field]).map(slugify);
        if (
          !requested.some(value => available.includes(slugify(String(value))))
        ) {
          return false;
        }
      }
      for (const [field, mapping] of Object.entries(
        rangeFilters[params.nav] ?? {},
      )) {
        if (field === excludedField) continue;
        if (TEAM_FILTER_FIELDS.has(field) && !teamSignalsAvailable) continue;
        const knownValue = this.asNumber(config[field]);
        const minimum = this.asNumber(values[mapping.minimum]);
        const maximum = this.asNumber(values[mapping.maximum]);
        if (
          TEAM_FILTER_FIELDS.has(field) &&
          knownValue === null &&
          (minimum !== null || maximum !== null)
        ) {
          return false;
        }
        const value = knownValue ?? 0;
        if (minimum !== null && value < minimum) return false;
        if (maximum !== null && value > maximum) {
          return false;
        }
      }
      for (const [field, parameter] of Object.entries(
        booleanFilters[params.nav] ?? {},
      )) {
        if (field === excludedField) continue;
        if (TEAM_FILTER_FIELDS.has(field) && !teamSignalsAvailable) continue;
        const requested = values[parameter];
        if (typeof requested === "boolean" && config[field] !== requested) {
          return false;
        }
      }
      return true;
    });
  }

  private collectValues(configs: FilterConfig[], field: string): string[] {
    const counts = new Map<string, { label: string; count: number }>();
    for (const config of configs) {
      for (const label of this.asStringArray(config[field])) {
        if (!isValidFilterConfig(label)) continue;
        const key = slugify(label);
        const current = counts.get(key);
        counts.set(key, { label, count: (current?.count ?? 0) + 1 });
      }
    }
    return [...counts.values()]
      .sort(
        (first, second) =>
          second.count - first.count || first.label.localeCompare(second.label),
      )
      .map(value => value.label);
  }

  private parsePillarSlug(
    slug: string,
  ): { pillarType: string; value: string; prefix: string } | null {
    const prefix = slug.match(/^([^-]+)/)?.[1];
    const value = slug.match(/^[^-]+-(.*)/)?.[1];
    if (!prefix || !value) return null;
    const pillarType = Object.entries(
      NAV_PILLAR_SLUG_PREFIX_MAPPINGS.jobs,
    ).find(([, candidate]) => candidate === prefix)?.[0];
    return pillarType ? { pillarType, value, prefix } : null;
  }

  private normalizePillarJob(raw: Record<string, unknown>): PillarJob {
    const organization = raw.organization as Record<string, unknown> | null;
    const workArrangement = this.normalizePillarWorkArrangement(
      raw.workArrangement,
    );
    const seniority =
      { "1": "Intern", "2": "Junior", "3": "Senior", "4": "Lead", "5": "Head" }[
        String(raw.seniority ?? "")
      ] ?? (raw.seniority as string | null);
    return {
      ...(raw as unknown as PillarJob),
      seniority,
      salary: this.asNumber(raw.salary),
      minimumSalary: this.asNumber(raw.minimumSalary),
      maximumSalary: this.asNumber(raw.maximumSalary),
      timestamp: this.asNumber(raw.timestamp) ?? 0,
      featureStartDate: this.asNumber(raw.featureStartDate),
      featureEndDate: this.asNumber(raw.featureEndDate),
      access: raw.access === "protected" ? "protected" : "public",
      featured: Boolean(raw.featured),
      onboardIntoWeb3: Boolean(raw.onboardIntoWeb3),
      workArrangement,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter(
            tag =>
              typeof tag === "object" &&
              tag !== null &&
              Boolean((tag as Record<string, unknown>).name),
          )
        : [],
      organization: organization
        ? ({
            ...organization,
            headcountEstimate: this.asNumber(organization.headcountEstimate),
            fundingRounds: Array.isArray(organization.fundingRounds)
              ? organization.fundingRounds.map(round => ({
                  ...(round as Record<string, unknown>),
                  date: this.asNumber((round as Record<string, unknown>).date),
                  raisedAmount: this.asNumber(
                    (round as Record<string, unknown>).raisedAmount,
                  ),
                }))
              : [],
            investors: Array.isArray(organization.investors)
              ? organization.investors
              : [],
          } as unknown as PillarJob["organization"])
        : null,
    };
  }

  private normalizePillarWorkArrangement(
    raw: unknown,
  ): PillarJob["workArrangement"] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const arrangement = raw as Record<string, unknown>;
    const classification =
      typeof arrangement.classification === "string"
        ? arrangement.classification
        : "unstated";
    const normalizeOptions = (key: string, mode: string) =>
      Array.isArray(arrangement[key])
        ? arrangement[key]
            .filter(
              (option): option is Record<string, unknown> =>
                Boolean(option) &&
                typeof option === "object" &&
                !Array.isArray(option),
            )
            .map(option => ({
              ...option,
              classification:
                typeof option.classification === "string"
                  ? option.classification
                  : classification,
              mode,
            }))
        : [];

    return {
      ...arrangement,
      classification,
      fullyRemote:
        typeof arrangement.fullyRemote === "boolean"
          ? arrangement.fullyRemote
          : null,
      remoteOptions: normalizeOptions("remoteOptions", "remote"),
      hybridOptions: normalizeOptions("hybridOptions", "hybrid"),
      onsiteOptions: normalizeOptions("onsiteOptions", "onsite"),
    } as PillarJob["workArrangement"];
  }

  private normalizePillarOrganization(
    raw: Record<string, unknown> | undefined,
  ): PillarPageOrg | null {
    if (!raw) return null;
    return {
      ...(raw as unknown as PillarPageOrg),
      headcountEstimate: this.asNumber(raw.headcountEstimate),
      aliases: this.asStringArray(raw.aliases),
      projects: Array.isArray(raw.projects)
        ? (raw.projects as PillarPageOrg["projects"])
        : [],
      fundingRounds: Array.isArray(raw.fundingRounds)
        ? (raw.fundingRounds.map(round => ({
            ...(round as Record<string, unknown>),
            date: this.asNumber((round as Record<string, unknown>).date) ?? 0,
            raisedAmount: this.asNumber(
              (round as Record<string, unknown>).raisedAmount,
            ),
          })) as PillarPageOrg["fundingRounds"])
        : [],
      investors: Array.isArray(raw.investors)
        ? (raw.investors as PillarPageOrg["investors"])
        : [],
    };
  }

  private getJobsPillarText(
    pillar: string,
    item?: string,
  ): { title: string; description: string } | null {
    if (!item) return null;
    const displayName = this.formatDisplayName(item);
    switch (pillar) {
      case "organizations":
        return {
          title: `${displayName} Jobs - Web3 & Crypto Careers`,
          description: `Explore crypto jobs at ${displayName}. Join the ${displayName} team and build the future of web3. Browse open positions and apply today.`,
        };
      case "seniority":
        return this.getSeniorityText(item, displayName);
      case "investors":
        return {
          title: `Jobs at ${displayName} Portfolio Companies`,
          description: `Find web3 jobs at companies backed by ${displayName}. Join crypto startups and blockchain projects in the ${displayName} portfolio.`,
        };
      case "fundingRounds":
        return {
          title: `${displayName} Crypto Jobs - Web3 Opportunities`,
          description: `Find web3 jobs at ${displayName} funded companies. Join crypto startups and blockchain projects at this funding stage.`,
        };
      case "fundingStages":
        return {
          title: `${displayName} Crypto Startup Jobs`,
          description: `Find web3 jobs at companies whose current recognized equity stage is ${displayName}. Browse open roles and apply on Jobstash.`,
        };
      case "classifications":
        return {
          title: `${displayName} Jobs - Web3 & Crypto Careers`,
          description: `Find ${displayName.toLowerCase()} jobs in web3 and crypto. Browse blockchain positions and apply today.`,
        };
      case "tags":
        return {
          title: `${displayName} Jobs - Web3 & Crypto Careers`,
          description: `Explore ${displayName} jobs in blockchain and crypto. Find positions requiring ${displayName} skills.`,
        };
      case "locations":
        return {
          title: `Web3 Jobs in ${displayName} - Crypto Careers`,
          description: `Find web3 and crypto jobs in ${displayName}. Browse blockchain positions in your area.`,
        };
      case "commitments":
        return {
          title: `${displayName} Web3 Jobs - Crypto Careers`,
          description: `Browse ${displayName.toLowerCase()} web3 positions. Find crypto jobs that match your schedule.`,
        };
      case "locationTypes":
        return {
          title: `${displayName} Web3 Jobs - Crypto Careers`,
          description: `Find ${displayName.toLowerCase()} web3 positions. Explore crypto jobs with flexible work arrangements.`,
        };
      case "timezones":
        return {
          title: `${displayName} Timezone Web3 Jobs`,
          description: `Find web3 and crypto jobs compatible with ${displayName}. Browse remote roles by timezone availability.`,
        };
      case "collaborationHours": {
        const hour = this.formatCollaborationHour(item);
        if (!hour) return null;
        return {
          title: `${hour} Team Collaboration Jobs`,
          description: `Browse web3 and crypto jobs where recent team activity suggests collaboration around ${hour}. This optional team-level signal is not an employer work requirement.`,
        };
      }
      case "booleans":
        return this.getBooleanPillarText(item);
      default:
        return {
          title: `${displayName} Web3 Jobs - Crypto Careers`,
          description: `Explore web3 jobs related to ${displayName.toLowerCase()}. Find crypto and blockchain opportunities.`,
        };
    }
  }

  private getBooleanPillarText(
    filterName: string,
  ): { title: string; description: string } | null {
    return (
      {
        expertJobs: {
          title: "Urgently Hiring Jobs",
          description:
            "These companies are actively hiring right now. Apply today for a higher chance of landing your next role.",
        },
        onboardIntoWeb3: {
          title: "Web3 Entry Level Jobs",
          description:
            "Jobs that welcome newcomers with onboarding support to help you transition into crypto and blockchain.",
        },
      }[filterName] ?? null
    );
  }

  private formatDisplayName(slug: string): string {
    return slug
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private getSeniorityText(
    item: string,
    displayName: string,
  ): { title: string; description: string } {
    return (
      {
        intern: {
          title: "Web3 Internships - Entry Level Crypto Jobs",
          description:
            "Discover web3 internship opportunities to kickstart your crypto career. Gain hands-on blockchain experience at top companies hiring interns.",
        },
        junior: {
          title: "Junior Web3 Jobs - Entry Level Crypto Careers",
          description:
            "Find junior web3 positions perfect for early career professionals. Explore entry-level crypto roles with growth potential in blockchain.",
        },
        senior: {
          title: "Senior Web3 Jobs - Experienced Crypto Roles",
          description:
            "Browse senior web3 positions for experienced professionals. Find crypto roles that leverage your blockchain expertise.",
        },
        lead: {
          title: "Lead Web3 Jobs - Crypto Leadership Positions",
          description:
            "Explore lead positions in web3. Find crypto roles where you can mentor teams, drive blockchain architecture, and shape product direction.",
        },
        head: {
          title: "Head of Web3 Jobs - Executive Crypto Careers",
          description:
            "Discover executive positions in web3. Lead departments, set strategic direction, and make high-impact decisions at crypto companies.",
        },
      }[item.toLowerCase()] ?? {
        title: `${displayName} Web3 Jobs - Crypto Careers`,
        description: `Find ${displayName.toLowerCase()}-level web3 positions. Explore crypto opportunities matching your experience level.`,
      }
    );
  }

  private deriveSuggestedPillars(
    jobs: PillarJob[],
    currentPillarType: string,
    currentValue: string,
  ): SuggestedPillar[] {
    const totalBudget = 9;
    const totalJobs = jobs.length;
    const usePenalty = totalJobs > 3;
    type ExtractedPillar = { label: string; key: string };
    const configs = [
      {
        pillarType: "tags",
        prefix: "/t-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          job.tags.map(tag => ({ label: tag.name, key: tag.normalizedName })),
      },
      {
        pillarType: "organizations",
        prefix: "/o-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          job.organization
            ? [
                {
                  label: job.organization.name,
                  key: job.organization.normalizedName,
                },
              ]
            : [],
      },
      {
        pillarType: "classifications",
        prefix: "/cl-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          job.classification
            ? [{ label: job.classification, key: slugify(job.classification) }]
            : [],
      },
      {
        pillarType: "locations",
        prefix: "/l-",
        extract: (job: PillarJob): ExtractedPillar[] => [
          ...(job.location
            ? [{ label: job.location, key: slugify(job.location) }]
            : []),
          ...(job.availability ?? []).flatMap(item => {
            const place = item.placeName ?? item.placeText;
            return place ? [{ label: place, key: slugify(place) }] : [];
          }),
        ],
      },
      {
        pillarType: "timezones",
        prefix: "/tz-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          (job.availability ?? []).flatMap(item =>
            item.timezone
              ? [{ label: item.timezone, key: slugify(item.timezone) }]
              : [],
          ),
      },
      {
        pillarType: "collaborationHours",
        prefix: "/ct-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          (job.collaborationHours ?? []).flatMap(key => {
            const label = this.formatCollaborationHour(key);
            return label ? [{ label, key }] : [];
          }),
      },
      {
        pillarType: "investors",
        prefix: "/i-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          (job.organization?.investors ?? []).map(investor => ({
            label: investor.name,
            key: investor.normalizedName,
          })),
      },
      {
        pillarType: "fundingRounds",
        prefix: "/fr-",
        extract: (job: PillarJob): ExtractedPillar[] =>
          (job.organization?.fundingRounds ?? []).flatMap(round =>
            round.roundName
              ? [{ label: round.roundName, key: slugify(round.roundName) }]
              : [],
          ),
      },
    ];
    type Candidate = {
      label: string;
      key: string;
      prefix: string;
      score: number;
      pillarType: string;
    };
    const groups = configs.map(config => {
      const counts = new Map<string, { label: string; count: number }>();
      for (const job of jobs) {
        for (const item of config.extract(job)) {
          if (
            !item.key ||
            (config.pillarType === currentPillarType &&
              item.key === currentValue)
          ) {
            continue;
          }
          const current = counts.get(item.key);
          counts.set(item.key, {
            label: item.label,
            count: (current?.count ?? 0) + 1,
          });
        }
      }
      const candidates: Candidate[] = [...counts].map(
        ([key, { label, count }]) => ({
          key,
          label,
          prefix: config.prefix,
          pillarType: config.pillarType,
          score: usePenalty ? count * (1 - count / totalJobs) : count,
        }),
      );
      candidates.sort(
        (first, second) =>
          second.score - first.score || first.label.localeCompare(second.label),
      );
      return { pillarType: config.pillarType, candidates };
    });
    const selected = [
      ...(groups
        .find(group => group.pillarType === currentPillarType)
        ?.candidates.slice(0, 2) ?? []),
    ];
    const others = groups.filter(
      group =>
        group.pillarType !== currentPillarType && group.candidates.length,
    );
    for (const group of others) {
      if (selected.length >= totalBudget) break;
      selected.push(group.candidates[0]);
    }
    let index = 1;
    while (selected.length < totalBudget) {
      let added = false;
      for (const group of others) {
        if (selected.length >= totalBudget) break;
        if (index < 2 && group.candidates[index]) {
          selected.push(group.candidates[index]);
          added = true;
        }
      }
      if (!added) break;
      index++;
    }
    return selected.map(candidate => ({
      label: candidate.label,
      href: `${candidate.prefix}${candidate.key}`,
    }));
  }

  // Pillar pages and /jobs/list must interpret "past 3 months" identically.
  private formatCollaborationHour(key: string): string | null {
    const match = key.match(/^utc-(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    return hour >= 0 && hour <= 23 ? `${match[1]}:00 UTC` : null;
  }

  private getPillarDateRange(): { startDate: number; endDate: number } {
    return publicationDateRangeGenerator("past-3-months");
  }

  private marketApiSlug(slug: string): string {
    if (slug === "urgently-hiring") return "b-expertJobs";
    if (slug === "crypto-beginner-jobs") return "b-onboardIntoWeb3";
    return slug;
  }

  private marketRangeDays(range: string): number | null {
    if (range === "max") return null;
    const days = Number(range);
    return [30, 90, 365].includes(days) ? days : 365;
  }

  private marketRangeKey(range: string): "90" | "365" | "max" {
    return range === "90" || range === "365" ? range : "max";
  }

  private marketLabel(kind: string, label: string): string {
    if (
      !new Set(["classifications", "commitments", "locationTypes"]).has(kind)
    ) {
      return label;
    }
    const normalized = toHeaderCase(label);
    const establishedLabels: Record<string, string> = {
      Ai: "AI",
      Bizdev: "Business Development",
      Devops: "DevOps",
      Devrel: "Developer Relations",
      "Fully Remote": "100% Remote",
      Fullstack: "Full Stack",
    };
    return establishedLabels[normalized] ?? normalized;
  }

  private marketEvidenceLevel(
    dimensionKind: string,
    sampleCount: number,
    employerCount: number,
    maxEmployerShare: number | null = null,
    observedMonthCount: number | null = null,
  ): JobMarketEvidenceLevel {
    if (dimensionKind === "organizations") {
      if (sampleCount >= 10) return "strong";
      return sampleCount >= 3 ? "limited" : "insufficient";
    }
    if (sampleCount < 3 || employerCount < 2) return "insufficient";
    const strong =
      sampleCount >= 20 &&
      employerCount >= 10 &&
      (maxEmployerShare === null || maxEmployerShare <= 0.2) &&
      (observedMonthCount === null || observedMonthCount >= 3);
    return strong ? "strong" : "limited";
  }

  private async marketPillarFilter(
    kind: string,
    slug: string,
  ): Promise<JobMarketFilter | null> {
    const mappings: Record<string, JobMarketFilter["paramKey"]> = {
      tags: "tags",
      classifications: "classifications",
      commitments: "commitments",
      locationTypes: "workModes",
      organizations: "organizations",
      investors: "investors",
      fundingRounds: "fundingRounds",
      fundingStages: "fundingStages",
      timezones: "timezones",
      collaborationHours: "collaborationHours",
    };
    const prefix = slug.indexOf("-");
    const value = prefix >= 0 ? slug.slice(prefix + 1) : slug;
    if (kind === "seniority") {
      const seniority = {
        intern: "1",
        junior: "2",
        senior: "3",
        lead: "4",
        head: "5",
      }[value];
      return seniority ? { paramKey: "seniority", value: seniority } : null;
    }
    if (kind === "locations") {
      const place = await this.searchRepository.resolvePlacePillar(value);
      if (!place) return null;
      const paramKey: JobMarketFilter["paramKey"] =
        place.kind === "city"
          ? "cities"
          : place.kind === "country"
            ? "countries"
            : place.kind === "continent"
              ? "continents"
              : "regions";
      return { paramKey, value: place.canonicalSlug };
    }
    const paramKey = mappings[kind];
    return paramKey ? { paramKey, value } : null;
  }

  private marketPoint(row: JobMarketMetricRow): JobMarketPoint {
    const sampleCount = Number(row.salarySampleCount);
    const employerCount = Number(row.salaryEmployerCount ?? 0);
    const evidenceLevel = this.marketEvidenceLevel(
      row.kind,
      sampleCount,
      employerCount,
    );
    const publishable = evidenceLevel !== "insufficient";
    const reliable = evidenceLevel === "strong";
    const salary: JobMarketSalary = {
      medianMonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryMedianMonthlyUsd)
        : null,
      meanMonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryMeanMonthlyUsd)
        : null,
      p25MonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryP25MonthlyUsd)
        : null,
      p75MonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryP75MonthlyUsd)
        : null,
      sampleCount,
      coverage: Math.round(Number(row.salaryCoverage) * 10_000) / 10_000,
      evidenceLevel,
      reliable,
    };
    return {
      date: row.sampleDate,
      activeJobs: Number(row.activeJobs),
      hiringCompanies: Number(row.hiringCompanies),
      newJobs: Number(row.newJobs),
      salary,
      provenance: row.source,
      sampledAt: new Date(row.sampledAt).toISOString(),
    };
  }

  private marketTicker(
    row: JobMarketMetricRow,
    marketRow?: JobMarketMetricRow,
    history: JobMarketPoint[] = [],
  ): JobMarketTicker {
    const current = this.marketPoint(row);
    const currentJobs = Number(row.currentWindowJobs ?? 0);
    const previousJobs = Number(row.previousWindowJobs ?? 0);
    const demand = this.marketDemand(row);
    const marketDemand = marketRow ? this.marketDemand(marketRow) : null;
    const marketRelativeScore =
      demand.activeJobsChange === null ||
      marketDemand?.activeJobsChange === null
        ? null
        : row.slug === "market"
          ? 0
          : Math.round(
              (demand.activeJobsChange - marketDemand.activeJobsChange) * 10,
            ) / 10;
    const momentum = this.marketMomentumFromWindows(
      currentJobs,
      previousJobs,
      marketRelativeScore,
      demand.activeJobsChange,
      demand.hiringCompaniesChange,
    );
    return {
      kind: row.kind,
      slug: row.slug,
      label: this.marketLabel(row.kind, row.label),
      current,
      history,
      momentum,
      activity: this.marketActivity(row, marketRow),
      eligibleMover:
        row.kind === "classifications" &&
        current.activeJobs >= 20 &&
        current.hiringCompanies >= 5 &&
        marketRelativeScore !== null &&
        Math.abs(marketRelativeScore) >= 5,
    };
  }

  private marketMomentum(history: JobMarketPoint[]): JobMarketMomentum {
    const latest = history
      .slice(-7)
      .reduce((sum, point) => sum + point.newJobs, 0);
    const previous = history
      .slice(-14, -7)
      .reduce((sum, point) => sum + point.newJobs, 0);
    return this.marketMomentumFromWindows(latest, previous);
  }

  private marketMomentumFromWindows(
    currentJobs: number,
    previousJobs: number,
    marketRelativeScore: number | null = null,
    activeJobsChange: number | null = null,
    hiringCompaniesChange: number | null = null,
  ): JobMarketMomentum {
    const absoluteChange = currentJobs - previousJobs;
    if (currentJobs + previousJobs < 5) {
      return {
        periodDays: 7,
        currentJobs,
        previousJobs,
        absoluteChange,
        percentChange: null,
        direction: "insufficient",
        marketRelativeScore,
        activeJobsChange,
        hiringCompaniesChange,
      };
    }
    if (marketRelativeScore === null && previousJobs === 0 && currentJobs > 0) {
      return {
        periodDays: 7,
        currentJobs,
        previousJobs,
        absoluteChange,
        percentChange: null,
        direction: "new",
        marketRelativeScore,
        activeJobsChange,
        hiringCompaniesChange,
      };
    }
    const percentChange =
      Math.round((absoluteChange / Math.max(previousJobs, 1)) * 1_000) / 10;
    return {
      periodDays: 7,
      currentJobs,
      previousJobs,
      absoluteChange,
      percentChange,
      direction:
        percentChange >= 5 ? "up" : percentChange <= -5 ? "down" : "flat",
      marketRelativeScore,
      activeJobsChange,
      hiringCompaniesChange,
    };
  }

  private marketDemand(row: {
    currentActiveJobs?: string | null;
    baselineActiveJobs?: string | null;
    currentHiringCompanies?: string | null;
    baselineHiringCompanies?: string | null;
  }): {
    activeJobsChange: number | null;
    hiringCompaniesChange: number | null;
  } {
    const percent = (
      current?: string | null,
      baseline?: string | null,
    ): number | null => {
      const currentNumber = this.asNumber(current);
      const baselineNumber = this.asNumber(baseline);
      if (
        currentNumber === null ||
        baselineNumber === null ||
        baselineNumber <= 0
      )
        return null;
      return (currentNumber / baselineNumber - 1) * 100;
    };
    const activeJobsChange = percent(
      row.currentActiveJobs,
      row.baselineActiveJobs,
    );
    const hiringCompaniesChange = percent(
      row.currentHiringCompanies,
      row.baselineHiringCompanies,
    );
    return {
      activeJobsChange:
        activeJobsChange === null
          ? null
          : Math.round(activeJobsChange * 10) / 10,
      hiringCompaniesChange:
        hiringCompaniesChange === null
          ? null
          : Math.round(hiringCompaniesChange * 10) / 10,
    };
  }

  private marketChange(
    current: number | null,
    baseline: number | null,
    minimumTotal = 1,
  ): JobMarketChangeMetric {
    const safeCurrent = current ?? 0;
    const safeBaseline = baseline ?? 0;
    const absoluteChange = safeCurrent - safeBaseline;
    if (
      current === null ||
      baseline === null ||
      safeCurrent + safeBaseline < minimumTotal
    ) {
      return {
        current: safeCurrent,
        baseline: safeBaseline,
        absoluteChange,
        percentChange: null,
        direction: "insufficient",
      };
    }
    if (safeBaseline === 0 && safeCurrent > 0) {
      return {
        current: safeCurrent,
        baseline: safeBaseline,
        absoluteChange,
        percentChange: null,
        direction: "new",
      };
    }
    const percentChange =
      Math.round((absoluteChange / Math.max(safeBaseline, 1)) * 1_000) / 10;
    return {
      current: safeCurrent,
      baseline: safeBaseline,
      absoluteChange,
      percentChange,
      direction:
        percentChange >= 5 ? "up" : percentChange <= -5 ? "down" : "flat",
    };
  }

  private marketActivity(
    row: JobMarketMetricRow,
    marketRow?: JobMarketMetricRow,
  ): JobMarketActivity {
    const newPostings = this.marketChange(
      Number(row.currentWindowJobs ?? 0),
      Number(row.previousWindowJobs ?? 0),
      5,
    );
    const openInventory = this.marketChange(
      this.asNumber(row.currentActiveJobs),
      this.asNumber(row.baselineActiveJobs),
    );
    const hiringEmployers = this.marketChange(
      this.asNumber(row.currentHiringCompanies),
      this.asNumber(row.baselineHiringCompanies),
    );
    const marketNew = marketRow
      ? this.marketChange(
          Number(marketRow.currentWindowJobs ?? 0),
          Number(marketRow.previousWindowJobs ?? 0),
          5,
        )
      : null;
    const marketOpen = marketRow
      ? this.marketChange(
          this.asNumber(marketRow.currentActiveJobs),
          this.asNumber(marketRow.baselineActiveJobs),
        )
      : null;
    const marketEmployers = marketRow
      ? this.marketChange(
          this.asNumber(marketRow.currentHiringCompanies),
          this.asNumber(marketRow.baselineHiringCompanies),
        )
      : null;
    const difference = (
      selected: number | null,
      market: number | null | undefined,
    ): number | null =>
      selected === null || market === null || market === undefined
        ? null
        : Math.round((selected - market) * 10) / 10;
    return {
      newPostings: {
        ...newPostings,
        currentWindowDays: 7,
        baselineWindowDays: 7,
      },
      openInventory: {
        ...openInventory,
        currentWindowDays: 7,
        baselineWindowDays: 28,
      },
      hiringEmployers: {
        ...hiringEmployers,
        currentWindowDays: 7,
        baselineWindowDays: 28,
      },
      marketComparison: {
        newPostingsPercentagePoints: difference(
          newPostings.percentChange,
          marketNew?.percentChange,
        ),
        openInventoryPercentagePoints: difference(
          openInventory.percentChange,
          marketOpen?.percentChange,
        ),
        hiringEmployersPercentagePoints: difference(
          hiringEmployers.percentChange,
          marketEmployers?.percentChange,
        ),
      },
    };
  }

  private marketCompensation(
    row: JobMarketGeographyRow,
  ): JobMarketCompensation {
    const sampleCount = Number(row.salarySampleCount ?? 0);
    const employerCount = Number(row.employerCount ?? 0);
    const maxEmployerShare = this.asNumber(row.maxEmployerShare);
    const observedMonthCount = this.asNumber(row.observedMonthCount);
    const evidenceLevel = this.marketEvidenceLevel(
      row.dimensionKind,
      sampleCount,
      employerCount,
      maxEmployerShare,
      observedMonthCount,
    );
    const publishable = evidenceLevel !== "insufficient";
    const reliable = evidenceLevel === "strong";
    return {
      segment: row.segment,
      regionSlug: row.regionSlug,
      regionLabel: row.regionLabel,
      regionType: row.regionType,
      countryCode: row.countryCode,
      filter:
        row.filterKey && row.filterValue
          ? { paramKey: row.filterKey, value: row.filterValue }
          : null,
      medianMonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryMedianMonthlyUsd)
        : null,
      p25MonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryP25MonthlyUsd)
        : null,
      p75MonthlyUsd: publishable
        ? this.roundMarketNumber(row.salaryP75MonthlyUsd)
        : null,
      adjustedPremiumPercent: publishable
        ? this.roundMarketNumber(row.adjustedPremiumPercent)
        : null,
      sampleCount,
      employerCount,
      onsiteCount: Number(row.onsiteCount ?? 0),
      hybridCount: Number(row.hybridCount ?? 0),
      remoteCount: Number(row.remoteCount ?? 0),
      activeJobs: Number(row.regionalActiveJobs ?? 0),
      hiringCompanies: Number(row.regionalHiringCompanies ?? 0),
      activeOnsiteJobs: Number(row.regionalActiveOnsiteJobs ?? 0),
      activeHybridJobs: Number(row.regionalActiveHybridJobs ?? 0),
      activeRemoteJobs: Number(row.regionalActiveRemoteJobs ?? 0),
      evidenceLevel,
      reliable,
    };
  }

  private marketCompensationBand(
    row: JobMarketCompensationBandRow,
  ): JobMarketCompensationBand {
    const sampleCount = Number(row.salarySampleCount ?? 0);
    const employerCount = Number(row.employerCount ?? 0);
    const maxEmployerShare = this.asNumber(row.maxEmployerShare);
    const observedMonthCount = Number(row.observedMonthCount ?? 0);
    const reliable =
      sampleCount >= 20 &&
      employerCount >= 10 &&
      maxEmployerShare !== null &&
      maxEmployerShare <= 0.2 &&
      observedMonthCount >= 3;
    return {
      segment: row.segment,
      senioritySlug: row.senioritySlug,
      seniorityLabel: row.seniorityLabel,
      medianMonthlyUsd: reliable
        ? this.roundMarketNumber(row.salaryMedianMonthlyUsd)
        : null,
      p25MonthlyUsd: reliable
        ? this.roundMarketNumber(row.salaryP25MonthlyUsd)
        : null,
      p75MonthlyUsd: reliable
        ? this.roundMarketNumber(row.salaryP75MonthlyUsd)
        : null,
      sampleCount,
      employerCount,
      reliable,
    };
  }

  private marketSkillSignal(row: JobMarketSkillRow): JobMarketSkillSignal {
    return {
      asOf: row.signalAsOf ?? row.asOfDate,
      segment: row.segment,
      status: row.signalStatus ?? "insufficient",
      currentMedianMonthlyUsd: this.roundMarketNumber(
        row.currentMedianMonthlyUsd,
      ),
      baselineMedianMonthlyUsd: this.roundMarketNumber(
        row.baselineMedianMonthlyUsd,
      ),
      rawChangePercent: this.roundMarketNumber(row.rawChangePercent),
      adjustedChangePercent: this.roundMarketNumber(row.adjustedChangePercent),
      confidenceLowPercent: this.roundMarketNumber(row.confidenceLowPercent),
      confidenceHighPercent: this.roundMarketNumber(row.confidenceHighPercent),
      qValue: this.roundMarketNumber(row.qValue),
      recentJobCount: Number(row.recentJobCount ?? 0),
      baselineJobCount: Number(row.baselineJobCount ?? 0),
      recentEmployerCount: Number(row.recentEmployerCount ?? 0),
      baselineEmployerCount: Number(row.baselineEmployerCount ?? 0),
      signalSince: row.signalSince,
    };
  }

  private marketSkillSummary(
    row: JobMarketSkillRow,
    marketRow?: JobMarketMetricRow,
    classificationActiveJobs = 0,
  ): JobMarketSkillSummary {
    const demand = this.marketDemand(row);
    const marketDemand = marketRow ? this.marketDemand(marketRow) : null;
    const relative =
      demand.activeJobsChange === null ||
      marketDemand?.activeJobsChange === null
        ? null
        : Math.round(
            (demand.activeJobsChange - marketDemand.activeJobsChange) * 10,
          ) / 10;
    const momentum = this.marketMomentumFromWindows(
      Number(row.currentWindowJobs ?? 0),
      Number(row.previousWindowJobs ?? 0),
      relative,
      demand.activeJobsChange,
      demand.hiringCompaniesChange,
    );
    const signal = row.signalAsOf ? this.marketSkillSignal(row) : null;
    return {
      slug: row.dimensionSlug,
      label: row.label,
      segment: row.segment,
      current: this.marketCompensation(row),
      signal,
      momentum,
      activeJobs: Number(row.activeJobs ?? 0),
      hiringCompanies: Number(row.hiringCompanies ?? 0),
      openJobShare:
        this.asNumber(row.openJobShare) ??
        (classificationActiveJobs > 0
          ? Math.round(
              (Number(row.activeJobs ?? 0) / classificationActiveJobs) * 1_000,
            ) / 10
          : 0),
      strongBreakout:
        signal?.status === "rising" && (relative ?? -Infinity) >= 5,
    };
  }

  private marketSkillWeeklyPoint(
    row: JobMarketSkillWeeklyRow,
  ): JobMarketSkillWeeklyPoint {
    const sampleCount = Number(row.salarySampleCount);
    const employerCount = Number(row.employerCount);
    const reliable = sampleCount >= 20 && employerCount >= 10;
    return {
      weekStart: row.weekStart,
      segment: row.segment,
      regionSlug: row.regionSlug,
      regionLabel: row.regionLabel,
      medianMonthlyUsd: this.roundMarketNumber(row.salaryMedianMonthlyUsd),
      p25MonthlyUsd: this.roundMarketNumber(row.salaryP25MonthlyUsd),
      p75MonthlyUsd: this.roundMarketNumber(row.salaryP75MonthlyUsd),
      adjustedPremiumPercent: this.roundMarketNumber(
        row.adjustedPremiumPercent,
      ),
      sampleCount,
      employerCount,
      onsiteCount: Number(row.onsiteCount),
      hybridCount: Number(row.hybridCount),
      remoteCount: Number(row.remoteCount),
      reliable,
    };
  }

  private roundMarketNumber(value: string | null): number | null {
    if (value === null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
  }

  private emptyPage(): PaginatedData<string> {
    return { page: -1, count: 0, total: 0, data: [] };
  }

  private asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return value === null || value === undefined ? [] : [String(value)];
  }

  private asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private captureDatabaseError(method: string, error: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "search.service" });
      Sentry.captureException(error);
    });
    this.logger.error(
      `SearchService::${method} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
