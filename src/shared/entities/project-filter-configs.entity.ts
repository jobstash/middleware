import {
  MultiSelectFilter,
  ProjectFilterConfigs,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/project-filter-configs";
import {
  defaultSort,
  intConverter,
  isValidFilterConfig,
  slugify,
} from "../helpers";

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
  investors?: string[] | null;
  ecosystems?: string[] | null;
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
    transformLabel: (x: string) => string = (x: string): string => x,
    transformValue: (x: string) => string = (x: string): string => slugify(x),
  ): MultiSelectFilter | MultiSelectFilter {
    return {
      ...this.configPresets[key],
      options: defaultSort(this.raw[key]?.filter(isValidFilterConfig) ?? [])
        .asc()
        .map((x: string) => ({
          label: transformLabel(x),
          value: transformValue(x),
        })),
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
      ecosystems: this.getMultiValuePresets("ecosystems"),
      categories: this.getMultiValuePresets("categories"),
      investors: this.getMultiValuePresets("investors"),
      token: this.getSingleSelectPresets("token"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
