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
export class JobFilterConfigs {
  public static readonly JobFilterConfigsType = t.strict({
    tvl: RangeFilter.RangeFilterType,
    salary: RangeFilter.RangeFilterType,
    headcountEstimate: RangeFilter.RangeFilterType,
    monthlyFees: RangeFilter.RangeFilterType,
    monthlyVolume: RangeFilter.RangeFilterType,
    monthlyRevenue: RangeFilter.RangeFilterType,
    hacks: SingleSelectFilter.SingleSelectFilterType,
    audits: SingleSelectFilter.SingleSelectFilterType,
    token: SingleSelectFilter.SingleSelectFilterType,
    order: SingleSelectFilter.SingleSelectFilterType,
    seniority: MultiSelectFilter.MultiSelectFilterType,
    locations: MultiSelectFilter.MultiSelectFilterType,
    orderBy: SingleSelectFilter.SingleSelectFilterType,
    tags: MultiSelectFilter.MultiSelectFilterType,
    publicationDate: SingleSelectFilter.SingleSelectFilterType,
    chains: MultiSelectFilter.MultiSelectFilterType,
    projects: MultiSelectFilter.MultiSelectFilterType,
    investors: MultiSelectFilter.MultiSelectFilterType,
    communities: MultiSelectFilter.MultiSelectFilterType,
    ecosystems: MultiSelectFilter.MultiSelectFilterType,
    classifications: MultiSelectFilter.MultiSelectFilterType,
    commitments: MultiSelectFilter.MultiSelectFilterType,
    fundingRounds: MultiSelectFilter.MultiSelectFilterType,
    organizations: MultiSelectFilter.MultiSelectFilterType,
  });

  @ApiProperty()
  publicationDate: SingleSelectFilter;
  @ApiProperty()
  salary: RangeFilter;
  @ApiProperty()
  seniority: MultiSelectFilter;
  @ApiProperty()
  locations: MultiSelectFilter;
  @ApiProperty()
  headcountEstimate: RangeFilter;
  @ApiProperty()
  tags: MultiSelectFilter;
  @ApiProperty()
  fundingRounds: MultiSelectFilter;
  @ApiProperty()
  investors: MultiSelectFilter;
  @ApiProperty()
  communities: MultiSelectFilter;
  @ApiProperty()
  ecosystems: MultiSelectFilter;
  @ApiProperty()
  organizations: MultiSelectFilter;
  @ApiProperty()
  chains: MultiSelectFilter;
  @ApiProperty()
  projects: MultiSelectFilter;
  @ApiProperty()
  classifications: MultiSelectFilter;
  @ApiProperty()
  commitments: MultiSelectFilter;
  @ApiProperty()
  tvl: RangeFilter;
  @ApiProperty()
  monthlyVolume: RangeFilter;
  @ApiProperty()
  monthlyFees: RangeFilter;
  @ApiProperty()
  monthlyRevenue: RangeFilter;
  @ApiProperty()
  audits: SingleSelectFilter;
  @ApiProperty()
  hacks: SingleSelectFilter;
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
      orderBy,
      projects,
      seniority,
      locations,
      headcountEstimate,
      investors,
      communities,
      ecosystems,
      classifications,
      commitments,
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
    this.orderBy = orderBy;
    this.projects = projects;
    this.seniority = seniority;
    this.locations = locations;
    this.headcountEstimate = headcountEstimate;
    this.investors = investors;
    this.communities = communities;
    this.ecosystems = ecosystems;
    this.monthlyFees = monthlyFees;
    this.fundingRounds = fundingRounds;
    this.organizations = organizations;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
    this.publicationDate = publicationDate;
    this.classifications = classifications;
    this.commitments = commitments;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
