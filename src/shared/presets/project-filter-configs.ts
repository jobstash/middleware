export enum FilterKind {
  SINGLE_SELECT = "SINGLE_SELECT",
  RANGE = "RANGE",
  MULTI_SELECT = "MULTI_SELECT",
  MULTI_SELECT_WITH_SEARCH = "MULTI_SELECT_WITH_SEARCH",
}

export const SINGLE_SELECT_OPTIONS = {
  hacks: [
    { label: "Has been hacked", value: true },
    { label: "Has not been hacked", value: false },
  ],
  audits: [
    { label: "Has Audits", value: true },
    { label: "Has No Audits", value: false },
  ],
  token: [
    { label: "Has Token", value: true },
    { label: "Has No Token", value: false },
  ],
  order: [
    { label: "Ascending", value: "asc" },
    { label: "Descending", value: "desc" },
  ],
  orderBy: [
    { label: "Monthly Fees", value: "monthlyFees" },
    { label: "Monthly Revenue", value: "monthlyRevenue" },
    { label: "Monthly Volume", value: "monthlyVolume" },
    { label: "Number of Audits", value: "audits" },
    { label: "Number of Chains", value: "chains" },
    { label: "Number of Hacks", value: "hacks" },
    { label: "TVL", value: "tvl" },
  ],
};

export const FILTER_CONFIG_PRESETS = {
  organizations: {
    position: 1,
    label: "Organizations",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_organizations",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  chains: {
    position: 2,
    label: "Chains",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_chains",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  ecosystems: {
    position: 3,
    label: "Ecosystems",
    show: false,
    googleAnalyticsEventName: "filter_projectlist_ecosystems",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  categories: {
    position: 4,
    label: "Categories",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_categories",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  investors: {
    position: 5,
    label: "Investors",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_investors",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  tvl: {
    position: 6,
    label: "TVL",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_tvl",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyVolume: {
    position: 7,
    label: "Volume/mo",
    show: false,
    googleAnalyticsEventName: "filter_projectlist_monthly_volume",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyFees: {
    position: 8,
    label: "Fees/mo",
    show: false,
    googleAnalyticsEventName: "filter_projectlist_monthly_fees",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  monthlyRevenue: {
    position: 9,
    label: "Revenue/mo",
    show: false,
    googleAnalyticsEventName: "filter_projectlist_monthly_revenue",
    kind: FilterKind.RANGE,
    prefix: "$",
  },
  audits: {
    position: 10,
    label: "Audits",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_audits",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.audits,
  },
  hacks: {
    position: 11,
    label: "Hacks",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_hacks",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.hacks,
  },
  token: {
    position: 12,
    label: "Has Token",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_has_token",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.token,
  },
  order: {
    position: 13,
    label: "Order",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_order",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.order,
  },
  orderBy: {
    position: 14,
    label: "Order By",
    show: true,
    googleAnalyticsEventName: "filter_projectlist_order_by",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.orderBy,
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  organizations: "organizations",
  chains: "chains",
  ecosystems: "ecosystems",
  categories: "categories",
  investors: "investors",
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
  token: "token",
  order: "order",
  orderBy: "orderBy",
};
