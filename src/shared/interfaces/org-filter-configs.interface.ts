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
    fundingStages: MultiSelectFilter.MultiSelectFilterType,
    currentMaintainers: RangeFilter.RangeFilterType,
    activeLeads: RangeFilter.RangeFilterType,
    newActiveLeads: SingleSelectFilter.SingleSelectFilterType,
    steppedDownLeads: SingleSelectFilter.SingleSelectFilterType,
    movedLeads: SingleSelectFilter.SingleSelectFilterType,
    earlyLeadDepartures: SingleSelectFilter.SingleSelectFilterType,
    growingTeam: SingleSelectFilter.SingleSelectFilterType,
    shrinkingTeam: SingleSelectFilter.SingleSelectFilterType,
    earlyTeamShrinkage: SingleSelectFilter.SingleSelectFilterType,
    recentlyFunded: SingleSelectFilter.SingleSelectFilterType,
    categories: MultiSelectFilter.MultiSelectFilterType,
  });

  @ApiProperty()
  locations: MultiSelectFilter;
  @ApiProperty()
  headcountEstimate: RangeFilter;
  @ApiProperty()
  fundingRounds: MultiSelectFilter;
  @ApiProperty()
  fundingStages: MultiSelectFilter;
  @ApiProperty()
  currentMaintainers: RangeFilter;
  @ApiProperty()
  activeLeads: RangeFilter;
  @ApiProperty()
  newActiveLeads: SingleSelectFilter;
  @ApiProperty()
  steppedDownLeads: SingleSelectFilter;
  @ApiProperty()
  movedLeads: SingleSelectFilter;
  @ApiProperty()
  earlyLeadDepartures: SingleSelectFilter;
  @ApiProperty()
  growingTeam: SingleSelectFilter;
  @ApiProperty()
  shrinkingTeam: SingleSelectFilter;
  @ApiProperty()
  earlyTeamShrinkage: SingleSelectFilter;
  @ApiProperty()
  recentlyFunded: SingleSelectFilter;
  @ApiProperty()
  investors: MultiSelectFilter;
  @ApiProperty()
  ecosystems: MultiSelectFilter;
  @ApiProperty()
  categories: MultiSelectFilter;
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
      fundingStages,
      currentMaintainers,
      activeLeads,
      newActiveLeads,
      steppedDownLeads,
      movedLeads,
      earlyLeadDepartures,
      growingTeam,
      shrinkingTeam,
      earlyTeamShrinkage,
      recentlyFunded,
      categories,
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
    this.fundingStages = fundingStages;
    this.currentMaintainers = currentMaintainers;
    this.activeLeads = activeLeads;
    this.newActiveLeads = newActiveLeads;
    this.steppedDownLeads = steppedDownLeads;
    this.movedLeads = movedLeads;
    this.earlyLeadDepartures = earlyLeadDepartures;
    this.growingTeam = growingTeam;
    this.shrinkingTeam = shrinkingTeam;
    this.earlyTeamShrinkage = earlyTeamShrinkage;
    this.recentlyFunded = recentlyFunded;
    this.categories = categories;
    this.hasJobs = hasJobs;
    this.hasProjects = hasProjects;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
