export const enum FilterKind {
  DATE = 0,
  RANGE = 1,
  BOOLEAN = 2,
  SINGLESELECT = 3,
  MULTISELECT = 4,
  MULTISELECT_WITH_SEARCH = 5,
}

interface FilterConfigField {
  position: number;
  label: string;
  show: boolean;
}

interface FilterConfigLabeledValues<T> {
  value: {
    label: string;
    value: T;
  }[];
}

interface BooleanFilter
  extends FilterConfigField,
    FilterConfigLabeledValues<boolean> {
  kind: FilterKind.BOOLEAN;
}

interface DateFilter
  extends FilterConfigField,
    FilterConfigLabeledValues<number> {
  kind: FilterKind.DATE;
}

interface MultiSelectFilter
  extends FilterConfigField,
    FilterConfigLabeledValues<string> {
  kind: FilterKind.MULTISELECT;
}

interface MultiSelectSearchFilter
  extends FilterConfigField,
    FilterConfigLabeledValues<string> {
  kind: FilterKind.MULTISELECT_WITH_SEARCH;
}

interface RangeFilter extends FilterConfigField {
  kind: FilterKind.RANGE;
  stepSize: number;
  value: {
    lowest: { param_key: string; value: number };
    highest: { param_key: string; value: number };
  };
}

export interface JobFilterConfigs {
  publication_date: DateFilter;
  salary: RangeFilter;
  location: MultiSelectFilter;
  team_size: RangeFilter;
  employee_count: RangeFilter;
  tech: MultiSelectSearchFilter;
  organizations: MultiSelectSearchFilter;
  chains: MultiSelectSearchFilter;
  projects: MultiSelectSearchFilter;
  categories: MultiSelectSearchFilter;
  tvl: RangeFilter;
  monthly_volume: RangeFilter;
  monthly_active_users: RangeFilter;
  monthly_revenue: RangeFilter;
  audits: RangeFilter;
  hacks: RangeFilter;
  mainnet: BooleanFilter;
  token: BooleanFilter;
}
