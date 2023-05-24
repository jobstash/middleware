import {
  JobFilterConfigs,
  MultiSelectFilter,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  JOB_FILTER_CONFIG_PRESETS,
} from "../presets/job-filter-configs";
import { intConverter } from "../helpers";
import { createNewSortInstance } from "fast-sort";

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
  minTeamSize?: number | null;
  maxTeamSize?: number | null;
  minAudits?: number | null;
  maxAudits?: number | null;
  tech?: string[] | null;
  fundingRounds?: string[] | null;
  projects?: string[] | null;
  categories?: string[] | null;
  chains?: string[] | null;
  locations?: string[] | null;
  organizations?: string[] | null;
  seniority?: string[] | null;
};

export class JobFilterConfigsEntity {
  configPresets = JOB_FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(private readonly raw: RawJobFilters) {}

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
      stepSize:
        range.highest.value === 0 && range.lowest.value === 0
          ? 0
          : this.configPresets[key].stepSize,
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
    });

    const isValidFilterConfig = (value: string): boolean =>
      value !== "unspecified" &&
      value !== "undefined" &&
      value !== "" &&
      value !== "null";

    return {
      ...this.configPresets[key],
      options: sort(this.raw[key]?.filter(isValidFilterConfig) ?? null).asc(),
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
      teamSize: this.getRangePresets("teamSize"),
      headCount: this.getRangePresets("headCount"),
      tvl: this.getRangePresets("tvl"),
      monthlyVolume: this.getRangePresets("monthlyVolume"),
      monthlyFees: this.getRangePresets("monthlyFees"),
      monthlyRevenue: this.getRangePresets("monthlyRevenue"),
      audits: this.getRangePresets("audits"),
      hacks: this.getSingleSelectPresets("hacks"),
      fundingRounds: this.getMultiValuePresets("fundingRounds"),
      investors: this.getMultiValuePresets("investors"),
      tech: this.getMultiValuePresets("tech"),
      organizations: this.getMultiValuePresets("organizations"),
      chains: this.getMultiValuePresets("chains"),
      projects: this.getMultiValuePresets("projects"),
      categories: this.getMultiValuePresets("categories"),
      seniority: this.getMultiValuePresets("seniority"),
      locations: this.getMultiValuePresets("locations"),
      mainNet: this.getSingleSelectPresets("mainNet"),
      token: this.getSingleSelectPresets("token"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
