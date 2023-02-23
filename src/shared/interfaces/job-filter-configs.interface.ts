import { OmitType } from "@nestjs/mapped-types";
import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";

class FilterConfigField {
  @ApiProperty()
  position: number;
  @ApiProperty()
  label: string;
  @ApiProperty()
  show: boolean;
  @ApiProperty()
  googleAnalyticsEventName: string;
  @ApiProperty()
  googleAnalyticsEventId: string;
}

class FilterConfigLabel {
  @ApiProperty()
  label: string;
  @ApiProperty()
  value: string;
}

class NumberWithParamKey {
  @ApiProperty()
  paramKey: string;
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
  @ApiProperty()
  kind: "BOOLEAN";
}

class DateFilter extends FilterConfigField {
  @ApiProperty()
  kind: "DATE";
  @ApiProperty()
  stepSize: number;
  @ApiProperty()
  value: Range;
}

class MultiSelectFilter extends FilterConfigLabeledValues {
  @ApiProperty()
  kind: "MULTI_SELECT";
}

class MultiSelectSearchFilter extends FilterConfigLabeledValues {
  @ApiProperty()
  kind: "MULTI_SELECT_WITH_SEARCH";
}

class RangeFilter extends FilterConfigField {
  @ApiProperty()
  kind: "RANGE";
  @ApiProperty()
  stepSize: number;
  @ApiProperty()
  value: Range;
}

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class JobFilterConfigs {
  @ApiProperty()
  publicationDate: DateFilter;
  @ApiProperty()
  salary: RangeFilter;
  @ApiProperty()
  level: RangeFilter;
  @ApiProperty()
  location: MultiSelectFilter;
  @ApiProperty()
  teamSize: RangeFilter;
  @ApiProperty()
  employeeCount: RangeFilter;
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
  monthlyVolume: RangeFilter;
  @ApiProperty()
  monthlyActiveUsers: RangeFilter;
  @ApiProperty()
  monthlyRevenue: RangeFilter;
  @ApiProperty()
  audits: RangeFilter;
  @ApiProperty()
  hacks: RangeFilter;
  @ApiProperty()
  mainnet: BooleanFilter;
  @ApiProperty()
  token: BooleanFilter;
}
