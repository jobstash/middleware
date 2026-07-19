import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { go } from "fuzzysort";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { capitalize, lowerCase } from "lodash";
import { SearchRepository } from "src/postgres/search.repository";
import {
  NAV_FILTER_CONFIGS,
  NAV_FILTER_LABEL_MAPPINGS,
  NAV_PILLAR_ORDERING,
  NAV_PILLAR_SLUG_PREFIX_MAPPINGS,
  NAV_PILLAR_TITLES,
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
import { isValidFilterConfig, paginate, slugify } from "src/shared/helpers";
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

type FilterConfig = Record<string, unknown>;

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
  },
};

@Injectable()
export class SearchService {
  private readonly logger = new CustomLogger(SearchService.name);

  private readonly groupLabels: Record<SuggestionGroupId, string> = {
    jobs: "Jobs",
    organizations: "Organizations",
    tags: "Tags",
    classifications: "Classifications",
    locations: "Locations",
    investors: "Investors",
    fundingRounds: "Funding Rounds",
  };

  constructor(private readonly searchRepository: SearchRepository) {}

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
    const configs = await this.searchRepository.getPillarConfigs(
      params.nav,
      ecosystem,
    );
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
      const configs = await this.searchRepository.getPillarConfigs(
        params.nav,
        ecosystem,
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
    const configs = await this.searchRepository.getPillarConfigs(
      nav,
      ecosystem,
    );
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
      const configs = await this.searchRepository.getPillarConfigs(params.nav);
      const wanted = new Set(params.slugs ?? []);
      const labels = new Map<string, string>();
      for (const pillar of pillars) {
        const data = this.buildPillar(configs, {
          nav: params.nav,
          pillar,
        } as SearchPillarFiltersParams & { pillar: string });
        for (const label of data?.items ?? []) {
          const key = slugify(label);
          if (wanted.has(key)) labels.set(key, label);
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
      const allConfigs = await this.searchRepository.getPillarConfigs(
        params.nav,
        ecosystem,
      );
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
        | SearchRangeFilter
        | SingleSelectFilter
        | MultiSelectFilter
      )[] = [];
      for (const filter of filterNames) {
        const configs = this.filterConfigs(allConfigs, params, filter);
        const preset = presets[filter];
        if (!preset) continue;
        const paramPreset = FILTER_PARAM_KEY_PRESETS[params.nav]?.[filter];
        if (preset.kind === "RANGE") {
          const values = configs
            .map(config => this.asNumber(config[filter]))
            .filter((value): value is number => value !== null)
            .map(value => Math.max(0, value));
          const range = paramPreset as { lowest: string; highest: string };
          filters.push(
            new SearchRangeFilter({
              ...preset,
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
              ...preset,
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
            ...preset,
            paramKey: paramPreset as string,
            options: labels.map(label => ({ label, value: slugify(label) })),
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
      const organization =
        parsed.pillarType === "organizations"
          ? this.normalizePillarOrganization(
              await this.searchRepository.getOrganizationPillar(parsed.value),
            )
          : null;
      const header = await this.fetchHeaderText(
        "jobs",
        parsed.pillarType,
        parsed.value,
      );
      if (!header) {
        return { success: true, message: "Pillar not found", data: null };
      }
      const { startDate, endDate } = this.getPillarDateRange();
      const jobs = (
        await this.searchRepository.getPillarJobs({
          pillarType: parsed.pillarType,
          value: parsed.value,
          ecosystem,
          startDate,
          endDate,
          limit: 60,
        })
      ).map(job => this.normalizePillarJob(job));
      if (!jobs.length && !organization) {
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
      return {
        groups,
        activeGroup,
        items: unique.slice(0, limit),
        page,
        hasMore: unique.length > limit,
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
    const listFields = [
      "names",
      "chains",
      "categories",
      "locations",
      "investors",
      "fundingRounds",
      "tags",
      "classifications",
      "commitments",
      "locationTypes",
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
        const value = this.asNumber(config[field]) ?? 0;
        const minimum = this.asNumber(values[mapping.minimum]);
        const maximum = this.asNumber(values[mapping.maximum]);
        if (minimum !== null && value < minimum) return false;
        if (maximum !== null && value > maximum) return false;
      }
      for (const [field, parameter] of Object.entries(
        booleanFilters[params.nav] ?? {},
      )) {
        if (field === excludedField) continue;
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
        extract: (job: PillarJob): ExtractedPillar[] =>
          job.location
            ? [{ label: job.location, key: slugify(job.location) }]
            : [],
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

  private getPillarDateRange(): { startDate: number; endDate: number } {
    const now = Date.now();
    return {
      startDate: startOfDay(subDays(now, 30)).getTime(),
      endDate: endOfDay(now).getTime(),
    };
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
