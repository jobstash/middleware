import {
  JobFilterConfigs,
  MultiSelectFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/job-filter-configs";
import {
  defaultSort,
  intConverter,
  isValidFilterConfig,
  slugify,
} from "../helpers";
import { toHeaderCase } from "js-convert-case";

export type RawJobFilters = {
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
  minCurrentMaintainers?: number | null;
  maxCurrentMaintainers?: number | null;
  tags?: string[] | null;
  fundingRounds?: string[] | null;
  fundingStages?: string[] | null;
  projects?: string[] | null;
  classifications?: string[] | null;
  commitments?: string[] | null;
  chains?: string[] | null;
  audits?: string[] | null;
  locations?: string[] | null;
  workModes?: string[] | null;
  availability?: string[] | null;
  availabilityLabels?: Record<string, string> | null;
  investors?: string[] | null;
  hacks?: string[] | null;
  token?: string[] | null;
  onboardIntoWeb3?: string[] | null;
  expertJobs?: string[] | null;
  ecosystems?: string[] | null;
  organizations?: string[] | null;
  seniority?: string[] | null;
};

export class JobFilterConfigsEntity {
  configPresets = FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(protected raw: RawJobFilters) {}

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

  getMultiValuePresets(key: string): MultiSelectFilter | MultiSelectFilter {
    return {
      ...this.configPresets[key],
      options: defaultSort(this.raw[key]?.filter(isValidFilterConfig) ?? [])
        .asc()
        .map((x: string) => ({ label: x, value: x })),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getMultiValuePresetsWithTransform(
    key: string,
    labelTransform?: (x: string) => string,
  ): MultiSelectFilter | MultiSelectFilter {
    return {
      ...this.configPresets[key],
      options: defaultSort(
        this.raw[key]?.filter(isValidFilterConfig).map((x: string) => ({
          label: labelTransform ? labelTransform(x) : x,
          value: slugify(x),
        })) ?? [],
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

  getAvailabilityPresets(): MultiSelectFilter {
    const labels = this.raw.availabilityLabels ?? {};
    const values = [
      ...new Set(
        (this.raw.availability ?? []).filter(
          (value): value is string =>
            typeof value === "string" && isValidFilterConfig(value),
        ),
      ),
    ];
    return {
      ...this.configPresets.availability,
      options: values
        .map(value => ({ label: labels[value] ?? value, value }))
        .sort(
          (left, right) =>
            left.label.localeCompare(right.label) ||
            left.value.localeCompare(right.value),
        ),
      paramKey: this.paramKeyPresets.availability,
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
      fundingRounds: this.getMultiValuePresetsWithTransform("fundingRounds"),
      fundingStages: this.getMultiValuePresetsWithTransform("fundingStages"),
      investors: this.getMultiValuePresetsWithTransform("investors"),
      tags: this.getMultiValuePresetsWithTransform("tags"),
      organizations: this.getMultiValuePresetsWithTransform("organizations"),
      chains: this.getMultiValuePresetsWithTransform("chains"),
      projects: this.getMultiValuePresetsWithTransform("projects"),
      classifications: this.getMultiValuePresetsWithTransform(
        "classifications",
        toHeaderCase,
      ),
      commitments: this.getMultiValuePresetsWithTransform(
        "commitments",
        toHeaderCase,
      ),
      ecosystems: this.getMultiValuePresets("ecosystems"),
      seniority: this.getMultiValuePresetsWithTransform("seniority"),
      locations: this.getMultiValuePresetsWithTransform(
        "locations",
        toHeaderCase,
      ),
      workModes: this.getMultiValuePresetsWithTransform(
        "workModes",
        toHeaderCase,
      ),
      availability: this.getAvailabilityPresets(),
      currentMaintainers: this.getRangePresets("currentMaintainers"),
      growingTeam: this.getSingleSelectPresets("growingTeam"),
      shrinkingTeam: this.getSingleSelectPresets("shrinkingTeam"),
      earlyTeamShrinkage: this.getSingleSelectPresets("earlyTeamShrinkage"),
      recentlyFunded: this.getSingleSelectPresets("recentlyFunded"),
      token: this.getSingleSelectPresets("token"),
      onboardIntoWeb3: this.getSingleSelectPresets("onboardIntoWeb3"),
      expertJobs: this.getSingleSelectPresets("expertJobs"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
