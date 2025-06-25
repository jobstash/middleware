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
    onboardIntoWeb3: SingleSelectFilter.SingleSelectFilterType,
    ethSeasonOfInternships: SingleSelectFilter.SingleSelectFilterType,
    order: SingleSelectFilter.SingleSelectFilterType,
    seniority: MultiSelectFilter.MultiSelectFilterType,
    locations: MultiSelectFilter.MultiSelectFilterType,
    orderBy: SingleSelectFilter.SingleSelectFilterType,
    tags: MultiSelectFilter.MultiSelectFilterType,
    publicationDate: SingleSelectFilter.SingleSelectFilterType,
    chains: MultiSelectFilter.MultiSelectFilterType,
    projects: MultiSelectFilter.MultiSelectFilterType,
    investors: MultiSelectFilter.MultiSelectFilterType,
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
  onboardIntoWeb3: SingleSelectFilter;
  @ApiProperty()
  ethSeasonOfInternships: SingleSelectFilter;
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
      ecosystems,
      classifications,
      onboardIntoWeb3,
      ethSeasonOfInternships,
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
    this.onboardIntoWeb3 = onboardIntoWeb3;
    this.ethSeasonOfInternships = ethSeasonOfInternships;
    this.headcountEstimate = headcountEstimate;
    this.investors = investors;
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

export class EcosystemJobFilterConfigs extends JobFilterConfigs {
  public static readonly EcosystemJobFilterConfigsType = t.intersection([
    JobFilterConfigs.JobFilterConfigsType,
    t.strict({
      online: SingleSelectFilter.SingleSelectFilterType,
      blocked: SingleSelectFilter.SingleSelectFilterType,
    }),
  ]);

  @ApiProperty()
  online: SingleSelectFilter;
  @ApiProperty()
  blocked: SingleSelectFilter;

  constructor(raw: EcosystemJobFilterConfigs) {
    super(raw);
    const { online, blocked } = raw;

    const result =
      EcosystemJobFilterConfigs.EcosystemJobFilterConfigsType.decode(raw);

    this.online = online;
    this.blocked = blocked;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
