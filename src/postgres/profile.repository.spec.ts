import { PostgresService } from "./postgres.service";
import { ProfileRepository } from "./profile.repository";

describe("ProfileRepository", () => {
  it("lists canonical Profiles with their ProfileInfo and exact child links", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        profile: {
          id: "profile-one",
          info: { id: "profile-info-one", displayName: "Acme" },
          organizations: [{ id: "org-one" }],
          projects: [{ id: "project-one" }],
        },
        totalCount: "1",
      },
    ]);
    const repository = new ProfileRepository({ query } as never);

    await expect(
      repository.getEntityProfilesForAdminGrid({
        limit: 25,
        offset: 50,
        query: " acme ",
        childId: " org-one ",
        childType: "Organization",
      }),
    ).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: "profile-one",
          organizations: [{ id: "org-one" }],
          projects: [{ id: "project-one" }],
        }),
      ],
      total: 1,
    });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("HAS_PROFILE_INFO");
    expect(sql).toContain("'canonicalSlug'");
    expect(sql).toContain("'summary'");
    expect(sql).toContain("profile_info_properties ->> 'description'");
    expect(sql).not.toContain("descriptionShort");
    expect(sql).toContain("PROFILE_HAS_ORGANIZATION");
    expect(sql).toContain("PROFILE_HAS_PROJECT");
    expect(parameters).toEqual([25, 50, "acme", "org-one", "Organization"]);
  });

  it("falls back to the canonical id for Organizations without orgId", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        profile: {
          id: "profile-homeward",
          info: { id: "profile-info-homeward", displayName: "Homeward" },
          organizations: [{ id: "organization-homeward" }],
          projects: [],
        },
        totalCount: "1",
      },
    ]);
    const repository = new ProfileRepository({ query } as never);

    await expect(
      repository.getEntityProfilesForAdminGrid({ limit: 1, offset: 0 }),
    ).resolves.toEqual({
      data: [
        expect.objectContaining({
          organizations: [{ id: "organization-homeward" }],
        }),
      ],
      total: 1,
    });
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "'id', COALESCE(\n                child.properties ->> 'orgId',\n                child.properties ->> 'id'\n              )",
    );
  });

  it("updates Profile and ProfileInfo fields as protected manual values", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          profileNodeId: "11",
          profileProperties: {
            id: "profile-one",
            slug: "old-acme",
            createdTimestamp: 123,
          },
          infoNodeId: "12",
          infoProperties: {
            id: "profile-info-one",
            displayName: "Old Acme",
            summary: "Old summary",
          },
        },
      ])
      .mockResolvedValueOnce([{ found: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const postgres = {
      transaction: jest.fn(async callback => callback({ query })),
    } as unknown as PostgresService;
    const repository = new ProfileRepository(postgres);

    await expect(
      repository.updateEntityProfile("profile-one", "admin", {
        slug: "acme",
        category: "crypto",
        aliases: ["old-acme", "old-acme", "acme"],
        info: {
          displayName: "Acme",
          summary: null,
          description: "A protocol.",
        },
      }),
    ).resolves.toEqual({
      outcome: "updated",
      data: {
        id: "profile-one",
        slug: "acme",
        profileInfoId: "profile-info-one",
      },
    });
    const profileProperties = JSON.parse(String(query.mock.calls[2][1][1]));
    const infoProperties = JSON.parse(String(query.mock.calls[3][1][1]));
    expect(profileProperties).toMatchObject({
      id: "profile-one",
      slug: "acme",
      category: "crypto",
      aliases: ["old-acme"],
      createdTimestamp: 123,
      manualFields: ["aliases", "category", "slug"],
      manualOverrides: {
        slug: "acme",
        category: "crypto",
        aliases: ["old-acme"],
      },
      fieldProvenance: {
        slug: { source: "manual", actor: "admin" },
      },
    });
    expect(infoProperties.summary).toBeUndefined();
    expect(infoProperties).toMatchObject({
      id: "profile-info-one",
      displayName: "Acme",
      description: "A protocol.",
      manualOverrides: { summary: null },
      fieldProvenance: {
        summary: { source: "manual", actor: "admin" },
      },
    });
    expect(profileProperties).not.toHaveProperty("updatedTimestamp");
    expect(infoProperties).not.toHaveProperty("updatedTimestamp");
  });

  it("serializes work-location exclusions for Jobs for me", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new ProfileRepository({
      query,
    } as unknown as PostgresService);

    await repository.getJobMatchingCandidates();

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("organization_search_documents organization");
    expect(sql).toContain("project_search_documents project");
    expect(sql).toContain("'organization', organization.payload");
    expect(sql).toContain("'project', project.payload");
    expect(sql).toContain("organization.payload,\n          project.payload");
    expect(sql).toContain("num_nonnulls(");
    expect(sql).toContain(
      "organization.payload IS NOT NULL OR project.payload IS NOT NULL",
    );
    expect(sql).toContain("'excludedCountries'");
    expect(sql).toContain("option.excluded_countries");
    expect(sql).toContain("'excludedRegions'");
    expect(sql).toContain("option.excluded_regions");
    expect(sql).toContain("option.required_minimum_utc_offset_minutes");
    expect(sql).toContain("option.preferred_minimum_utc_offset_minutes");
    expect(sql).toContain("to_jsonb(option.residency_requirements)");
    expect(sql).toContain("to_jsonb(option.work_authorizations)");
    expect(sql).toContain("document.work_arrangement ->> 'classification'");
    expect(sql).toContain('AS "arrangementClassification"');
    expect(sql).toContain("NULLIF(btrim(option.evidence_quote), '')");
    expect(sql).toContain("LEFT JOIN selected_options option");
    expect(sql).toContain("FILTER (WHERE option.option_key IS NOT NULL)");
    expect(sql).toContain("'[]'::jsonb) AS options");
    expect(sql).toContain(
      "SELECT DISTINCT ON (raw_job_node_id, jobsite_node_id)",
    );
    expect(sql).toContain("extracted_at DESC, extractor_version DESC");
    expect(sql.match(/ARRAY\[\]::text\[\]/g)).toHaveLength(2);
  });

  it("uses only canonical public preference keys and integer-minute storage", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new ProfileRepository({
      query,
    } as unknown as PostgresService);

    await repository.getJobPreferences("wallet");
    const [readSql] = query.mock.calls[0] as [string, unknown[]];
    expect(readSql).toContain("'workModes'");
    expect(readSql).toContain("'utcOffset'");
    expect(readSql).toContain("preferences.utc_offset_minutes / 60.0");
    expect(readSql).toContain("preferences.travel_tolerance");
    expect(readSql).toContain("preferences.role_priorities");
    expect(readSql).toContain("preferences.preferred_skills");
    expect(readSql).toContain("preferences.minimum_salary");
    expect(readSql).toContain("preferences.showcase_repositories");
    for (const legacy of [
      "'acceptableWorkModes'",
      "'ianaTimezone'",
      "'workAuthorizations'",
      "'needsSponsorship'",
    ]) {
      expect(readSql).not.toContain(legacy);
    }
  });

  it("writes the complete recommendation profile", async () => {
    const query = jest.fn().mockResolvedValue([{ userNodeId: "1" }]);
    const repository = new ProfileRepository({ query } as never);

    await expect(
      repository.updateJobPreferences("wallet", {
        workModes: ["remote"],
        residenceCountry: "NL",
        utcOffset: 1,
        workAuthorization: "EU",
        requiresSponsorship: false,
        attendancePreference: "remote_only",
        travelTolerance: "one day per month",
        searchStatus: "active",
        rolePriorities: ["mission-driven"],
        targetOrganizations: ["Protocol Labs"],
        languages: ["English: native"],
        jobCategories: ["Engineering"],
        seniorityLevels: ["Senior"],
        educationLevel: "bachelor",
        companySizeMin: 20,
        companySizeMax: 500,
        industries: ["Infrastructure"],
        preferredSkills: ["TypeScript"],
        minimumSalary: 150000,
        salaryCurrency: "USD",
        fundingStages: ["Series A"],
        paymentCurrencies: ["USD", "USDC"],
        commitments: ["Full Time"],
        showcaseRepositories: ["https://github.com/example/project"],
      }),
    ).resolves.toBe(true);

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("target_organizations");
    expect(sql).toContain("preferred_skills");
    expect(sql).toContain("showcase_repositories");
    expect(parameters).toHaveLength(25);
    expect(parameters[18]).toEqual(["TypeScript"]);
    expect(parameters[24]).toEqual(["https://github.com/example/project"]);
  });

  it("allow-lists public Profile fields and only returns decided notices", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new ProfileRepository({
      query,
    } as unknown as PostgresService);

    await repository.getPublicEntityProfile("acme");
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("'canonicalSlug'");
    expect(sql).toContain("'children'");
    expect(sql).toContain("'reviews'");
    expect(sql).toContain("'salaries'");
    expect(sql).toContain("notice.status = 'decided'");
    expect(sql).toContain("notice.redacted_public_text");
    expect(sql).toContain("FROM profile_reviews review");
    expect(sql).toContain("'summary'");
    expect(sql).toContain("info.properties ->> 'description'");
    expect(sql).not.toContain("descriptionShort");
    expect(sql).toContain("review.status IN ('published', 'redacted')");
    expect(sql).toContain(
      "review.status IN ('pending', 'published', 'redacted')",
    );
    expect(sql).toContain("review.child_node_id IS NULL OR EXISTS");
    expect(sql).toContain("exact_membership.target_id = review.child_node_id");
    expect(sql).toContain("review.currency ~ '^[A-Z]{3}$'");
    expect(sql).not.toContain("review.status IN ('rejected'");
    expect(sql).toContain("legacy_org_review_quarantine quarantined");
    expect(sql).toContain("migrated.legacy_review_node_id = legacy.id");
    expect(sql).not.toContain("'info', info.properties");
    expect(sql).not.toContain("child.properties ORDER BY");
  });

  it("creates a pending Profile-owned review with exact child context", async () => {
    const value = { id: "review", status: "pending" };
    const query = jest.fn().mockResolvedValue([{ value }]);
    const repository = new ProfileRepository({
      query,
    } as unknown as PostgresService);

    await expect(
      repository.createProfileReview("actor", "acme", {
        childId: "org",
        rating: 5,
        reviewText: "Exact review",
        salary: 100000,
        currency: "usd",
        offersTokenAllocation: true,
      }),
    ).resolves.toEqual(value);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("profile.label = 'EntityProfile'");
    expect(sql).toContain("PROFILE_HAS_ORGANIZATION");
    expect(sql).toContain("PROFILE_HAS_PROJECT");
    expect(sql).toContain("INSERT INTO profile_reviews");
    expect(sql).toContain("verification.type = 'VERIFIED_FOR_ORG'");
    expect(sql).toContain("INSERT INTO profile_verified_domain_evidence");
    expect(sql).toContain(
      "child.id IS NOT NULL AND verification.account_id IS NOT NULL",
    );
    expect(sql).toContain("'pending'");
    expect(parameters).toEqual([
      "actor",
      "acme",
      "org",
      5,
      "Exact review",
      100000,
      "USD",
      true,
    ]);
  });

  it("creates a no-effect pending recruiter case without graph mutations", async () => {
    const value = { id: "case", status: "pending" };
    const query = jest.fn().mockResolvedValue([{ value }]);
    const repository = new ProfileRepository({
      query,
    } as unknown as PostgresService);

    await expect(
      repository.createRecruiterCase("reporter", "acme", {
        childId: "org",
        allegation: { category: "misrepresentation" },
      }),
    ).resolves.toEqual(value);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO recruiter_cases");
    expect(sql).toContain("$1, 'pending', $4::jsonb");
    expect(sql).not.toContain("UPDATE graph_nodes");
    expect(sql).not.toContain("banned', true");
    expect(sql).not.toContain("notification");
  });

  it("creates one pending appeal only for a decided notice", async () => {
    const value = { id: "appeal", status: "pending" };
    const query = jest.fn().mockResolvedValue([{ value }]);
    const repository = new ProfileRepository({ query } as never);

    await expect(
      repository.createProfileAppeal(
        "appellant",
        "00000000-0000-0000-0000-000000000001",
        "The evidence is not accurate.",
      ),
    ).resolves.toEqual(value);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("notice.status = 'decided'");
    expect(sql).toContain("existing.status = 'pending'");
    expect(sql).toContain("INSERT INTO profile_appeals");
  });

  it("loads all three actionable moderation queues and their counts", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          pendingReviews: "2",
          activeCases: "3",
          pendingAppeals: "4",
          decidedNotices: "5",
        },
      ]);
    const repository = new ProfileRepository({ query } as never);

    await expect(repository.getProfileModerationQueue(100)).resolves.toEqual({
      reviews: [],
      cases: [],
      appeals: [],
      counts: {
        pendingReviews: 2,
        activeCases: 3,
        pendingAppeals: 4,
        decidedNotices: 5,
      },
    });
    const sql = query.mock.calls.map(call => String(call[0])).join("\n");
    expect(sql).toContain("review.status = 'pending'");
    expect(sql).toContain(
      "recruiter_case.status IN ('pending', 'investigating')",
    );
    expect(sql).toContain("appeal.status = 'pending'");
  });

  it("upserts legacy review endpoints into one canonical pending Profile review", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ nodeId: "1", properties: { wallet: "actor" } }])
      .mockResolvedValueOnce([{ nodeId: "2", properties: { orgId: "org" } }])
      .mockResolvedValueOnce([{ nodeId: "3" }])
      .mockResolvedValueOnce([{ id: "review" }]);
    const postgres = {
      transaction: jest.fn(async callback => callback({ query })),
    } as unknown as PostgresService;
    const repository = new ProfileRepository(postgres);

    await expect(
      repository.upsertReview("actor", "org", {
        onboarding: 5,
        benefits: 3,
      }),
    ).resolves.toBe(true);
    const [sql, parameters] = query.mock.calls[3] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO profile_reviews");
    expect(sql).toContain(
      "ON CONFLICT (profile_node_id, child_node_id, author_user_id)",
    );
    expect(sql).toContain("status = 'pending'");
    expect(sql).not.toContain("OrgReview");
    expect(parameters.slice(0, 5)).toEqual(["3", "2", "actor", 4, null]);
  });
});
