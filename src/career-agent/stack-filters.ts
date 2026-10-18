/** Canonical Explorer facets: OR within a facet, AND across facets. */
export const stackFacetColumns = {
  tags: "tags",
  projects: "project_names",
  investors: "investor_names",
  fundingRounds: "funding_round_names",
  fundingStages: "ARRAY[slugify_text(document.current_funding_stage)]",
  chains: "chain_names",
  commitments: "commitments",
  organizations: "ARRAY[slugify_text(document.organization_name)]",
  seniority: "ARRAY[document.seniority]",
  ecosystems: "ecosystems",
  countries: "availability_keys",
  cities: "availability_keys",
  regions: "availability_keys",
  continents: "availability_keys",
  timezones: "availability_keys",
} as const;
export type StackFilters = Partial<
  Record<keyof typeof stackFacetColumns, string[]>
> & { minSalaryRange?: number; maxSalaryRange?: number };
export const stackFiltersSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(
      Object.keys(stackFacetColumns).map(key => [
        key,
        {
          type: "array",
          maxItems: 30,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 160 },
          description:
            "Canonical Explorer facet keys from stack_filter_options. OR within this facet; AND across facets.",
        },
      ]),
    ),
    minSalaryRange: {
      type: "number",
      minimum: 0,
      maximum: 10000000,
      description: "Minimum annual salary in USD; unknown salaries excluded.",
    },
    maxSalaryRange: {
      type: "number",
      minimum: 0,
      maximum: 10000000,
      description:
        "Exclusive upper annual salary in USD; unknown salaries excluded.",
    },
  },
};
export const stackFacetSql =
  Object.entries(stackFacetColumns)
    .map(([facet, column]) => {
      const value = `$5::jsonb->'filters'->'${facet}'`;
      const keys = `ARRAY(SELECT jsonb_array_elements_text(${value}))`;
      const expression = column.startsWith("ARRAY[")
        ? column
        : `document.${column}`;
      const extra =
        facet === "ecosystems"
          ? ` OR document.managed_ecosystems && ${keys}`
          : "";
      return `AND (COALESCE(jsonb_array_length(${value}),0)=0 OR ${expression} && ${keys}${extra})`;
    })
    .join("\n") +
  `
  AND ($5::jsonb->'filters'->>'minSalaryRange' IS NULL OR (document.salary_currency='USD' AND document.salary>=($5::jsonb->'filters'->>'minSalaryRange')::numeric))
  AND ($5::jsonb->'filters'->>'maxSalaryRange' IS NULL OR (document.salary_currency='USD' AND document.salary<($5::jsonb->'filters'->>'maxSalaryRange')::numeric))`;
