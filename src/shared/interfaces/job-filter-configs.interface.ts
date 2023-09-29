import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import {
  FilterConfigField,
  FilterConfigLabel,
  FilterConfigLabeledValues,
  MultiSelectFilter,
  MultiSelectSearchFilter,
  RangeFilter,
  SingleSelectFilter,
} from "./filters.interface";
import { report } from "io-ts-human-reporter";

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class JobFilterConfigs {
  public static readonly JobFilterConfigsType = t.strict({
    tvl: RangeFilter.RangeFilterType,
    salary: RangeFilter.RangeFilterType,
    teamSize: RangeFilter.RangeFilterType,
    headCount: RangeFilter.RangeFilterType,
    monthlyFees: RangeFilter.RangeFilterType,
    monthlyVolume: RangeFilter.RangeFilterType,
    monthlyRevenue: RangeFilter.RangeFilterType,
    hacks: SingleSelectFilter.SingleSelectFilterType,
    token: SingleSelectFilter.SingleSelectFilterType,
    order: SingleSelectFilter.SingleSelectFilterType,
    seniority: MultiSelectFilter.MultiSelectFilterType,
    location: MultiSelectFilter.MultiSelectFilterType,
    mainNet: SingleSelectFilter.SingleSelectFilterType,
    orderBy: SingleSelectFilter.SingleSelectFilterType,
    tags: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    publicationDate: SingleSelectFilter.SingleSelectFilterType,
    audits: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    chains: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    projects: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    investors: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    classifications: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    fundingRounds: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    organizations: MultiSelectSearchFilter.MultiSelectSearchFilterType,
  });

  @ApiProperty()
  publicationDate: SingleSelectFilter;
  @ApiProperty()
  salary: RangeFilter;
  @ApiProperty()
  seniority: MultiSelectFilter;
  @ApiProperty()
  location: MultiSelectFilter;
  @ApiProperty()
  teamSize: RangeFilter;
  @ApiProperty()
  headCount: RangeFilter;
  @ApiProperty()
  tags: MultiSelectSearchFilter;
  @ApiProperty()
  fundingRounds: MultiSelectSearchFilter;
  @ApiProperty()
  investors: MultiSelectSearchFilter;
  @ApiProperty()
  organizations: MultiSelectSearchFilter;
  @ApiProperty()
  chains: MultiSelectSearchFilter;
  @ApiProperty()
  projects: MultiSelectSearchFilter;
  @ApiProperty()
  classifications: MultiSelectSearchFilter;
  @ApiProperty()
  tvl: RangeFilter;
  @ApiProperty()
  monthlyVolume: RangeFilter;
  @ApiProperty()
  monthlyFees: RangeFilter;
  @ApiProperty()
  monthlyRevenue: RangeFilter;
  @ApiProperty()
  audits: MultiSelectSearchFilter;
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

  constructor(raw: JobFilterConfigs) {
    const {
      tvl,
      tags,
      hacks,
      token,
      order,
      salary,
      chains,
      audits,
      mainNet,
      orderBy,
      teamSize,
      projects,
      seniority,
      location,
      headCount,
      investors,
      classifications,
      monthlyFees,
      fundingRounds,
      organizations,
      monthlyVolume,
      monthlyRevenue,
      publicationDate,
    } = raw;

    const result = JobFilterConfigs.JobFilterConfigsType.decode(raw);

    this.tvl = tvl;
    this.tags = tags;
    this.hacks = hacks;
    this.token = token;
    this.order = order;
    this.salary = salary;
    this.chains = chains;
    this.audits = audits;
    this.mainNet = mainNet;
    this.orderBy = orderBy;
    this.teamSize = teamSize;
    this.projects = projects;
    this.seniority = seniority;
    this.location = location;
    this.headCount = headCount;
    this.investors = investors;
    this.monthlyFees = monthlyFees;
    this.fundingRounds = fundingRounds;
    this.organizations = organizations;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
    this.publicationDate = publicationDate;
    this.classifications = classifications;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
