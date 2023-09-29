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
    classifications: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    organizations: MultiSelectSearchFilter.MultiSelectSearchFilterType,
  });

  @ApiProperty()
  organizations: MultiSelectSearchFilter;
  @ApiProperty()
  classifications: MultiSelectSearchFilter;

  constructor(raw: AllJobsFilterConfigs) {
    const { classifications, organizations } = raw;

    const result = AllJobsFilterConfigs.AllJobsFilterConfigsType.decode(raw);

    this.classifications = classifications;
    this.organizations = organizations;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
