interface SharedFilterProps {
  label: string;
  position: number;
  googleAnalyticsEventName: string;
}

interface RangeFilterValue {
  value: number;
  paramKey: string;
}

interface RangeFilter extends SharedFilterProps {
  kind: "RANGE";
  min: RangeFilterValue;
  max: RangeFilterValue;
  prefix: string | null;
}

interface SelectFilter extends SharedFilterProps {
  kind: "SINGLE_SELECT" | "MULTI_SELECT" | "ORDER" | "ORDER_BY";
  paramKey: string;
  options: { label: string; value: string }[];
}

export interface FilterConfigResponse {
  success: boolean;
  message: string;
  data: (RangeFilter | SelectFilter)[];
}
