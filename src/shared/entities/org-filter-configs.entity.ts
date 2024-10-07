import {
  MultiSelectFilter,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/org-filter-configs";
import { intConverter, normalizeString } from "../helpers";
import { createNewSortInstance } from "fast-sort";
import { OrgFilterConfigs } from "../interfaces/org-filter-configs.interface";
import { toHeaderCase } from "js-convert-case";

type RawOrgFilters = {
  minHeadCount?: number | null;
  maxHeadCount?: number | null;
  fundingRounds?: string[] | null;
  investors?: string[] | null;
  locations?: string[] | null;
  communities?: string[] | null;
};

export class OrgFilterConfigsEntity {
  configPresets = FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(private readonly raw: RawOrgFilters) {}

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
    transformValue: (x: string) => string = (x: string): string =>
      normalizeString(x),
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

  getProperties(): OrgFilterConfigs {
    return new OrgFilterConfigs({
      headcountEstimate: this.getRangePresets("headcountEstimate"),
      fundingRounds: this.getMultiValuePresets("fundingRounds"),
      investors: this.getMultiValuePresets("investors"),
      communities: this.getMultiValuePresets("communities"),
      locations: this.getMultiValuePresets("locations", x => toHeaderCase(x)),
      hasJobs: this.getSingleSelectPresets("hasJobs"),
      hasProjects: this.getSingleSelectPresets("hasProjects"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
