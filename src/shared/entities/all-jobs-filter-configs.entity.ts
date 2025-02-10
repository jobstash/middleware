import {
  AllJobsFilterConfigs,
  MultiSelectFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/all-jobs-filter-configs";
import {
  defaultSort,
  intConverter,
  isValidFilterConfig,
  slugify,
} from "../helpers";
import { toHeaderCase } from "js-convert-case";

type RawJobFilters = {
  category?: string[] | null;
  organizations?: string[] | null;
};

export class AllJobsFilterConfigsEntity {
  configPresets = FILTER_CONFIG_PRESETS;
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

  getProperties(): AllJobsFilterConfigs {
    return new AllJobsFilterConfigs({
      organizations: this.getMultiValuePresets("organizations"),
      category: this.getMultiValuePresets("category", x => toHeaderCase(x)),
    });
  }
}
