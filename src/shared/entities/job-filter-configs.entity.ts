import { JobFilterConfigs } from "src/shared/types";
import {
  FILTER_PARAM_KEY_PRESETS,
  JOB_FILTER_CONFIG_PRESETS,
} from "../presets/job-filter-configs";
import { intConverter } from "../helpers";

type RawJobFilters = {
  minSalary?: number | null;
  maxSalary?: number | null;
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
  technologies?: string[] | null;
  categories?: string[] | null;
  locations?: string[] | null;
  organizations?: string[] | null;
  seniority?: string[] | null;
};

export class JobFilterConfigsEntity {
  configPresets = JOB_FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(private readonly raw: RawJobFilters) {}

  getRangePresets(key: string): object {
    return {
      ...this.configPresets[key],
      value: {
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
      },
    };
  }

  getMultiValuePresets(key: string): object {
    return {
      ...this.configPresets[key],
      options: this.raw[key] ?? null,
      paramKey: this.paramKeyPresets[key],
    };
  }

  getSingleSelectPresets(key: string): object {
    return {
      ...this.configPresets[key],
      paramKey: this.paramKeyPresets[key],
    };
  }

  getProperties(): JobFilterConfigs {
    return {
      publicationDate: this.getSingleSelectPresets("publicationDate"),
      salary: this.getRangePresets("salary"),
      teamSize: this.getRangePresets("teamSize"),
      headCount: this.getRangePresets("headCount"),
      tvl: this.getRangePresets("tvl"),
      monthlyVolume: this.getRangePresets("monthlyVolume"),
      monthlyFees: this.getRangePresets("monthlyFees"),
      monthlyRevenue: this.getRangePresets("monthlyRevenue"),
      audits: this.getRangePresets("audits"),
      hacks: this.getRangePresets("hacks"),
      tech: this.getMultiValuePresets("tech"),
      organizations: this.getMultiValuePresets("organizations"),
      chains: this.getMultiValuePresets("chains"),
      projects: this.getMultiValuePresets("projects"),
      categories: this.getMultiValuePresets("categories"),
      seniority: this.getMultiValuePresets("seniority"),
      locations: this.getMultiValuePresets("locations"),
      mainNet: this.getSingleSelectPresets("mainNet"),
      token: this.getSingleSelectPresets("token"),
    } as JobFilterConfigs;
  }
}
