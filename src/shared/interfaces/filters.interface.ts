import {
  ApiProperty,
  ApiPropertyOptional,
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

  constructor(raw: FilterConfigField) {
    const { show, label, position, googleAnalyticsEventName } = raw;
    const result = FilterConfigField.FilterConfigFieldType.decode(raw);

    this.show = show;
    this.label = label;
    this.position = position;
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
    googleAnalyticsEventName: t.union([t.string, t.null]),
    options: t.array(FilterConfigLabel.FilterConfigLabelType),
  });
  @ApiPropertyOptional({
    type: "array",
    items: {
      $ref: getSchemaPath(FilterConfigLabel),
    },
  })
  options: FilterConfigLabel[];
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

export class MultiSelectFilter extends FilterConfigLabeledValues {
  public static readonly MultiSelectFilterType = t.intersection([
    FilterConfigLabeledValues.FilterConfigLabeledValuesType,
    t.strict({ kind: t.string }),
  ]);

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

export class RangeFilter extends FilterConfigField {
  public static readonly RangeFilterType = t.intersection([
    FilterConfigField.FilterConfigFieldType,
    t.strict({
      kind: t.string,
      prefix: t.union([t.string, t.null]),
      value: Range.RangeType,
    }),
  ]);

  @ApiProperty()
  kind: string;
  @ApiProperty()
  prefix: string | null;
  @ApiProperty()
  value: Range;

  constructor(raw: RangeFilter) {
    const { kind, prefix, value, ...parentProps } = raw;
    super(parentProps);
    const result = RangeFilter.RangeFilterType.decode(raw);

    this.kind = kind;
    this.prefix = prefix;
    this.value = value;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export type SelectFilter = MultiSelectFilter | SingleSelectFilter;
