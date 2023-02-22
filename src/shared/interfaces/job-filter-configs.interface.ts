import { ApiProperty } from "@nestjs/swagger";

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

export class JobFilterConfigs {
  @ApiProperty()
  publication_date: DateFilter;
  @ApiProperty()
  salary: RangeFilter;
  @ApiProperty()
  location: MultiSelectFilter;
  @ApiProperty()
  team_size: RangeFilter;
  @ApiProperty()
  employee_count: RangeFilter;
  @ApiProperty()
  tech: MultiSelectSearchFilter;
  @ApiProperty()
  organizations: MultiSelectSearchFilter;
  @ApiProperty()
  chains: MultiSelectSearchFilter;
  @ApiProperty()
  projects: MultiSelectSearchFilter;
  @ApiProperty()
  categories: MultiSelectSearchFilter;
  @ApiProperty()
  tvl: RangeFilter;
  @ApiProperty()
  monthly_volume: RangeFilter;
  @ApiProperty()
  monthly_active_users: RangeFilter;
  @ApiProperty()
  monthly_revenue: RangeFilter;
  @ApiProperty()
  audits: RangeFilter;
  @ApiProperty()
  hacks: RangeFilter;
  @ApiProperty()
  mainnet: BooleanFilter;
  @ApiProperty()
  token: BooleanFilter;
}
