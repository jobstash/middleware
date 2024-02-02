export enum FilterKind {
  SINGLE_SELECT = "SINGLE_SELECT",
  RANGE = "RANGE",
  MULTI_SELECT = "MULTI_SELECT",
  MULTI_SELECT_WITH_SEARCH = "MULTI_SELECT_WITH_SEARCH",
}

export const SINGLE_SELECT_OPTIONS = {
  publicationDate: [
    { label: "Today", value: "today" },
    { label: "This Week", value: "this-week" },
    { label: "This Month", value: "this-month" },
    { label: "Past 2 Weeks", value: "past-2-weeks" },
    { label: "Past 3 Months", value: "past-3-months" },
    { label: "Past 6 Months", value: "past-6-months" },
  ],
  hacks: [
    { label: "Has been hacked", value: true },
    { label: "Has not been hacked", value: false },
  ],
  audits: [
    { label: "Has Audits", value: true },
    { label: "Has No Audits", value: false },
  ],
  mainNet: [
    { label: "Deployed on Mainnet", value: true },
    { label: "Not Deployed on Mainnet", value: false },
  ],
  token: [
    { label: "Has Token", value: true },
    { label: "Has No Token", value: false },
  ],
  order: [
    { label: "A-Z", value: "asc" },
    { label: "Z-A", value: "desc" },
  ],
  orderBy: [
    { label: "Funding Date", value: "fundingDate" },
    { label: "Head Count", value: "headcountEstimate" },
    { label: "Monthly Fees", value: "monthlyFees" },
    { label: "Monthly Revenue", value: "monthlyRevenue" },
    { label: "Monthly Volume", value: "monthlyVolume" },
    { label: "Number of Audits", value: "audits" },
    { label: "Number of Chains", value: "chains" },
    { label: "Number of Hacks", value: "hacks" },
    { label: "Publication Date", value: "publicationDate" },
    { label: "Salary", value: "salary" },
    { label: "TVL", value: "tvl" },
    { label: "Team Size", value: "teamSize" },
  ],
};

export const FILTER_CONFIG_PRESETS = {
  publicationDate: {
    position: 0,
    label: "Publication Date",
    show: true,
    googleAnalyticsEventName: "filter_joblist_publication_date",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.publicationDate,
  },
  classifications: {
    position: 1,
    label: "Category",
    show: true,
    googleAnalyticsEventName: "filter_joblist_classifications",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  commitments: {
    position: 2,
    label: "Commitment",
    show: true,
    googleAnalyticsEventName: "filter_joblist_commitments",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  communities: {
    position: 3,
    label: "Communities",
    show: false,
    googleAnalyticsEventName: "filter_joblist_communities",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  salary: {
    position: 4,
    label: "Salary",
    show: true,
    googleAnalyticsEventName: "filter_joblist_salary",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  seniority: {
    position: 5,
    label: "Seniority",
    show: true,
    googleAnalyticsEventName: "filter_joblist_seniority",
    kind: FilterKind.MULTI_SELECT,
  },
  locations: {
    position: 6,
    label: "Location",
    show: true,
    googleAnalyticsEventName: "filter_joblist_location",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  headcountEstimate: {
    position: 7,
    label: "Head Count",
    show: true,
    googleAnalyticsEventName: "filter_joblist_head_count",
    kind: FilterKind.RANGE,
    prefix: null,
  },
  tags: {
    position: 8,
    label: "Technologies",
    show: false,
    googleAnalyticsEventName: "filter_joblist_tags",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  fundingRounds: {
    position: 9,
    label: "Funding Rounds",
    show: true,
    googleAnalyticsEventName: "filter_joblist_funding_rounds",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  investors: {
    position: 10,
    label: "Investors",
    show: true,
    googleAnalyticsEventName: "filter_joblist_investors",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  organizations: {
    position: 11,
    label: "Organizations",
    show: true,
    googleAnalyticsEventName: "filter_joblist_organizations",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  audits: {
    position: 12,
    label: "Audits",
    show: false,
    googleAnalyticsEventName: "filter_joblist_audits",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.audits,
  },
  hacks: {
    position: 13,
    label: "Hacks",
    show: false,
    googleAnalyticsEventName: "filter_joblist_hacks",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.hacks,
  },
  chains: {
    position: 14,
    label: "Chains",
    show: false,
    googleAnalyticsEventName: "filter_joblist_chains",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  projects: {
    position: 15,
    label: "Projects",
    show: false,
    googleAnalyticsEventName: "filter_joblist_projects",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },

  tvl: {
    position: 16,
    label: "TVL",
    show: false,
    googleAnalyticsEventName: "filter_joblist_tvl",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyVolume: {
    position: 17,
    label: "Volume/mo",
    show: false,
    googleAnalyticsEventName: "filter_joblist_monthly_volume",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyFees: {
    position: 18,
    label: "Fees/mo",
    show: false,
    googleAnalyticsEventName: "filter_joblist_monthly_fees",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyRevenue: {
    position: 19,
    label: "Revenue/mo",
    show: false,
    googleAnalyticsEventName: "filter_joblist_monthly_revenue",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  mainNet: {
    position: 20,
    label: "Mainnet",
    show: false,
    googleAnalyticsEventName: "filter_joblist_is_mainet",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.mainNet,
  },
  token: {
    position: 21,
    label: "Has Token",
    show: false,
    googleAnalyticsEventName: "filter_joblist_has_token",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.token,
  },
  order: {
    position: 22,
    label: "Order",
    show: true,
    googleAnalyticsEventName: "filter_joblist_order",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.order,
  },
  orderBy: {
    position: 23,
    label: "Order By",
    show: true,
    googleAnalyticsEventName: "filter_joblist_order_by",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.orderBy,
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  publicationDate: "publicationDate",
  salary: {
    lowest: "minSalaryRange",
    highest: "maxSalaryRange",
  },
  seniority: "seniority",
  locations: "locations",
  headcountEstimate: {
    lowest: "minHeadCount",
    highest: "maxHeadCount",
  },
  tags: "tags",
  fundingRounds: "fundingRounds",
  investors: "investors",
  organizations: "organizations",
  chains: "chains",
  projects: "projects",
  classifications: "classifications",
  commitments: "commitments",
  communities: "communities",
  tvl: {
    lowest: "minTvl",
    highest: "maxTvl",
  },
  monthlyVolume: {
    lowest: "minMonthlyVolume",
    highest: "maxMonthlyVolume",
  },
  monthlyFees: {
    lowest: "minMonthlyFees",
    highest: "maxMonthlyFees",
  },
  monthlyRevenue: {
    lowest: "minMonthlyRevenue",
    highest: "maxMonthlyRevenue",
  },
  audits: "audits",
  hacks: "hacks",
  mainNet: "mainNet",
  token: "token",
  order: "order",
  orderBy: "orderBy",
};
