import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { inferObjectType } from "../helpers";
import { isLeft } from "fp-ts/lib/Either";
import {
  FilterConfigField,
  FilterConfigLabel,
  FilterConfigLabeledValues,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "./filters.interface";

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
      throw new Error(
        `Error Serializing ProjectFilterConfigs! Constructor expected: \n {
          tvl: RangeFilter,
          audits: RangeFilter,
          teamSize: RangeFilter,
          monthlyFees: RangeFilter,
          hacks: SingleSelectFilter,
          token: SingleSelectFilter,
          order: SingleSelectFilter,
          monthlyVolume: RangeFilter,
          monthlyRevenue: RangeFilter,
          mainNet: SingleSelectFilter,
          orderBy: SingleSelectFilter,
          chains: MultiSelectSearchFilter,
          categories: MultiSelectSearchFilter,
          organizations: MultiSelectSearchFilter,
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}
