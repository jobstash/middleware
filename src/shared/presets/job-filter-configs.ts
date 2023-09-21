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
    { label: "Head Count", value: "headCount" },
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
    googleAnalyticsEventName: "FILTER_BY_PUBLICATION_DATE",
    googleAnalyticsEventId: null,
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.publicationDate,
  },
  salary: {
    position: 1,
    label: "Salary",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_SALARY",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  seniority: {
    position: 2,
    label: "Seniority",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_SENIORITY",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT,
  },
  locations: {
    position: 3,
    label: "Locations",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_LOCATIONS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  teamSize: {
    position: 4,
    label: "Team Size",
    show: false,
    googleAnalyticsEventName: "FILTER_BY_TEAM_SIZE",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: null,
  },
  headCount: {
    position: 5,
    label: "Head Count",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_HEADCOUNT",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: null,
  },
  tech: {
    position: 6,
    label: "Technologies",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_TECHNOLOGIES",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  fundingRounds: {
    position: 7,
    label: "Funding Rounds",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_FUNDING_ROUNDS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  investors: {
    position: 8,
    label: "Investors",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_INVESTORS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  organizations: {
    position: 9,
    label: "Organizations",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_ORGANIZATIONS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  chains: {
    position: 10,
    label: "Chains",
    show: false,
    googleAnalyticsEventName: "FILTER_BY_CHAINS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  projects: {
    position: 11,
    label: "Projects",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_PROJECTS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  categories: {
    position: 12,
    label: "Categories",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_CATEGORIES",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  tvl: {
    position: 13,
    label: "TVL",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_TVL",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyVolume: {
    position: 14,
    label: "Volume/mo",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_MONTHLY_VOLUME",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyFees: {
    position: 15,
    label: "Fees/mo",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_MONTHLY_FEES",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyRevenue: {
    position: 16,
    label: "Revenue/mo",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_MONTHLY_REVENUE",
    googleAnalyticsEventId: null,
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  audits: {
    position: 17,
    label: "Audits",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_AUDITS",
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  hacks: {
    position: 18,
    label: "Hacks",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_HACKS",
    googleAnalyticsEventId: null,
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.hacks,
  },
  mainNet: {
    position: 19,
    label: "Mainnet",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_MAINNET",
    googleAnalyticsEventId: null,
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.mainNet,
  },
  token: {
    position: 20,
    label: "Has Token",
    show: true,
    googleAnalyticsEventName: "FILTER_BY_TOKEN",
    googleAnalyticsEventId: null,
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.token,
  },
  order: {
    position: 21,
    label: "Order Direction",
    show: true,
    googleAnalyticsEventName: "FILTER_ORDER_DIRECTION",
    googleAnalyticsEventId: null,
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.order,
  },
  orderBy: {
    position: 22,
    label: "Order By",
    show: true,
    googleAnalyticsEventName: "FILTER_ORDER_BY",
    googleAnalyticsEventId: null,
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
  teamSize: {
    lowest: "minTeamSize",
    highest: "maxTeamSize",
  },
  headCount: {
    lowest: "minHeadCount",
    highest: "maxHeadCount",
  },
  tech: "tech",
  fundingRounds: "fundingRounds",
  investors: "investors",
  organizations: "organizations",
  chains: "chains",
  projects: "projects",
  categories: "categories",
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
