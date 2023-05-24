import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  OmitType,
} from "@nestjs/swagger";
import * as t from "io-ts";
import { inferObjectType } from "../helpers";
import { isLeft } from "fp-ts/lib/Either";

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
      throw new Error(
        `Error Serializing FilterConfigField! Constructor expected: \n {
          label: string,
          show: boolean,
          position: number,
          googleAnalyticsEventId: string | null,
          googleAnalyticsEventName: string | null,
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}

export class FilterConfigLabel {
  public static readonly FilterConfigLabelType = t.strict({
    label: t.string,
    value: t.string,
  });

  @ApiProperty()
  label: string;
  @ApiProperty()
  value: string;

  constructor(raw: FilterConfigLabel) {
    const { label, value } = raw;
    const result = FilterConfigLabel.FilterConfigLabelType.decode(raw);

    this.label = label;
    this.value = value;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing FilterConfigLabel! Constructor expected: \n {
          label: string,
          value: string,
        } got ${inferObjectType(raw)}`,
      );
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
      throw new Error(
        `Error Serializing NumberWithParamKey! Constructor expected: \n {
          paramKey: string,
          value: number | null,
        } got ${inferObjectType(raw)}`,
      );
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
      throw new Error(
        `Error Serializing Range! Constructor expected: \n {
          lowest: NumberWithParamKey,
          highest: NumberWithParamKey,
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}

class FilterConfigLabeledValues extends OmitType(FilterConfigField, [
  "label",
] as const) {
  public static readonly FilterConfigLabeledValuesType = t.strict({
    show: t.boolean,
    position: t.number,
    paramKey: t.string,
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
      throw new Error(
        `Error Serializing FilterConfigLabeledValues! Constructor expected: \n {
          show: boolean,
          position: number,
          paramKey: string,
          options: FilterConfigLabel[],
          googleAnalyticsEventId: string | null,
          googleAnalyticsEventName: string | null,
        } got ${inferObjectType(raw)}`,
      );
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
      throw new Error(
        `Error Serializing SingleSelectFilter! Constructor expected: \n {
          ...FilterConfigLabeledValues,
          kind: string,
        } got ${inferObjectType(raw)}`,
      );
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

  constructor(raw: SingleSelectFilter) {
    const { kind, ...parentProps } = raw;
    super(parentProps);
    const result = MultiSelectFilter.MultiSelectFilterType.decode(raw);

    this.kind = kind;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing MultiSelectFilter! Constructor expected: \n {
          ...FilterConfigLabeledValues,
          kind: string,
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}

export class MultiSelectSearchFilter extends FilterConfigLabeledValues {
  public static readonly MultiSelectSearchFilterType = t.intersection([
    FilterConfigLabeledValues.FilterConfigLabeledValuesType,
    t.strict({ kind: t.string }),
  ]);

  @ApiProperty()
  kind: string;

  constructor(raw: SingleSelectFilter) {
    const { kind, ...parentProps } = raw;
    super(parentProps);
    const result =
      MultiSelectSearchFilter.MultiSelectSearchFilterType.decode(raw);

    this.kind = kind;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing MultiSelectSearchFilter! Constructor expected: \n {
          ...FilterConfigLabeledValues,
          kind: string,
        } got ${inferObjectType(raw)}`,
      );
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
      throw new Error(
        `Error Serializing RangeFilter! Constructor expected: \n {
          ...FilterConfigField,
          kind: string,
          value: Range,
          stepSize: number,
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}

@ApiExtraModels(FilterConfigLabel, FilterConfigField, FilterConfigLabeledValues)
export class JobFilterConfigs {
  public static readonly JobFilterConfigsType = t.strict({
    tvl: RangeFilter.RangeFilterType,
    salary: RangeFilter.RangeFilterType,
    audits: RangeFilter.RangeFilterType,
    teamSize: RangeFilter.RangeFilterType,
    headCount: RangeFilter.RangeFilterType,
    monthlyFees: RangeFilter.RangeFilterType,
    monthlyVolume: RangeFilter.RangeFilterType,
    monthlyRevenue: RangeFilter.RangeFilterType,
    hacks: SingleSelectFilter.SingleSelectFilterType,
    token: SingleSelectFilter.SingleSelectFilterType,
    order: SingleSelectFilter.SingleSelectFilterType,
    seniority: MultiSelectFilter.MultiSelectFilterType,
    locations: MultiSelectFilter.MultiSelectFilterType,
    mainNet: SingleSelectFilter.SingleSelectFilterType,
    orderBy: SingleSelectFilter.SingleSelectFilterType,
    tech: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    publicationDate: SingleSelectFilter.SingleSelectFilterType,
    chains: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    projects: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    investors: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    categories: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    fundingRounds: MultiSelectSearchFilter.MultiSelectSearchFilterType,
    organizations: MultiSelectSearchFilter.MultiSelectSearchFilterType,
  });

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
  fundingRounds: MultiSelectSearchFilter;
  @ApiProperty()
  investors: MultiSelectSearchFilter;
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
  hacks: SingleSelectFilter;
  @ApiProperty()
  mainNet: SingleSelectFilter;
  @ApiProperty()
  token: SingleSelectFilter;
  @ApiProperty()
  order: SingleSelectFilter;
  @ApiProperty()
  orderBy: SingleSelectFilter;

  constructor(raw: JobFilterConfigs) {
    const {
      tvl,
      tech,
      hacks,
      token,
      order,
      salary,
      chains,
      audits,
      mainNet,
      orderBy,
      teamSize,
      projects,
      seniority,
      locations,
      headCount,
      investors,
      categories,
      monthlyFees,
      fundingRounds,
      organizations,
      monthlyVolume,
      monthlyRevenue,
      publicationDate,
    } = raw;

    const result = JobFilterConfigs.JobFilterConfigsType.decode(raw);

    this.tvl = tvl;
    this.tech = tech;
    this.hacks = hacks;
    this.token = token;
    this.order = order;
    this.salary = salary;
    this.chains = chains;
    this.audits = audits;
    this.mainNet = mainNet;
    this.orderBy = orderBy;
    this.teamSize = teamSize;
    this.projects = projects;
    this.seniority = seniority;
    this.locations = locations;
    this.headCount = headCount;
    this.investors = investors;
    this.categories = categories;
    this.monthlyFees = monthlyFees;
    this.fundingRounds = fundingRounds;
    this.organizations = organizations;
    this.monthlyVolume = monthlyVolume;
    this.monthlyRevenue = monthlyRevenue;
    this.publicationDate = publicationDate;

    if (isLeft(result)) {
      throw new Error(
        `Error Serializing JobFilterConfigs! Constructor expected: \n {
          tvl: RangeFilter,
          salary: RangeFilter,
          audits: RangeFilter,
          teamSize: RangeFilter,
          headCount: RangeFilter,
          monthlyFees: RangeFilter,
          hacks: SingleSelectFilter,
          token: SingleSelectFilter,
          order: SingleSelectFilter,
          monthlyVolume: RangeFilter,
          monthlyRevenue: RangeFilter,
          mainNet: SingleSelectFilter,
          orderBy: SingleSelectFilter,
          seniority: MultiSelectFilter,
          locations: MultiSelectFilter,
          tech: MultiSelectSearchFilter,
          chains: MultiSelectSearchFilter,
          projects: MultiSelectSearchFilter,
          investors: MultiSelectSearchFilter,
          publicationDate: SingleSelectFilter,
          categories: MultiSelectSearchFilter,
          fundingRounds: MultiSelectSearchFilter,
          organizations: MultiSelectSearchFilter,
        } got ${inferObjectType(raw)}`,
      );
    }
  }
}
