export enum FilterKind {
  SINGLE_SELECT = "SINGLE_SELECT",
  RANGE = "RANGE",
  MULTI_SELECT = "MULTI_SELECT",
  MULTI_SELECT_WITH_SEARCH = "MULTI_SELECT_WITH_SEARCH",
}

export const FILTER_CONFIG_PRESETS = {
  organizations: {
    position: 1,
    label: "Organizations",
    show: true,
    googleAnalyticsEventName: null,
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  categories: {
    position: 2,
    label: "Categories",
    show: true,
    googleAnalyticsEventName: null,
    googleAnalyticsEventId: null,
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  organizations: "organizations",
  categories: "categories",
};
