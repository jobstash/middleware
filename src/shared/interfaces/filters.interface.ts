import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  getSchemaPath,
} from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class FilterConfigField {
  public static readonly FilterConfigFieldType = t.strict({
    label: t.string,
    show: t.boolean,
    position: t.number,
    googleAnalyticsEventId: t.union([t.string, t.null]),
    googleAnalyticsEventName: t.union([t.string, t.null]),
  });

  @ApiProperty()
  position: number;
  @ApiProperty()
  label: string;
  @ApiProperty()
  show: boolean;
  @ApiPropertyOptional()
  googleAnalyticsEventName: string | null;
  @ApiPropertyOptional()
  googleAnalyticsEventId: string | null;

  constructor(raw: FilterConfigField) {
    const {
      show,
      label,
      position,
      googleAnalyticsEventId,
      googleAnalyticsEventName,
    } = raw;
    const result = FilterConfigField.FilterConfigFieldType.decode(raw);

    this.show = show;
    this.label = label;
    this.position = position;
    this.googleAnalyticsEventId = googleAnalyticsEventId;
    this.googleAnalyticsEventName = googleAnalyticsEventName;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class FilterConfigLabel {
  public static readonly FilterConfigLabelType = t.strict({
    label: t.string,
    value: t.union([t.string, t.boolean]),
  });

  @ApiProperty()
  label: string;
  @ApiProperty()
  value: string | boolean;

  constructor(raw: FilterConfigLabel) {
    const { label, value } = raw;
    const result = FilterConfigLabel.FilterConfigLabelType.decode(raw);

    this.label = label;
    this.value = value;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class NumberWithParamKey {
  public static readonly NumberWithParamKeyType = t.strict({
    paramKey: t.string,
    value: t.union([t.number, t.null]),
  });

  @ApiProperty()
  paramKey: string;
  @ApiPropertyOptional()
  value: number | null;

  constructor(raw: NumberWithParamKey) {
    const { paramKey, value } = raw;
    const result = NumberWithParamKey.NumberWithParamKeyType.decode(raw);

    this.paramKey = paramKey;
    this.value = value;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class Range {
  public static readonly RangeType = t.strict({
    lowest: NumberWithParamKey.NumberWithParamKeyType,
    highest: NumberWithParamKey.NumberWithParamKeyType,
  });

  @ApiProperty()
  lowest: NumberWithParamKey;
  @ApiProperty()
  highest: NumberWithParamKey;

  constructor(raw: Range) {
    const { lowest, highest } = raw;
    const result = Range.RangeType.decode(raw);

    this.lowest = lowest;
    this.highest = highest;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class FilterConfigLabeledValues extends FilterConfigField {
  public static readonly FilterConfigLabeledValuesType = t.strict({
    show: t.boolean,
    position: t.number,
    paramKey: t.string,
    label: t.string,
    googleAnalyticsEventId: t.union([t.string, t.null]),
    googleAnalyticsEventName: t.union([t.string, t.null]),
    options: t.array(FilterConfigLabel.FilterConfigLabelType),
  });
  @ApiPropertyOptional({
    type: "array",
    items: {
      $ref: getSchemaPath(FilterConfigLabel),
    },
  })
  options: FilterConfigLabel[] | string[];
  @ApiProperty()
  paramKey: string;

  constructor(raw: FilterConfigLabeledValues) {
    const { options, paramKey, ...parentProps } = raw;
    super(parentProps);
    const result =
      FilterConfigLabeledValues.FilterConfigLabeledValuesType.decode(raw);

    this.options = options;
    this.paramKey = paramKey;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class SingleSelectFilter extends FilterConfigLabeledValues {
  public static readonly SingleSelectFilterType = t.intersection([
    FilterConfigLabeledValues.FilterConfigLabeledValuesType,
    t.strict({ kind: t.string }),
  ]);

  @ApiProperty()
  kind: string;

  constructor(raw: SingleSelectFilter) {
    const { kind, ...parentProps } = raw;
    super(parentProps);
    const result = SingleSelectFilter.SingleSelectFilterType.decode(raw);

    this.kind = kind;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class MultiSelectFilter extends OmitType(FilterConfigLabeledValues, [
  "options",
] as const) {
  public static readonly MultiSelectFilterType = t.strict({
    show: t.boolean,
    position: t.number,
    paramKey: t.string,
    label: t.string,
    googleAnalyticsEventId: t.union([t.string, t.null]),
    googleAnalyticsEventName: t.union([t.string, t.null]),
    options: t.array(t.string),
    kind: t.string,
  });

  @ApiProperty()
  options: string[];

  @ApiProperty()
  kind: string;

  constructor(raw: MultiSelectFilter) {
    const { kind, ...parentProps } = raw;
    super(parentProps);
    const result = MultiSelectFilter.MultiSelectFilterType.decode(raw);

    this.kind = kind;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class MultiSelectSearchFilter extends OmitType(
  FilterConfigLabeledValues,
  ["options"] as const,
) {
  public static readonly MultiSelectSearchFilterType = t.strict({
    show: t.boolean,
    position: t.number,
    paramKey: t.string,
    label: t.string,
    googleAnalyticsEventId: t.union([t.string, t.null]),
    googleAnalyticsEventName: t.union([t.string, t.null]),
    options: t.array(t.string),
    kind: t.string,
  });

  @ApiProperty()
  options: string[];

  @ApiProperty()
  kind: string;

  constructor(raw: MultiSelectFilter) {
    const { kind, ...parentProps } = raw;
    super(parentProps);
    const result =
      MultiSelectSearchFilter.MultiSelectSearchFilterType.decode(raw);

    this.kind = kind;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class RangeFilter extends FilterConfigField {
  public static readonly RangeFilterType = t.intersection([
    FilterConfigField.FilterConfigFieldType,
    t.strict({ kind: t.string, stepSize: t.number, value: Range.RangeType }),
  ]);

  @ApiProperty()
  kind: string;
  @ApiProperty()
  stepSize: number;
  @ApiProperty()
  value: Range;

  constructor(raw: RangeFilter) {
    const { kind, stepSize, value, ...parentProps } = raw;
    super(parentProps);
    const result = RangeFilter.RangeFilterType.decode(raw);

    this.kind = kind;
    this.stepSize = stepSize;
    this.value = value;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
