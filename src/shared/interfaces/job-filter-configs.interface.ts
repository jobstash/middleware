import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  OmitType,
} from "@nestjs/swagger";

class FilterConfigField {
  @ApiProperty()
  position: number;
  @ApiProperty()
  label: string;
  @ApiProperty()
  show: boolean;
  @ApiPropertyOptional()
  googleAnalyticsEventName?: string;
  @ApiPropertyOptional()
  googleAnalyticsEventId?: string;
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
  @ApiPropertyOptional()
  value?: number;
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
  @ApiPropertyOptional({
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
  options?: FilterConfigLabel[];
  @ApiProperty()
  paramKey: string;
}

class SingleSelectFilter extends FilterConfigLabeledValues {
  @ApiProperty()
  kind: string;
}

class MultiSelectFilter extends FilterConfigLabeledValues {
  @ApiProperty()
  kind: string;
}

class MultiSelectSearchFilter extends FilterConfigLabeledValues {
  @ApiProperty()
  kind: string;
}

class RangeFilter extends FilterConfigField {
  @ApiProperty()
  kind: string;
  @ApiProperty()
  stepSize: number;
  @ApiProperty()
  value: Range;
}

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class JobFilterConfigs {
  @ApiProperty()
  publicationDate: SingleSelectFilter;
  @ApiProperty()
  salary: RangeFilter;
  @ApiProperty()
  seniority: MultiSelectFilter;
  @ApiProperty()
  locations: MultiSelectFilter;
  @ApiProperty()
  teamSize: RangeFilter;
  @ApiProperty()
  headCount: RangeFilter;
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
  monthlyFees: RangeFilter;
  @ApiProperty()
  monthlyRevenue: RangeFilter;
  @ApiProperty()
  audits: RangeFilter;
  @ApiProperty()
  hacks: RangeFilter;
  @ApiProperty()
  mainNet: SingleSelectFilter;
  @ApiProperty()
  token: SingleSelectFilter;
  @ApiProperty()
  order: SingleSelectFilter;
  @ApiProperty()
  orderBy: SingleSelectFilter;
}
