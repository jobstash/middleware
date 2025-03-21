import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import {
  FilterConfigField,
  FilterConfigLabel,
  FilterConfigLabeledValues,
  MultiSelectFilter,
} from "./filters.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class AllJobsFilterConfigs {
  public static readonly AllJobsFilterConfigsType = t.strict({
    category: MultiSelectFilter.MultiSelectFilterType,
    organizations: MultiSelectFilter.MultiSelectFilterType,
  });

  @ApiProperty()
  organizations: MultiSelectFilter;
  @ApiProperty()
  category: MultiSelectFilter;

  constructor(raw: AllJobsFilterConfigs) {
    const { category, organizations } = raw;

    const result = AllJobsFilterConfigs.AllJobsFilterConfigsType.decode(raw);

    this.category = category;
    this.organizations = organizations;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
