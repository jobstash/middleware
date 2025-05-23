import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import {
  FilterConfigField,
  FilterConfigLabel,
  FilterConfigLabeledValues,
  MultiSelectFilter,
  RangeFilter,
  SingleSelectFilter,
} from "./filters.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class OrgFilterConfigs {
  public static readonly OrgFilterConfigsType = t.strict({
    headcountEstimate: RangeFilter.RangeFilterType,
    order: SingleSelectFilter.SingleSelectFilterType,
    locations: MultiSelectFilter.MultiSelectFilterType,
    hasJobs: SingleSelectFilter.SingleSelectFilterType,
    orderBy: SingleSelectFilter.SingleSelectFilterType,
    hasProjects: SingleSelectFilter.SingleSelectFilterType,
    investors: MultiSelectFilter.MultiSelectFilterType,
    ecosystems: MultiSelectFilter.MultiSelectFilterType,
    fundingRounds: MultiSelectFilter.MultiSelectFilterType,
  });

  @ApiProperty()
  locations: MultiSelectFilter;
  @ApiProperty()
  headcountEstimate: RangeFilter;
  @ApiProperty()
  fundingRounds: MultiSelectFilter;
  @ApiProperty()
  investors: MultiSelectFilter;
  @ApiProperty()
  ecosystems: MultiSelectFilter;
  @ApiProperty()
  hasJobs: SingleSelectFilter;
  @ApiProperty()
  hasProjects: SingleSelectFilter;
  @ApiProperty()
  order: SingleSelectFilter;
  @ApiProperty()
  orderBy: SingleSelectFilter;

  constructor(raw: OrgFilterConfigs) {
    const {
      order,
      orderBy,
      locations,
      headcountEstimate,
      investors,
      ecosystems,
      fundingRounds,
      hasJobs,
      hasProjects,
    } = raw;

    const result = OrgFilterConfigs.OrgFilterConfigsType.decode(raw);

    this.order = order;
    this.orderBy = orderBy;
    this.locations = locations;
    this.headcountEstimate = headcountEstimate;
    this.investors = investors;
    this.ecosystems = ecosystems;
    this.fundingRounds = fundingRounds;
    this.hasJobs = hasJobs;
    this.hasProjects = hasProjects;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
