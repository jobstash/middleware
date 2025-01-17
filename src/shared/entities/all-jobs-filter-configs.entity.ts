import {
  AllJobsFilterConfigs,
  MultiSelectFilter,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/all-jobs-filter-configs";
import { intConverter, slugify } from "../helpers";
import { createNewSortInstance } from "fast-sort";
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
