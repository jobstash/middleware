import {
  JobFilterConfigs,
  MultiSelectFilter,
  RangeFilter,
  SingleSelectFilter,
} from "../interfaces";
import {
  FILTER_PARAM_KEY_PRESETS,
  FILTER_CONFIG_PRESETS,
} from "../presets/job-filter-configs";
import {
  defaultSort,
  intConverter,
  isValidFilterConfig,
  slugify,
  slugifyFacetLabel,
} from "../helpers";
import { toHeaderCase } from "js-convert-case";

export type RawJobFilters = {
  minSalaryRange?: number | null;
  maxSalaryRange?: number | null;
  minTvl?: number | null;
  maxTvl?: number | null;
  minMonthlyVolume?: number | null;
  maxMonthlyVolume?: number | null;
  minMonthlyFees?: number | null;
  maxMonthlyFees?: number | null;
  minMonthlyRevenue?: number | null;
  maxMonthlyRevenue?: number | null;
  minHeadCount?: number | null;
  maxHeadCount?: number | null;
  minCurrentMaintainers?: number | null;
  maxCurrentMaintainers?: number | null;
  minActiveLeads?: number | null;
  maxActiveLeads?: number | null;
  teamSignalsAvailable?: boolean | null;
  tags?: string[] | null;
  tagLabels?: Record<string, string> | null;
  fundingRounds?: string[] | null;
  fundingRoundLabels?: Record<string, string> | null;
  fundingStages?: string[] | null;
  fundingStageLabels?: Record<string, string> | null;
  projects?: string[] | null;
  projectLabels?: Record<string, string> | null;
  classifications?: string[] | null;
  classificationLabels?: Record<string, string> | null;
  commitments?: string[] | null;
  commitmentLabels?: Record<string, string> | null;
  chains?: string[] | null;
  chainLabels?: Record<string, string> | null;
  audits?: string[] | null;
  workModes?: string[] | null;
  workModeLabels?: Record<string, string> | null;
  availability?: string[] | null;
  availabilityLabels?: Record<string, string> | null;
  cities?: string[] | null;
  cityLabels?: Record<string, string> | null;
  regions?: string[] | null;
  regionLabels?: Record<string, string> | null;
  countries?: string[] | null;
  countryLabels?: Record<string, string> | null;
  continents?: string[] | null;
  continentLabels?: Record<string, string> | null;
  timezones?: string[] | null;
  timezoneLabels?: Record<string, string> | null;
  collaborationHours?: string[] | null;
  collaborationHourLabels?: Record<string, string> | null;
  investors?: string[] | null;
  investorLabels?: Record<string, string> | null;
  hacks?: string[] | null;
  token?: string[] | null;
  onboardIntoWeb3?: string[] | null;
  expertJobs?: string[] | null;
  ecosystems?: string[] | null;
  ecosystemLabels?: Record<string, string> | null;
  organizations?: string[] | null;
  organizationLabels?: Record<string, string> | null;
  seniority?: string[] | null;
};

export class JobFilterConfigsEntity {
  configPresets = FILTER_CONFIG_PRESETS;
  paramKeyPresets = FILTER_PARAM_KEY_PRESETS;

  constructor(protected raw: RawJobFilters) {}

  getRangePresets(key: string): RangeFilter {
    const range = {
      lowest: {
        value: this.raw[this.paramKeyPresets[key].lowest]
          ? intConverter(this.raw[this.paramKeyPresets[key].lowest])
          : 0,
        paramKey: this.paramKeyPresets[key].lowest,
      },
      highest: {
        value: this.raw[this.paramKeyPresets[key].highest]
          ? intConverter(this.raw[this.paramKeyPresets[key].highest])
          : 0,
        paramKey: this.paramKeyPresets[key].highest,
      },
    };
    return {
      ...this.configPresets[key],
      value: range,
    };
  }

  getMultiValuePresets(key: string): MultiSelectFilter | MultiSelectFilter {
    return {
      ...this.configPresets[key],
      options: defaultSort(this.raw[key]?.filter(isValidFilterConfig) ?? [])
        .asc()
        .map((x: string) => ({ label: x, value: x })),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getMultiValuePresetsWithTransform(
    key: string,
    labelTransform?: (x: string) => string,
  ): MultiSelectFilter | MultiSelectFilter {
    return {
      ...this.configPresets[key],
      options: defaultSort(
        this.raw[key]?.filter(isValidFilterConfig).map((x: string) => ({
          label: labelTransform ? labelTransform(x) : x,
          value: slugify(x),
        })) ?? [],
      ).asc(),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getSingleSelectPresets(key: string): SingleSelectFilter {
    return {
      ...this.configPresets[key],
      paramKey: this.paramKeyPresets[key],
    };
  }

  getTeamRangePresets(key: string): RangeFilter {
    return {
      ...this.getRangePresets(key),
      show: this.raw.teamSignalsAvailable === true,
    };
  }

  getTeamSingleSelectPresets(key: string): SingleSelectFilter {
    return {
      ...this.getSingleSelectPresets(key),
      show: this.raw.teamSignalsAvailable === true,
    };
  }

  getKeyedPresets(
    key:
      | "tags"
      | "projects"
      | "organizations"
      | "investors"
      | "fundingRounds"
      | "fundingStages"
      | "chains"
      | "ecosystems"
      | "classifications"
      | "commitments"
      | "workModes"
      | "availability"
      | "cities"
      | "regions"
      | "countries"
      | "continents"
      | "timezones"
      | "collaborationHours",
    labelKey:
      | "tagLabels"
      | "projectLabels"
      | "organizationLabels"
      | "investorLabels"
      | "fundingRoundLabels"
      | "fundingStageLabels"
      | "chainLabels"
      | "ecosystemLabels"
      | "classificationLabels"
      | "commitmentLabels"
      | "workModeLabels"
      | "availabilityLabels"
      | "cityLabels"
      | "regionLabels"
      | "countryLabels"
      | "continentLabels"
      | "timezoneLabels"
      | "collaborationHourLabels",
  ): MultiSelectFilter {
    const labels = this.raw[labelKey] ?? {};
    const seoKeys = new Set([
      "availability",
      "cities",
      "regions",
      "countries",
      "continents",
      "timezones",
    ]);
    const headerLabels = new Set([
      "classifications",
      "commitments",
      "workModes",
    ]);
    const values = [
      ...new Set(
        (this.raw[key] ?? []).filter(
          (value): value is string =>
            typeof value === "string" && isValidFilterConfig(value),
        ),
      ),
    ];
    const options = values.map(value => {
      const isFullyRemote =
        key === "workModes" &&
        (value === "fully_remote" || value === "fully-remote");
      const label = isFullyRemote ? "100% Remote" : (labels[value] ?? value);
      return {
        label: isFullyRemote
          ? label
          : headerLabels.has(key)
            ? toHeaderCase(label)
            : label,
        value: isFullyRemote
          ? "fully-remote"
          : seoKeys.has(key)
            ? slugifyFacetLabel(label)
            : labels[value] !== undefined
              ? value
              : key === "ecosystems"
                ? value
                : slugify(value),
        ...(seoKeys.has(key) ? { aliases: [value] } : {}),
      };
    });
    const deduplicatedOptions = new Map<
      string | boolean,
      (typeof options)[number]
    >();
    for (const option of options) {
      const existing = deduplicatedOptions.get(option.value);
      if (!existing) {
        deduplicatedOptions.set(option.value, option);
        continue;
      }
      existing.aliases = [
        ...new Set([...(existing.aliases ?? []), ...(option.aliases ?? [])]),
      ];
    }
    return {
      ...this.configPresets[key],
      options: [...deduplicatedOptions.values()].sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.value.localeCompare(right.value),
      ),
      paramKey: this.paramKeyPresets[key],
    };
  }

  getProperties(): JobFilterConfigs {
    return new JobFilterConfigs({
      publicationDate: this.getSingleSelectPresets("publicationDate"),
      salary: this.getRangePresets("salary"),
      headcountEstimate: this.getRangePresets("headcountEstimate"),
      tvl: this.getRangePresets("tvl"),
      monthlyVolume: this.getRangePresets("monthlyVolume"),
      monthlyFees: this.getRangePresets("monthlyFees"),
      monthlyRevenue: this.getRangePresets("monthlyRevenue"),
      audits: this.getSingleSelectPresets("audits"),
      hacks: this.getSingleSelectPresets("hacks"),
      fundingRounds: this.getKeyedPresets(
        "fundingRounds",
        "fundingRoundLabels",
      ),
      fundingStages: this.getKeyedPresets(
        "fundingStages",
        "fundingStageLabels",
      ),
      investors: this.getKeyedPresets("investors", "investorLabels"),
      tags: this.getKeyedPresets("tags", "tagLabels"),
      organizations: this.getKeyedPresets(
        "organizations",
        "organizationLabels",
      ),
      chains: this.getKeyedPresets("chains", "chainLabels"),
      projects: this.getKeyedPresets("projects", "projectLabels"),
      classifications: this.getKeyedPresets(
        "classifications",
        "classificationLabels",
      ),
      commitments: this.getKeyedPresets("commitments", "commitmentLabels"),
      ecosystems: this.getKeyedPresets("ecosystems", "ecosystemLabels"),
      seniority: this.getMultiValuePresetsWithTransform("seniority"),
      workModes: this.getKeyedPresets("workModes", "workModeLabels"),
      availability: this.getKeyedPresets("availability", "availabilityLabels"),
      cities: this.getKeyedPresets("cities", "cityLabels"),
      regions: this.getKeyedPresets("regions", "regionLabels"),
      countries: this.getKeyedPresets("countries", "countryLabels"),
      continents: this.getKeyedPresets("continents", "continentLabels"),
      timezones: this.getKeyedPresets("timezones", "timezoneLabels"),
      collaborationHours: this.getKeyedPresets(
        "collaborationHours",
        "collaborationHourLabels",
      ),
      currentMaintainers: this.getTeamRangePresets("currentMaintainers"),
      activeLeads: this.getTeamRangePresets("activeLeads"),
      newActiveLeads: this.getTeamSingleSelectPresets("newActiveLeads"),
      steppedDownLeads: this.getTeamSingleSelectPresets("steppedDownLeads"),
      movedLeads: this.getTeamSingleSelectPresets("movedLeads"),
      earlyLeadDepartures: this.getTeamSingleSelectPresets(
        "earlyLeadDepartures",
      ),
      recentlyFunded: this.getSingleSelectPresets("recentlyFunded"),
      token: this.getSingleSelectPresets("token"),
      onboardIntoWeb3: this.getSingleSelectPresets("onboardIntoWeb3"),
      expertJobs: this.getSingleSelectPresets("expertJobs"),
      order: this.getSingleSelectPresets("order"),
      orderBy: this.getSingleSelectPresets("orderBy"),
    });
  }
}
