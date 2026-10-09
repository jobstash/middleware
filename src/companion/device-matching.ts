import { JobSalary, projectJobSalary } from "./job-card-details";

interface LocationEvidence {
  rawLocations?: unknown[];
  availability?: unknown[];
  workArrangement?: unknown;
  remoteOptions?: unknown[];
  hybridOptions?: unknown[];
  onsiteOptions?: unknown[];
}
type Row = LocationEvidence & Record<string, unknown> & {
  id: string;
  title: string;
  company: string;
  publishedTimestamp: string | number | null;
  applyUrl: string | null;
  salaryPayload: Record<string, unknown>;
  city: string | null;
  location: string | null;
  workMode: string | null;
  description?: string | null;
  headcount?: unknown;
  stage?: string | null;
  funding: unknown[];
  projects: unknown[];
  ad: string | null;
};
type Catalogue = {
  query<T extends Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
  ): Promise<T[]>;
};
export interface CatalogueJob {
  id: string;
  title: string;
  company: string;
  salary: JobSalary | null;
  city: string | null;
  location: string | null;
  workMode: string | null;
  publishedAt: string;
  applyUrl?: string;
}
export interface MatchingJob {
  id: string;
  title: string;
  company: {
    name: string;
    description: string | null;
    headcount: number | null;
    stage: string | null;
    funding: unknown[];
    projects: unknown[];
  };
  salary: JobSalary | null;
  city: string | null;
  location: string | null;
  workMode: string | null;
  locationEvidence: string[];
  publishedAt: string | null;
  applyUrl: string | null;
  ad: string | null;
}
export interface MatchingCatalogue {
  jobs: CatalogueJob[];
  total: number;
}
export interface MatchingBatch {
  jobs: MatchingJob[];
  remainingIds: string[];
  unavailableIds: string[];
}
const batchCharacters = 60000;
const companyName = `COALESCE(NULLIF(j.organization_name,''),o.payload->>'name',p.payload->>'name','')`;
const catalogueJoins = `FROM job_search_documents j
  LEFT JOIN organization_search_documents o ON o.organization_id=j.organization_id
  LEFT JOIN project_search_documents p ON p.project_id=j.project_id`;

const availabilityFields = [
  "requirement",
  "workMode",
  "placeId",
  "placeName",
  "placeText",
  "placeKind",
  "ancestorPlaceIds",
  "placeTimezoneIds",
  "timezoneKind",
  "timezone",
  "minimumUtcOffsetMinutes",
  "maximumUtcOffsetMinutes",
  "rawText",
  "confidence",
  "extractorVersion",
];
const optionFields = [
  "classification",
  "mode",
  "scope",
  "includedCountries",
  "excludedCountries",
  "includedRegions",
  "excludedRegions",
  "requiredUtcBand",
  "preferredUtcBand",
  "residencyRequirements",
  "workAuthorizationRequirements",
  "sponsorshipStatus",
  "officeCity",
  "attendanceCadence",
  "travelRequirement",
  "confidence",
];
const arraySql = (value: string): string =>
  `CASE WHEN jsonb_typeof(${value})='array' THEN ${value} ELSE '[]'::jsonb END`;
const factsSql = (
  value: string,
  fields: string[],
): string => `(SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb)
  FROM jsonb_each(CASE WHEN jsonb_typeof(${value})='object' THEN ${value} ELSE '{}'::jsonb END)
  WHERE key IN (${fields.map(field => `'${field}'`).join(",")}))`;
const arrangementSql =
  "COALESCE(j.detail_payload->'workArrangement',j.payload->'workArrangement')";

// Only role-source facts are projected; employer locations never participate.
export const locationEvidenceColumns = `originals.locations AS "rawLocations",
  (SELECT jsonb_agg(${factsSql("item", availabilityFields)} ORDER BY ordinal)
    FROM jsonb_array_elements(${arraySql("COALESCE(j.detail_payload->'availability',j.payload->'availability')")})
      WITH ORDINALITY entries(item,ordinal)) AS availability,
  ${factsSql(arrangementSql, ["classification", "fullyRemote"])} AS "workArrangement",
  ${["remoteOptions", "hybridOptions", "onsiteOptions"]
    .map(
      key => `(SELECT jsonb_agg(${factsSql("item", optionFields)} ORDER BY ordinal)
    FROM jsonb_array_elements(${arraySql(`(${arrangementSql})->'${key}'`)})
      WITH ORDINALITY entries(item,ordinal)) AS "${key}"`,
    )
    .join(",")}`;

export function projectLocationEvidence(row: LocationEvidence): string[] {
  const evidence: string[] = [];
  for (const location of row.rawLocations ?? [])
    if (typeof location === "string" && location.trim())
      evidence.push(`Raw advertised role location: ${location}`);
  const append = (label: string, facts: unknown): void => {
    if (!facts || typeof facts !== "object" || Array.isArray(facts)) return;
    const populated = Object.fromEntries(
      Object.entries(facts).filter(
        ([, value]) =>
          value != null &&
          !(typeof value === "string" && !value.trim()) &&
          !(Array.isArray(value) && !value.length),
      ),
    );
    if (Object.keys(populated).length)
      evidence.push(`${label}: ${JSON.stringify(populated)}`);
  };
  for (const [index, facts] of (row.availability ?? []).entries())
    append(`Canonical availability ${index + 1}`, facts);
  append("Work arrangement", row.workArrangement);
  for (const key of [
    "remoteOptions",
    "hybridOptions",
    "onsiteOptions",
  ] as const)
    for (const [index, facts] of (row[key] ?? []).entries())
      append(`Work arrangement ${key} ${index + 1}`, facts);
  return evidence;
}

// Catalogue needs only raw role locations; detailed reads also retrieve every original character.
export function jobOriginalsJoin(includeContent: boolean): string {
  return `LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT original.properties->>'location' ORDER BY original.properties->>'location')
      FILTER (WHERE jsonb_typeof(original.properties->'location')='string'
        AND btrim(original.properties->>'location')<>'') AS locations
      ${
        includeContent
          ? `,string_agg(original.properties->>'content',E'\\n\\n' ORDER BY original.id)
        FILTER (WHERE jsonb_typeof(original.properties->'content')='string'
          AND btrim(original.properties->>'content',E' \\n\\r\\t')<>'') AS ad`
          : ""
      }
    FROM graph_nodes original WHERE original.label='Jobpost'
      AND EXISTS(SELECT 1 FROM graph_relationships edge WHERE edge.source_id=original.id
        AND edge.target_id=j.job_node_id AND edge.type='HAS_STRUCTURED_JOBPOST')
  ) originals ON true`;
}
// The same advertised terms accompany both reads; no employer geography is used.
export const termsColumns = `jsonb_build_object(
    'minimumSalary',terms.payload->'minimumSalary','maximumSalary',terms.payload->'maximumSalary',
    'salary',terms.payload->'salary','extractedMinimumSalary',terms.payload->'extractedMinimumSalary',
    'extractedMaximumSalary',terms.payload->'extractedMaximumSalary',
    'salaryCurrency',terms.payload->'salaryCurrency','payRate',terms.payload->'payRate') AS "salaryPayload",
  COALESCE(places.city,CASE WHEN jsonb_typeof(terms.payload->'locationCity')='string'
    THEN NULLIF(btrim(terms.payload->>'locationCity'),'') END) AS city,
  COALESCE(CASE WHEN jsonb_typeof(terms.payload->'location')='string' THEN NULLIF(btrim(terms.payload->>'location'),'') END,
    array_to_string(originals.locations,'; ')) AS location,
  COALESCE(places.modes,(
    SELECT btrim(value) FROM unnest(ARRAY[
      CASE WHEN jsonb_typeof(terms.payload->'locationType')='string' THEN terms.payload->>'locationType' END,
      CASE WHEN jsonb_typeof(terms.payload#>'{workArrangement,classification}')='string'
        THEN terms.payload#>>'{workArrangement,classification}' END])
      WITH ORDINALITY modes(value,ordinal)
    WHERE btrim(value)<>'' AND lower(btrim(value)) NOT IN ('unknown','unspecified','unstated','n/a','null')
    ORDER BY ordinal LIMIT 1)) AS "workMode"`;
export const termsJoins = `LEFT JOIN LATERAL (
    SELECT COALESCE(j.detail_payload,'{}'::jsonb) || j.payload AS payload
  ) terms ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT city,', ' ORDER BY city) AS city,
      string_agg(DISTINCT mode,', ' ORDER BY mode) AS modes
    FROM (
      SELECT CASE WHEN item->>'placeKind'='city' THEN
          COALESCE(CASE WHEN jsonb_typeof(item->'placeName')='string' THEN NULLIF(btrim(item->>'placeName'),'') END,
            CASE WHEN jsonb_typeof(item->'placeText')='string' THEN NULLIF(btrim(item->>'placeText'),'') END) END AS city,
        CASE WHEN item->>'workMode' IN ('remote','hybrid','onsite') THEN item->>'workMode' END AS mode
      FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(COALESCE(j.detail_payload->'availability',j.payload->'availability'))='array'
        THEN COALESCE(j.detail_payload->'availability',j.payload->'availability') ELSE '[]'::jsonb END) item
    ) advertised
  ) places ON true`;

export async function matchingCatalogue(
  db: Catalogue,
): Promise<MatchingCatalogue> {
  const rows =
    await db.query<Row>(`SELECT 'node:' || j.job_node_id::text AS id,j.title,${companyName} AS company,
    j.published_timestamp AS "publishedTimestamp",j.payload->>'url' AS "applyUrl",${termsColumns}
    ${catalogueJoins} ${termsJoins} ${jobOriginalsJoin(false)}
    WHERE j.online AND NOT j.blocked AND j.published_timestamp BETWEEN
      extract(epoch FROM statement_timestamp()-interval '14 days')*1000 AND extract(epoch FROM statement_timestamp())*1000
    ORDER BY j.published_timestamp DESC,('node:' || j.job_node_id::text) COLLATE "C"`);
  const jobs = rows.map(
    ({ publishedTimestamp, applyUrl, salaryPayload, ...job }) => ({
      ...job,
      salary: projectJobSalary(salaryPayload),
      publishedAt: new Date(Number(publishedTimestamp)).toISOString(),
      ...(applyUrl ? { applyUrl } : {}),
    }),
  );
  return { jobs, total: jobs.length };
}

// Curated role and employer facts leave SQL. Original ads and location constraints are never compacted.
export async function matchingJobs(
  db: Catalogue,
  ids: string[],
): Promise<MatchingBatch> {
  const rows = await db.query<Row>(
    `WITH requested AS MATERIALIZED (
    SELECT id,ordinal,CASE WHEN substring(id FROM 6)::numeric <= 9223372036854775807
      THEN substring(id FROM 6)::bigint END AS node_id FROM unnest($1::text[]) WITH ORDINALITY input(id,ordinal)
  ), selected AS MATERIALIZED (
    SELECT j.*,requested.id,requested.ordinal,${companyName} AS company,
      COALESCE(o.payload,p.payload,'{}'::jsonb) AS employer,o.project_ids
    FROM requested JOIN job_search_documents j ON j.job_node_id=requested.node_id
    LEFT JOIN organization_search_documents o ON o.organization_id=j.organization_id
    LEFT JOIN project_search_documents p ON p.project_id=j.project_id
    WHERE j.online AND NOT j.blocked
  ) SELECT j.id,j.title,j.company,j.published_timestamp AS "publishedTimestamp",
    j.payload->>'url' AS "applyUrl",${termsColumns},${locationEvidenceColumns},
    left(COALESCE(NULLIF(j.employer->>'summary',''),j.employer->>'description'),800) AS description,j.employer->'headcountEstimate' AS headcount,
    j.employer->>'fundingStage' AS stage,COALESCE(funding.value,'[]'::jsonb) AS funding,
    COALESCE(projects.value,'[]'::jsonb) AS projects,originals.ad
    FROM selected j ${termsJoins} ${jobOriginalsJoin(true)}
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('name',project.name,'description',project.description) ORDER BY project.project_id COLLATE "C") AS value
      FROM (SELECT project_id,payload->>'name' AS name,
          left(COALESCE(NULLIF(payload->>'summary',''),payload->>'description'),400) AS description
        FROM project_search_documents WHERE project_id=j.project_id OR project_id=ANY(j.project_ids)
        ORDER BY (project_id=j.project_id) DESC NULLS LAST,project_id COLLATE "C" LIMIT 3) project
    ) projects ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'date',CASE WHEN jsonb_typeof(round.value->'date') IN ('number','string') THEN round.value->'date' END,
        'amount',CASE WHEN jsonb_typeof(COALESCE(NULLIF(round.value->'raisedAmount','null'::jsonb),round.value->'amount')) IN ('number','string') THEN COALESCE(NULLIF(round.value->'raisedAmount','null'::jsonb),round.value->'amount') END,
        'currency',CASE WHEN jsonb_typeof(round.value->'currency')='string' THEN round.value->>'currency' END,
        'round',CASE WHEN jsonb_typeof(round.value->'roundName')='string' THEN round.value->>'roundName' END,
        'type',CASE WHEN jsonb_typeof(round.value->'financingType')='string' THEN round.value->>'financingType' END,
        'investors',COALESCE(investors.names,'[]'::jsonb))
        ORDER BY round.date DESC NULLS LAST,round.ordinal) AS value
      FROM (SELECT value,ordinal,CASE WHEN value->>'date' ~ '^[0-9]+([.][0-9]+)?$'
          THEN (value->>'date')::numeric END AS date
        FROM (SELECT DISTINCT ON (COALESCE(NULLIF(value->>'id',''),value::text)) value,ordinal
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.employer->'fundingRounds')='array'
            THEN j.employer->'fundingRounds' ELSE '[]'::jsonb END) WITH ORDINALITY rounds(value,ordinal)
          ORDER BY COALESCE(NULLIF(value->>'id',''),value::text),ordinal) distinct_rounds
        ORDER BY date DESC NULLS LAST,ordinal LIMIT 3) round
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(names.name ORDER BY names.name COLLATE "C") AS names FROM (
          SELECT DISTINCT investor.properties->>'name' AS name FROM graph_nodes event
          JOIN graph_relationships edge ON edge.source_id=event.id AND edge.type='HAS_INVESTOR'
          JOIN graph_nodes investor ON investor.id=edge.target_id AND investor.label='Investor'
          WHERE event.label='FundingRound' AND event.properties->>'id'=round.value->>'id'
            AND jsonb_typeof(investor.properties->'name')='string'
        ) names
      ) investors ON true
    ) funding ON true ORDER BY j.ordinal`,
    [ids],
  );
  const available = new Map(rows.map(row => [row.id, row]));
  const unavailableIds = ids.filter(id => !available.has(id));
  const remainingIds = ids.filter(id => available.has(id));
  const jobs: MatchingJob[] = [];
  let characters = JSON.stringify({
    jobs,
    remainingIds,
    unavailableIds,
  }).length;
  while (remainingIds.length) {
    const id = remainingIds[0],
      row = available.get(id)!;
    const job = {
      id,
      title: row.title,
      company: {
        name: row.company,
        description: row.description ?? null,
        headcount: typeof row.headcount === "number" ? row.headcount : null,
        stage: row.stage ?? null,
        funding: row.funding,
        projects: row.projects,
      },
      salary: projectJobSalary(row.salaryPayload),
      city: row.city ?? null,
      location: row.location ?? null,
      workMode: row.workMode ?? null,
      locationEvidence: projectLocationEvidence(row),
      publishedAt:
        row.publishedTimestamp == null
          ? null
          : new Date(Number(row.publishedTimestamp)).toISOString(),
      applyUrl: row.applyUrl ?? null,
      ad: row.ad ?? null,
    };
    const nextCharacters =
      characters +
      JSON.stringify(job).length +
      (jobs.length ? 1 : 0) -
      JSON.stringify(id).length -
      (remainingIds.length > 1 ? 1 : 0);
    if (jobs.length && nextCharacters > batchCharacters) break;
    jobs.push(job);
    remainingIds.shift();
    characters = nextCharacters;
  }
  return { jobs, remainingIds, unavailableIds };
}
