import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import {
  FilterConfigField,
  FilterConfigLabel,
  FilterConfigLabeledValues,
  MultiSelectSearchFilter,
} from "./filters.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class AllJobsFilterConfigs {
  public static readonly AllJobsFilterConfigsType = t.strict({
    categories: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    organizations: MultiSelectSearchFilter.MultiSelectSearchFilterType,
  });

  @ApiProperty()
  organizations: MultiSelectSearchFilter;
  @ApiProperty()
  categories: MultiSelectSearchFilter;

  constructor(raw: AllJobsFilterConfigs) {
    const { categories, organizations } = raw;

    const result = AllJobsFilterConfigs.AllJobsFilterConfigsType.decode(raw);

    this.categories = categories;
    this.organizations = organizations;

    if (isLeft(result)) {
      report(result).forEach(x => {
        console.error(x);
      });
    }
  }
}
