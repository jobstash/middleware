import { PostgresService } from "./postgres.service";
import { SearchRepository } from "./search.repository";

describe("SearchRepository", () => {
  it("projects organization identity without persisting ClickHouse team data", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarConfigs("organizations");

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("'organizationId', source.organization_id");
    expect(sql).not.toContain("source.current_maintainer_count");
    expect(sql).not.toContain("source.growing_team");
    expect(sql).toContain("source.recently_funded");
    expect(sql).toContain("'fundingStages'");
    expect(parameters).toEqual([null]);
  });

  it("builds geographic and timezone job pillars from projected availability", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarConfigs("jobs");

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("entry.key LIKE 'place:%'");
    expect(sql).toContain("entry.key LIKE 'raw:%'");
    expect(sql).toContain("'timezones'");
    expect(sql).toContain("filter_labels -> 'timezones'");
    expect(sql).toContain("'collaborationHours'");
    expect(sql).toContain("job_team_collaboration_hour_keys(");
  });

  it("searches real geographic facets for location suggestions", async () => {
    const query = jest.fn().mockResolvedValue([
      { id: "l-berlin", label: "Berlin" },
      { id: "tz-europe-berlin", label: "Europe/Berlin" },
    ]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await expect(
      repository.getSuggestionItems({
        group: "locations",
        query: "berlin",
        startDate: 1,
        endDate: 2,
        offset: 0,
        limit: 10,
      }),
    ).resolves.toEqual([
      { id: "l-berlin", label: "Berlin", href: "/l-berlin" },
      {
        id: "tz-europe-berlin",
        label: "Europe/Berlin",
        href: "/tz-europe-berlin",
      },
    ]);

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("filter_labels -> 'cities'");
    expect(sql).toContain("filter_labels -> 'regions'");
    expect(sql).toContain("filter_labels -> 'countries'");
    expect(sql).toContain("filter_labels -> 'continents'");
    expect(sql).toContain("filter_labels -> 'timezones'");
    expect(sql).toContain("prefix || '-' || slugify_text(label)");
    expect(parameters).toEqual(["berlin", 1, 2, 0, 10]);
  });

  it("keeps work-mode suggestions separate from geographic locations", async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ id: "remote", label: "Remote" }]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await expect(
      repository.getSuggestionItems({
        group: "workModes",
        query: "remote",
        startDate: 1,
        endDate: 2,
        offset: 0,
        limit: 10,
      }),
    ).resolves.toEqual([{ id: "remote", label: "Remote", href: "/lt-remote" }]);

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain(
      "structured_job_work_location_modes(recent.job_node_id)",
    );
    expect(parameters).toEqual(["remote", 1, 2, 0, 10]);
  });

  it("discovers location and work-mode groups from their distinct facets", async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ groupId: "locations" }, { groupId: "workModes" }]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await expect(repository.getSuggestionGroups("ber", 1, 2)).resolves.toEqual([
      "locations",
      "workModes",
    ]);

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("SELECT 'workModes', mode AS label");
    expect(sql).toContain("SELECT 'locations', label");
    expect(sql).toContain("filter_labels -> 'cities'");
    expect(parameters).toEqual(["ber", 1, 2]);
  });

  it("matches work-mode pillars against evidence-backed typed options", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarJobs({
      pillarType: "locationTypes",
      value: "remote",
      startDate: 1,
      endDate: 2,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("job_has_work_location_mode(job.job_node_id");
    expect(sql).toContain("job.legacy_list_eligible");
    expect(sql).toContain("cardinality(job.tags) > 0");
    expect(sql).toContain("organization_has_expert_jobs");
    expect(parameters).toEqual([1, 2, "remote", 60]);
  });

  it("matches collaboration-hour pillars against team-level UTC bands", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarJobs({
      pillarType: "collaborationHours",
      value: "utc-08",
      startDate: 1,
      endDate: 2,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("job_has_team_collaboration_hour(");
    expect(sql).toContain("'collaborationHours'");
    expect(sql).toContain("LEFT JOIN project_search_documents project");
    expect(sql).toContain("'project', CASE");
    expect(sql).toContain("project.payload - 'tags' - 'jobs'");
    expect(sql).toContain(
      "num_nonnulls(job.organization_id, job.project_id) = 1",
    );
    expect(parameters).toEqual([1, 2, "utc-08", 60]);
  });

  it("uses the exact Project employer name at the legacy sitemap boundary", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getSitemapJobs();

    const [sql] = query.mock.calls[0];
    expect(sql).toContain(
      'COALESCE(organization.name, project.name) AS "organizationName"',
    );
    expect(sql).toContain("LEFT JOIN project_search_documents project");
    expect(sql).toContain(
      "num_nonnulls(job.organization_id, job.project_id) = 1",
    );
  });

  it("keeps compact legacy pillar slugs compatible with canonical facet keys", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPillarJobs({
      pillarType: "classifications",
      value: "engineeringmanagement",
      startDate: 1,
      endDate: 2,
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM unnest(job.classifications) facet_key");
    expect(sql).toContain("replace(slugify_text(facet_key), '-', '')");
    expect(sql).toContain("(job.classifications) &&");
    expect(parameters).toEqual([
      1,
      2,
      "engineeringmanagement",
      "engineeringmanagement",
      60,
    ]);
  });

  it("resolves a place pillar to the most specific unique prominent node", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        placeId: "geonames:2950159",
        canonicalName: "Berlin",
        canonicalSlug: "berlin",
        kind: "city",
        candidateCount: "1",
      },
    ]);
    const repository = new SearchRepository({
      query,
    } as unknown as PostgresService);

    await expect(repository.resolvePlacePillar("Berlin")).resolves.toEqual({
      placeId: "geonames:2950159",
      canonicalName: "Berlin",
      canonicalSlug: "berlin",
      kind: "city",
    });

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("WHEN 'city' THEN 60");
    expect(sql).toContain("WHEN 'administrative_area' THEN 50");
    expect(sql).toContain("place.kind = 'business_region'");
    expect(sql).toContain("place.normalized_name = $1");
    expect(sql).toContain("place.canonical_name");
    expect(sql).toContain("AS canonical_match");
    expect(sql).toContain("bool_or(canonical_match) OVER ()");
    expect(sql).toContain("WHERE canonical_match = has_canonical_match");
    expect(sql).toContain("max(alias_priority) OVER ()");
    expect(sql).toContain("max(population) OVER ()");
    expect(parameters).toEqual(["berlin"]);
  });
});
