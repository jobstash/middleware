import {
  JobFilterConfigs,
  MultiSelectFilter,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/job-filter-configs";
import { intConverter, slugify } from "../helpers";
import { createNewSortInstance } from "fast-sort";
import { toHeaderCase } from "js-convert-case";

type RawJobFilters = {
  minSalaryRange?: number | null;
  maxSalaryRange?: number | null;
  minTvl?: number | null;
  maxTvl?: number | null;
  minMonthlyVolume?: number | null;
  maxMonthlyVolume?: number | null;
  minMonthlyFees?: number | null;
  maxMonthlyFees?: number | null;
  minMonthlyRevenue?: number | null;
  maxMonthlyRevenue?: number | null;
  minHeadCount?: number | null;
  maxHeadCount?: number | null;
  tags?: string[] | null;
  skills?: { name: string; jobs: number }[] | null;
  fundingRounds?: string[] | null;
  projects?: string[] | null;
  classifications?: string[] | null;
  commitments?: string[] | null;
  chains?: string[] | null;
  audits?: string[] | null;
  locations?: string[] | null;
  communities?: string[] | null;
  ecosystems?: string[] | null;
  organizations?: string[] | null;
  seniority?: string[] | null;
};

export class JobFilterConfigsEntity {
  configPresets = FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(
    private readonly raw: RawJobFilters,
    private readonly threshold: number,
  ) {}

  getRangePresets(key: string): RangeFilter {
    const range = {
      lowest: {
        value: this.raw[this.paramKeyPresets[key].lowest]
          ? intConverter(this.raw[this.paramKeyPresets[key].lowest])
          : 0,
        paramKey: this.paramKeyPresets[key].lowest,
      },
      highest: {
        value: this.raw[this.paramKeyPresets[key].highest]
          ? intConverter(this.raw[this.paramKeyPresets[key].highest])
          : 0,
        paramKey: this.paramKeyPresets[key].highest,
      },
    };
    return {
      ...this.configPresets[key],
      value: range,
    };
  }

  getMultiValuePresets(
    key: string,
  ): MultiSelectFilter | MultiSelectSearchFilter {
    const sort = createNewSortInstance({
      comparer: new Intl.Collator(undefined, {
        numeric: true,
        caseFirst: "lower",
        sensitivity: "case",
      }).compare,
      inPlaceSorting: true,
    });

    const isValidFilterConfig = (value: string): boolean =>
      value !== "unspecified" &&
      value !== "undefined" &&
      value !== "" &&
      value !== "null";

    return {
      ...this.configPresets[key],
      options: sort(this.raw[key]?.filter(isValidFilterConfig) ?? [])
        .asc()
        .map((x: string) => ({ label: x, value: x })),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getMultiValuePresetsWithFilterAndTransform<Y>(
    key: string,
    filter: (x: Y) => boolean,
    transform: (x: Y) => MultiSelectFilter["options"][0],
  ): MultiSelectFilter | MultiSelectSearchFilter {
    const sort = createNewSortInstance({
      comparer: new Intl.Collator(undefined, {
        numeric: true,
        caseFirst: "lower",
        sensitivity: "case",
      }).compare,
      inPlaceSorting: true,
    });

    const isValidFilterConfig = (value: string): boolean =>
      value !== "unspecified" &&
      value !== "undefined" &&
      value !== "" &&
      value !== "null";

    return {
      ...this.configPresets[key],
      options: sort(
        this.raw[key]
          ?.filter(isValidFilterConfig)
          ?.filter(filter)
          .map(transform) ?? [],
      ).asc(),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getSingleSelectPresets(key: string): SingleSelectFilter {
    return {
      ...this.configPresets[key],
      paramKey: this.paramKeyPresets[key],
    };
  }

  getProperties(): JobFilterConfigs {
    return new JobFilterConfigs({
      publicationDate: this.getSingleSelectPresets("publicationDate"),
      salary: this.getRangePresets("salary"),
      headcountEstimate: this.getRangePresets("headcountEstimate"),
      tvl: this.getRangePresets("tvl"),
      monthlyVolume: this.getRangePresets("monthlyVolume"),
      monthlyFees: this.getRangePresets("monthlyFees"),
      monthlyRevenue: this.getRangePresets("monthlyRevenue"),
      audits: this.getSingleSelectPresets("audits"),
      hacks: this.getSingleSelectPresets("hacks"),
      fundingRounds: this.getMultiValuePresetsWithFilterAndTransform(
        "fundingRounds",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      investors: this.getMultiValuePresetsWithFilterAndTransform(
        "investors",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      tags: this.getMultiValuePresetsWithFilterAndTransform(
        "tags",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      skills: this.getMultiValuePresetsWithFilterAndTransform<{
        name: string;
        jobs: number;
      }>(
        "skills",
        (x: { name: string; jobs: number }) => x.jobs >= this.threshold,
        (x: { name: string; jobs: number }) => ({
          label: x.name,
          value: slugify(x.name),
        }),
      ),
      organizations: this.getMultiValuePresetsWithFilterAndTransform(
        "organizations",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      chains: this.getMultiValuePresetsWithFilterAndTransform(
        "chains",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      projects: this.getMultiValuePresetsWithFilterAndTransform(
        "projects",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      classifications: this.getMultiValuePresetsWithFilterAndTransform<string>(
        "classifications",
        (x: string) => x !== "",
        (x: string) => ({ label: toHeaderCase(x), value: slugify(x) }),
      ),
      commitments: this.getMultiValuePresetsWithFilterAndTransform<string>(
        "commitments",
        (x: string) => x !== "",
        (x: string) => ({ label: toHeaderCase(x), value: slugify(x) }),
      ),
      ecosystems: this.getMultiValuePresets("ecosystems"),
      communities: this.getMultiValuePresets("communities"),
      seniority: this.getMultiValuePresetsWithFilterAndTransform(
        "seniority",
        (x: string) => x !== "",
        (x: string) => ({ label: x, value: slugify(x) }),
      ),
      locations: this.getMultiValuePresetsWithFilterAndTransform<string>(
        "locations",
        (x: string) => x !== "",
        (x: string) => ({ label: toHeaderCase(x), value: slugify(x) }),
      ),
      mainNet: this.getSingleSelectPresets("mainNet"),
      token: this.getSingleSelectPresets("token"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
