export enum FilterKind {
  SINGLE_SELECT = "SINGLE_SELECT",
  RANGE = "RANGE",
  MULTI_SELECT = "MULTI_SELECT",
  MULTI_SELECT_WITH_SEARCH = "MULTI_SELECT_WITH_SEARCH",
}

export const SINGLE_SELECT_OPTIONS = {
  hasProjects: [
    { label: "Has projects", value: true },
    { label: "Has no projects", value: false },
  ],
  hasJobs: [
    { label: "Has jobs", value: true },
    { label: "Has no jobs", value: false },
  ],
  order: [
    { label: "Ascending", value: "asc" },
    { label: "Descending", value: "desc" },
  ],
  orderBy: [
    { label: "Head Count", value: "headcountEstimate" },
    { label: "Most Recent Jobpost", value: "recentJobDate" },
    { label: "Most Recent Funding Date", value: "recentFundingDate" },
  ],
};

export const FILTER_CONFIG_PRESETS = {
  locations: {
    position: 1,
    label: "Locations",
    show: true,
    googleAnalyticsEventName: "filter_orglist_locations",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  headcountEstimate: {
    position: 2,
    label: "Head Count",
    show: false,
    googleAnalyticsEventName: "filter_orglist_head_count",
    kind: FilterKind.RANGE,
    prefix: null,
  },
  fundingRounds: {
    position: 3,
    label: "Funding Rounds",
    show: true,
    googleAnalyticsEventName: "filter_orglist_funding_rounds",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  investors: {
    position: 4,
    label: "Investors",
    show: true,
    googleAnalyticsEventName: "filter_orglist_investors",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  hasJobs: {
    position: 5,
    label: "Has Jobs",
    show: true,
    googleAnalyticsEventName: "filter_orglist_has_jobs",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.hasJobs,
  },
  hasProjects: {
    position: 6,
    label: "Has Projects",
    show: true,
    googleAnalyticsEventName: "filter_orglist_has_projects",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.hasProjects,
  },
  order: {
    position: 7,
    label: "Order",
    show: true,
    googleAnalyticsEventName: "filter_orglist_order",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.order,
  },
  orderBy: {
    position: 8,
    label: "Order By",
    show: true,
    googleAnalyticsEventName: "filter_orglist_order_by",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.orderBy,
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  locations: "locations",
  headcountEstimate: {
    lowest: "minHeadCount",
    highest: "maxHeadCount",
  },
  fundingRounds: "fundingRounds",
  investors: "investors",
  hasJobs: "hasJobs",
  hasProjects: "hasProjects",
  order: "order",
  orderBy: "orderBy",
};
