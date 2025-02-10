import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { FilterConfigField } from "./filters.interface";
import { ApiProperty } from "@nestjs/swagger";

class RangeFilterValue {
  public static readonly RangeFilterValueType = t.strict({
    value: t.number,
    paramKey: t.string,
  });

  @ApiProperty()
  value: number;
  @ApiProperty()
  paramKey: string;

  constructor(raw: RangeFilterValue) {
    const { value, paramKey } = raw;
    const result = RangeFilterValue.RangeFilterValueType.decode(raw);

    this.value = value;
    this.paramKey = paramKey;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}

export class SearchRangeFilter extends FilterConfigField {
  public static readonly SearchRangeFilterType = t.intersection([
    FilterConfigField.FilterConfigFieldType,
    t.strict({
      kind: t.literal("RANGE"),
      min: RangeFilterValue.RangeFilterValueType,
      max: RangeFilterValue.RangeFilterValueType,
      prefix: t.union([t.string, t.null]),
    }),
  ]);

  @ApiProperty()
  kind: string;
  @ApiProperty()
  prefix: string | null;
  @ApiProperty()
  min: RangeFilterValue;
  @ApiProperty()
  max: RangeFilterValue;

  constructor(raw: SearchRangeFilter) {
    const { kind, prefix, min, max, ...parentProps } = raw;
    super(parentProps);
    const result = SearchRangeFilter.SearchRangeFilterType.decode(raw);

    this.kind = kind;
    this.prefix = prefix;
    this.min = min;
    this.max = max;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
