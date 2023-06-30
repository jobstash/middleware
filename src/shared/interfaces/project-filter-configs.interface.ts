import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import {
  FilterConfigField,
  FilterConfigLabel,
  FilterConfigLabeledValues,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "./filters.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class ProjectFilterConfigs {
  public static readonly ProjectFilterConfigsType = t.strict({
    tvl: RangeFilter.RangeFilterType,
    audits: RangeFilter.RangeFilterType,
    teamSize: RangeFilter.RangeFilterType,
    monthlyFees: RangeFilter.RangeFilterType,
    monthlyVolume: RangeFilter.RangeFilterType,
    monthlyRevenue: RangeFilter.RangeFilterType,
    hacks: SingleSelectFilter.SingleSelectFilterType,
    token: SingleSelectFilter.SingleSelectFilterType,
    order: SingleSelectFilter.SingleSelectFilterType,
    mainNet: SingleSelectFilter.SingleSelectFilterType,
    orderBy: SingleSelectFilter.SingleSelectFilterType,
    chains: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    categories: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    organizations: MultiSelectSearchFilter.MultiSelectSearchFilterType,
  });

  @ApiProperty()
  teamSize: RangeFilter;
  @ApiProperty()
  organizations: MultiSelectSearchFilter;
  @ApiProperty()
  chains: MultiSelectSearchFilter;
  @ApiProperty()
  categories: MultiSelectSearchFilter;
  @ApiProperty()
  tvl: RangeFilter;
  @ApiProperty()
  monthlyVolume: RangeFilter;
  @ApiProperty()
  monthlyFees: RangeFilter;
  @ApiProperty()
  monthlyRevenue: RangeFilter;
  @ApiProperty()
  audits: RangeFilter;
  @ApiProperty()
  hacks: SingleSelectFilter;
  @ApiProperty()
  mainNet: SingleSelectFilter;
  @ApiProperty()
  token: SingleSelectFilter;
  @ApiProperty()
  order: SingleSelectFilter;
  @ApiProperty()
  orderBy: SingleSelectFilter;

  constructor(raw: ProjectFilterConfigs) {
    const {
      tvl,
      hacks,
      token,
      order,
      chains,
      audits,
      mainNet,
      orderBy,
      teamSize,
      categories,
      monthlyFees,
      organizations,
      monthlyVolume,
      monthlyRevenue,
    } = raw;

    const result = ProjectFilterConfigs.ProjectFilterConfigsType.decode(raw);

    this.tvl = tvl;
    this.hacks = hacks;
    this.token = token;
    this.order = order;
    this.chains = chains;
    this.audits = audits;
    this.mainNet = mainNet;
    this.orderBy = orderBy;
    this.teamSize = teamSize;
    this.categories = categories;
    this.monthlyFees = monthlyFees;
    this.organizations = organizations;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
