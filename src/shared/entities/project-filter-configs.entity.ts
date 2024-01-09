import {
  MultiSelectFilter,
  MultiSelectSearchFilter,
  ProjectFilterConfigs,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/project-filter-configs";
import { intConverter } from "../helpers";
import { createNewSortInstance } from "fast-sort";

type RawProjectFilters = {
  minTvl?: number | null;
  maxTvl?: number | null;
  minMonthlyVolume?: number | null;
  maxMonthlyVolume?: number | null;
  minMonthlyFees?: number | null;
  maxMonthlyFees?: number | null;
  minMonthlyRevenue?: number | null;
  maxMonthlyRevenue?: number | null;
  categories?: string[] | null;
  chains?: string[] | null;
  audits?: string[] | null;
  organizations?: string[] | null;
};

export class ProjectFilterConfigsEntity {
  configPresets = FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(private readonly raw: RawProjectFilters) {}

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
      options: sort(this.raw[key]?.filter(isValidFilterConfig) ?? []).asc(),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getSingleSelectPresets(key: string): SingleSelectFilter {
    return {
      ...this.configPresets[key],
      paramKey: this.paramKeyPresets[key],
    };
  }

  getProperties(): ProjectFilterConfigs {
    return new ProjectFilterConfigs({
      tvl: this.getRangePresets("tvl"),
      monthlyVolume: this.getRangePresets("monthlyVolume"),
      monthlyFees: this.getRangePresets("monthlyFees"),
      monthlyRevenue: this.getRangePresets("monthlyRevenue"),
      audits: this.getSingleSelectPresets("audits"),
      hacks: this.getSingleSelectPresets("hacks"),
      organizations: this.getMultiValuePresets("organizations"),
      chains: this.getMultiValuePresets("chains"),
      categories: this.getMultiValuePresets("categories"),
      mainNet: this.getSingleSelectPresets("mainNet"),
      token: this.getSingleSelectPresets("token"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
