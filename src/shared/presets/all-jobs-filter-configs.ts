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
    googleAnalyticsEventName: "filter_alljobslist_organizations",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
  category: {
    position: 2,
    label: "Category",
    show: true,
    googleAnalyticsEventName: "filter_alljobslist_category",
    kind: FilterKind.MULTI_SELECT_WITH_SEARCH,
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  organizations: "organizations",
  category: "category",
};
