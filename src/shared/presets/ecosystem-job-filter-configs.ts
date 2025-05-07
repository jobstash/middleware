import {
  SINGLE_SELECT_OPTIONS as SINGLE_SELECT_DEFAULTS,
  FILTER_CONFIG_PRESETS as FILTER_CONFIG_DEFAULTS,
  FILTER_PARAM_KEY_PRESETS as FILTER_PARAM_KEY_DEFAULTS,
} from "./job-filter-configs";

export enum FilterKind {
  SINGLE_SELECT = "SINGLE_SELECT",
  RANGE = "RANGE",
  MULTI_SELECT = "MULTI_SELECT",
  MULTI_SELECT_WITH_SEARCH = "MULTI_SELECT_WITH_SEARCH",
}

export const SINGLE_SELECT_OPTIONS = {
  ...SINGLE_SELECT_DEFAULTS,
  online: [
    { label: "Online", value: true },
    { label: "Offline", value: false },
  ],
  blocked: [
    { label: "Blocked", value: true },
    { label: "Not Blocked", value: false },
  ],
};

export const FILTER_CONFIG_PRESETS = {
  ...FILTER_CONFIG_DEFAULTS,
  online: {
    position: 23,
    label: "Online Status",
    show: true,
    googleAnalyticsEventName: "filter_joblist_online",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.online,
  },
  blocked: {
    position: 23,
    label: "Blocked Status",
    show: true,
    googleAnalyticsEventName: "filter_joblist_blocked",
    kind: FilterKind.SINGLE_SELECT,
    options: SINGLE_SELECT_OPTIONS.blocked,
  },
};

export const FILTER_PARAM_KEY_PRESETS = {
  ...FILTER_PARAM_KEY_DEFAULTS,
  online: "online",
  blocked: "blocked",
};
