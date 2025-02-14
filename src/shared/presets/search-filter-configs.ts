export enum FilterKind {
  SINGLE_SELECT = "SINGLE_SELECT",
  RANGE = "RANGE",
  MULTI_SELECT = "MULTI_SELECT",
  ORDER = "ORDER",
  ORDER_BY = "ORDER_BY",
}

export const SINGLE_SELECT_OPTIONS = {
  projects: {
    hasHacks: [
      { label: "Has been hacked", value: true },
      { label: "Has not been hacked", value: false },
    ],
    hasAudits: [
      { label: "Has Audits", value: true },
      { label: "Has No Audits", value: false },
    ],
    hasToken: [
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
      { label: "Most Recent Funding Date", value: "recentFundingDate" },
      { label: "TVL", value: "tvl" },
    ],
  },
  organizations: {
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
      { label: "Most Recent Funding Date", value: "recentFundingDate" },
      { label: "Rating", value: "rating" },
      { label: "Name", value: "name" },
    ],
  },
  grants: {
    order: [
      { label: "Ascending", value: "asc" },
      { label: "Descending", value: "desc" },
    ],
    orderBy: [
      { label: "Date", value: "date" },
      { label: "Program Budget", value: "programBudget" },
    ],
  },
  impact: {
    order: [
      { label: "Ascending", value: "asc" },
      { label: "Descending", value: "desc" },
    ],
    orderBy: [
      { label: "Match Amount", value: "matchAmount" },
      { label: "Payout Time", value: "payoutTime" },
      { label: "Donated Amount", value: "donatedAmount" },
    ],
  },
  vcs: null,
};

export const FILTER_CONFIG_PRESETS = {
  projects: {
    ecosystems: {
      position: 1,
      label: "Ecosystems",
      show: true,
      googleAnalyticsEventName: "filter_search_ecosystems",
      kind: FilterKind.MULTI_SELECT,
      prefix: null,
    },
    communities: {
      position: 2,
      label: "Communities",
      show: true,
      googleAnalyticsEventName: "filter_search_communities",
      kind: FilterKind.MULTI_SELECT,
      prefix: null,
    },
    tvl: {
      position: 3,
      label: "TVL",
      show: true,
      googleAnalyticsEventName: "filter_search_tvl",
      kind: FilterKind.RANGE,
      prefix: "$",
    },
    monthlyFees: {
      position: 4,
      label: "Monthly Fees",
      show: true,
      googleAnalyticsEventName: "filter_search_monthly_fees",
      kind: FilterKind.RANGE,
      prefix: "$",
    },
    monthlyVolume: {
      position: 5,
      label: "Monthly Volume",
      show: true,
      googleAnalyticsEventName: "filter_search_monthly_volume",
      kind: FilterKind.RANGE,
      prefix: "$",
    },
    monthlyRevenue: {
      position: 6,
      label: "Monthly Revenue",
      show: true,
      googleAnalyticsEventName: "filter_search_monthly_revenue",
      kind: FilterKind.RANGE,
      prefix: "$",
    },
    hasAudits: {
      position: 7,
      label: "Audits",
      show: true,
      googleAnalyticsEventName: "filter_search_audits",
      kind: FilterKind.SINGLE_SELECT,
      options: SINGLE_SELECT_OPTIONS.projects.hasAudits,
    },
    hasHacks: {
      position: 8,
      label: "Hacks",
      show: true,
      googleAnalyticsEventName: "filter_search_hacks",
      kind: FilterKind.SINGLE_SELECT,
      options: SINGLE_SELECT_OPTIONS.projects.hasHacks,
    },
    hasToken: {
      position: 9,
      label: "Token",
      show: true,
      googleAnalyticsEventName: "filter_search_token",
      kind: FilterKind.SINGLE_SELECT,
      options: SINGLE_SELECT_OPTIONS.projects.hasToken,
    },
    order: {
      position: 10,
      label: "Order",
      show: true,
      googleAnalyticsEventName: "filter_search_order",
      kind: FilterKind.ORDER,
      options: SINGLE_SELECT_OPTIONS.projects.order,
    },
    orderBy: {
      position: 11,
      label: "Order By",
      show: true,
      googleAnalyticsEventName: "filter_search_order_by",
      kind: FilterKind.ORDER_BY,
      options: SINGLE_SELECT_OPTIONS.projects.orderBy,
    },
  },
  organizations: {
    headCount: {
      position: 1,
      label: "Head Count",
      show: true,
      googleAnalyticsEventName: "filter_search_head_count",
      kind: FilterKind.RANGE,
      prefix: null,
    },
    communities: {
      position: 2,
      label: "Communities",
      show: true,
      googleAnalyticsEventName: "filter_search_communities",
      kind: FilterKind.MULTI_SELECT,
      prefix: null,
    },
    ecosystems: {
      position: 3,
      label: "Ecosystems",
      show: true,
      googleAnalyticsEventName: "filter_search_ecosystems",
      kind: FilterKind.MULTI_SELECT,
      prefix: null,
    },
    hasProjects: {
      position: 4,
      label: "Has Projects",
      show: true,
      googleAnalyticsEventName: "filter_search_has_projects",
      kind: FilterKind.SINGLE_SELECT,
      options: SINGLE_SELECT_OPTIONS.organizations.hasProjects,
    },
    hasJobs: {
      position: 5,
      label: "Has Jobs",
      show: true,
      googleAnalyticsEventName: "filter_search_has_jobs",
      kind: FilterKind.SINGLE_SELECT,
      options: SINGLE_SELECT_OPTIONS.organizations.hasJobs,
    },
    order: {
      position: 6,
      label: "Order",
      show: true,
      googleAnalyticsEventName: "filter_search_order",
      kind: FilterKind.ORDER,
      options: SINGLE_SELECT_OPTIONS.organizations.order,
    },
    orderBy: {
      position: 7,
      label: "Order By",
      show: true,
      googleAnalyticsEventName: "filter_search_order_by",
      kind: FilterKind.ORDER_BY,
      options: SINGLE_SELECT_OPTIONS.organizations.orderBy,
    },
  },
  grants: {
    date: {
      position: 1,
      label: "Date",
      show: true,
      googleAnalyticsEventName: "filter_search_grant_date",
      kind: FilterKind.RANGE,
      prefix: null,
    },
    programBudget: {
      position: 2,
      label: "Program Budget",
      show: true,
      googleAnalyticsEventName: "filter_search_program_budget",
      kind: FilterKind.RANGE,
      prefix: "$",
    },
    order: {
      position: 3,
      label: "Order",
      show: true,
      googleAnalyticsEventName: "filter_search_order",
      kind: FilterKind.ORDER,
      options: SINGLE_SELECT_OPTIONS.grants.order,
    },
    orderBy: {
      position: 4,
      label: "Order By",
      show: true,
      googleAnalyticsEventName: "filter_search_order_by",
      kind: FilterKind.ORDER_BY,
      options: SINGLE_SELECT_OPTIONS.grants.orderBy,
    },
  },
  impact: {
    // TODO: add impact filters
    order: {
      position: 6,
      label: "Order",
      show: true,
      googleAnalyticsEventName: "filter_search_order",
      kind: FilterKind.ORDER,
      options: SINGLE_SELECT_OPTIONS.impact.order,
    },
    orderBy: {
      position: 11,
      label: "Order By",
      show: true,
      googleAnalyticsEventName: "filter_search_order_by",
      kind: FilterKind.ORDER_BY,
      options: SINGLE_SELECT_OPTIONS.impact.orderBy,
    },
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  projects: {
    tvl: {
      lowest: "minTvl",
      highest: "maxTvl",
    },
    monthlyFees: {
      lowest: "minMonthlyFees",
      highest: "maxMonthlyFees",
    },
    monthlyVolume: {
      lowest: "minMonthlyVolume",
      highest: "maxMonthlyVolume",
    },
    monthlyRevenue: {
      lowest: "minMonthlyRevenue",
      highest: "maxMonthlyRevenue",
    },
    hasAudits: "hasAudits",
    hasHacks: "hasHacks",
    hasToken: "hasToken",
    ecosystems: "ecosystems",
    communities: "communities",
    order: "order",
    orderBy: "orderBy",
    organizations: "organizations",
    categories: "categories",
    chains: "chains",
    investors: "investors",
    names: "names",
    tags: "tags",
  },
  organizations: {
    headCount: {
      lowest: "minHeadCount",
      highest: "maxHeadCount",
    },
    communities: "communities",
    ecosystems: "ecosystems",
    hasJobs: "hasJobs",
    hasProjects: "hasProjects",
    order: "order",
    orderBy: "orderBy",
    projects: "projects",
    investors: "investors",
    fundingRounds: "fundingRounds",
    chains: "chains",
    locations: "locations",
    names: "names",
    tags: "tags",
  },
  grants: {
    date: {
      lowest: "minDate",
      highest: "maxDate",
    },
    programBudget: {
      lowest: "minProgramBudget",
      highest: "maxProgramBudget",
    },
    order: "order",
    orderBy: "orderBy",
    categories: "categories",
    chains: "chains",
    ecosystems: "ecosystems",
    organizations: "organizations",
    names: "names",
  },
  impact: {
    order: "order",
    orderBy: "orderBy",
    categories: "categories",
    chains: "chains",
    ecosystems: "ecosystems",
    organizations: "organizations",
    names: "names",
  },
  vcs: null,
};

export const FILTER_PARAM_KEY_REVERSE_PRESETS = {
  projects: {
    minTvl: "tvl",
    maxTvl: "tvl",
    minMonthlyVolume: "monthlyVolume",
    maxMonthlyVolume: "monthlyVolume",
    minMonthlyFees: "monthlyFees",
    maxMonthlyFees: "monthlyFees",
    minMonthlyRevenue: "monthlyRevenue",
    maxMonthlyRevenue: "monthlyRevenue",
    hasAudits: "audits",
    hasHacks: "hacks",
    hasToken: "token",
    ecosystems: "ecosystems",
    communities: "communities",
    order: "order",
    orderBy: "orderBy",
    organizations: "organizations",
    categories: "categories",
    chains: "chains",
    investors: "investors",
    names: "names",
    tags: "tags",
  },
  organizations: {
    minHeadCount: "headCount",
    maxHeadCount: "headCount",
    communities: "communities",
    ecosystems: "ecosystems",
    hasJobs: "hasJobs",
    hasProjects: "hasProjects",
    order: "order",
    orderBy: "orderBy",
    projects: "projects",
    investors: "investors",
    fundingRounds: "fundingRounds",
    chains: "chains",
    locations: "locations",
    names: "names",
    tags: "tags",
  },
  grants: {
    date: {
      lowest: "minDate",
      highest: "maxDate",
    },
    programBudget: {
      lowest: "minProgramBudget",
      highest: "maxProgramBudget",
    },
    order: "order",
    orderBy: "orderBy",
    categories: "categories",
    chains: "chains",
    ecosystems: "ecosystems",
    organizations: "organizations",
    names: "names",
  },
  impact: {
    order: "order",
    orderBy: "orderBy",
    categories: "categories",
    chains: "chains",
    ecosystems: "ecosystems",
    organizations: "organizations",
    names: "names",
  },
  vcs: null,
};
