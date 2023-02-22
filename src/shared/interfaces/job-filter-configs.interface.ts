import { OmitType } from "@nestjs/mapped-types";
import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";

export enum FilterKind {
  DATE = "DATE",
  RANGE = "RANGE",
  BOOLEAN = "BOOLEAN",
  MULTISELECT = "MULTI_SELECT",
  MULTISELECT_WITH_SEARCH = "MULTI_SELECT_WITH_SEARCH",
}

class FilterConfigField {
  @ApiProperty()
  position: number;
  @ApiProperty()
  label: string;
  @ApiProperty()
  show: boolean;
}

class FilterConfigLabel {
  @ApiProperty()
  label: string;
  @ApiProperty()
  value: string;
}

class NumberWithParamKey {
  @ApiProperty()
  param_key: string;
  @ApiProperty()
  value: number;
}

class Range {
  @ApiProperty()
  lowest: NumberWithParamKey;
  @ApiProperty()
  highest: NumberWithParamKey;
}

class FilterConfigLabeledValues extends OmitType(FilterConfigField, [
  "label",
] as const) {
  @ApiProperty({
    type: "array",
    items: {
      $ref: getSchemaPath(FilterConfigLabel),
      properties: {
        label: {
          type: "string",
        },
        value: {
          type: "string",
        },
      },
    },
  })
  options: FilterConfigLabel[];
}

class BooleanFilter extends FilterConfigField {
  @ApiProperty({ type: "BOOLEAN" })
  kind: "BOOLEAN";
}

class DateFilter extends FilterConfigField {
  @ApiProperty({ type: "DATE" })
  kind: "DATE";
  @ApiProperty()
  stepSize: number;
  @ApiProperty()
  value: Range;
}

class MultiSelectFilter extends FilterConfigLabeledValues {
  @ApiProperty({ type: "MULTI_SELECT" })
  kind: "MULTI_SELECT";
}

class MultiSelectSearchFilter extends FilterConfigLabeledValues {
  @ApiProperty({ type: "MULTI_SELECT_WITH_SEARCH" })
  kind: "MULTI_SELECT_WITH_SEARCH";
}

class RangeFilter extends FilterConfigField {
  @ApiProperty({ type: "RANGE" })
  kind: "RANGE";
  @ApiProperty()
  stepSize: number;
  @ApiProperty()
  value: Range;
}

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
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
