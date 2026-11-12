import { InvestorsService } from "src/investors/investors.service";
import { GraphRepository } from "./graph.repository";
import { createProfileMemberFixture } from "./postgres.integration-fixtures";
import { PostgresService } from "./postgres.service";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("InvestorsService PostgreSQL capital units", () => {
  let postgres: PostgresService;
  let service: InvestorsService;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-investors-capital-integration-test",
    });
    await postgres.onModuleInit();
    service = new InvestorsService(new GraphRepository(postgres), postgres);
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
  });

  it("honors explicit USD before legacy source inference without changing grouped rounds or investor counts", async () => {
    const slug = "capital-unit-fund";
    const fundProperties = {
      name: "Capital Unit Fund",
      normalizedName: slug,
      isFund: true,
    };
    const fund = await createNode("Investor", "capital-fund", fundProperties);
    const duplicateFund = await createNode(
      "Investor",
      "capital-fund-duplicate",
      fundProperties,
    );
    const coInvestor = await createNode("Investor", "capital-co-investor", {
      name: "Co Investor",
      normalizedName: "capital-co-investor",
      isFund: false,
    });
    const owner = await createProfileMemberFixture(
      postgres,
      "Organization",
      "capital-company",
      {
        orgId: "capital-company",
        name: "Capital Company",
        normalizedName: "capital-company",
      },
    );
    const [profile] = await postgres.query<{ id: string }>(
      `SELECT source_id::text AS id FROM graph_relationships
       WHERE target_id = $1 AND type = 'PROFILE_HAS_ORGANIZATION'`,
      [owner],
    );
    await createOrganizationMember(profile.id, "second-capital-company");
    const cases: Array<{
      id: string;
      properties: Record<string, unknown>;
      expected: number;
    }> = [
      {
        id: "explicit-usd",
        properties: { raisedAmount: 2_000_000, raisedAmountUnit: "USD" },
        expected: 2_000_000,
      },
      {
        id: "explicit-usd-previous",
        properties: {
          raisedAmount: 3_000_000,
          raisedAmountUnit: "USD",
          raisedAmountPreviousUnit: "USD_millions",
          source: "",
        },
        expected: 3_000_000,
      },
      {
        id: "source-marked",
        properties: { raisedAmount: 4_000_000, source: "reviewed" },
        expected: 4_000_000,
      },
      {
        id: "legacy-missing-source",
        properties: { raisedAmount: 5 },
        expected: 5_000_000,
      },
      {
        id: "legacy-empty-source",
        properties: { raisedAmount: 6, source: "" },
        expected: 6_000_000,
      },
      {
        id: "legacy-millions-marker",
        properties: { raisedAmount: 7, raisedAmountUnit: "USD_millions" },
        expected: 7_000_000,
      },
      {
        id: "source-millions-marker",
        properties: {
          raisedAmount: 8_000_000,
          raisedAmountUnit: "USD_millions",
          source: "reviewed",
        },
        expected: 8_000_000,
      },
    ];
    const rawRounds: Array<{
      id: string;
      properties: Record<string, unknown>;
    }> = [];
    for (const [index, fixture] of cases.entries()) {
      const properties = {
        id: fixture.id,
        roundName: "Seed",
        date: Date.UTC(2024, index, 1) / 1000,
        ...fixture.properties,
      };
      const round = await createFundingRound(
        profile.id,
        fixture.id,
        properties,
      );
      rawRounds.push({ id: round, properties });
      await relate(round, fund, "HAS_INVESTOR");
      await relate(round, duplicateFund, "HAS_INVESTOR");
    }

    // Same owner, stage, and month is one event, not another investment.
    // Its sourced amount is lower than the explicit-USD record: max must be
    // computed after correct normalization, not on an inflated USD value.
    const duplicateProperties = {
      id: "duplicate-seed",
      roundName: " seed ",
      date: Date.UTC(2024, 0, 15) / 1000,
      raisedAmount: 1_500_000,
      source: "reviewed",
    };
    const duplicateRound = await createFundingRound(
      profile.id,
      "duplicate-seed",
      duplicateProperties,
    );
    rawRounds.push({ id: duplicateRound, properties: duplicateProperties });
    await relate(duplicateRound, fund, "HAS_INVESTOR");
    await relate(duplicateRound, coInvestor, "HAS_INVESTOR");

    const followOnProperties = {
      id: "non-participating-follow-on",
      roundName: "Series A",
      date: Date.UTC(2024, 8, 1) / 1000,
      raisedAmount: 9_000_000,
      raisedAmountUnit: "USD",
    };
    const followOn = await createFundingRound(
      profile.id,
      "non-participating-follow-on",
      followOnProperties,
    );
    rawRounds.push({ id: followOn, properties: followOnProperties });
    await relate(followOn, coInvestor, "HAS_INVESTOR");

    // Use the real projection refresh and both SQL consumers inside details.
    // The test database must include ETL migration zz-266's USD contract.
    await postgres.query(
      "SELECT refresh_fund_analytics_documents($1::text[])",
      [[slug]],
    );
    const details = await service.getFundDetailsBySlug(slug, {
      activityWindow: "all",
    });
    expect(details).toBeDefined();
    if (!details) throw new Error("Expected the refreshed fund details");
    expect(details).toMatchObject({
      normalizedName: slug,
      portfolioCount: 1,
      investmentRoundCount: 7,
      knownRoundCapital: 35_000_000,
      soloRoundCount: 6,
      syndicatedRoundCount: 1,
    });
    expect(details.investments).toHaveLength(1);
    expect(details.investments[0].organizationId).toBe("capital-company");
    const rounds = details.investments[0].rounds;
    expect(rounds).toHaveLength(8);
    expect(rounds.map(round => round.raisedAmount)).toEqual([
      ...cases.map(fixture => fixture.expected),
      9_000_000,
    ]);
    expect(rounds.map(round => round.investorCount)).toEqual([
      2, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(rounds.map(round => round.fundParticipated)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(rounds.map(round => round.investmentRole)).toEqual([
      "co-investor",
      ...Array(6).fill("recorded-solo"),
      null,
    ]);
    expect(rounds[0]).toMatchObject({
      id: "duplicate-seed",
      date: duplicateProperties.date,
    });
    expect(rounds.every(round => round.investedAmount === null)).toBe(true);

    const stored = await postgres.query<{
      id: string;
      properties: Record<string, unknown>;
    }>(
      "SELECT id::text AS id, properties FROM graph_nodes WHERE label = 'FundingRound' ORDER BY graph_nodes.id",
    );
    expect(stored).toEqual(rawRounds);
  });

  it("uses Profile visibility and one unbanned Organization card without dropping project-only metrics", async () => {
    const slug = "visible-capital-fund";
    const fund = await createNode("Investor", slug, {
      name: "Visible Capital Fund",
      normalizedName: slug,
      isFund: true,
    });
    const hiddenMember = await createProfileMemberFixture(
      postgres,
      "Organization",
      "hidden-capital-company",
      { orgId: "hidden-capital-company", name: "Hidden Company" },
    );
    const profile = await memberProfile(hiddenMember);
    const visibleMember = await createOrganizationMember(
      profile,
      "visible-capital-company",
    );
    await createOrganizationMember(profile, "another-capital-company");
    const visibleRound = await createFundingRound(profile, "visible-round", {
      id: "visible-round",
      roundName: "Seed",
      date: Date.UTC(2024, 0, 1) / 1000,
      raisedAmount: 2_000_000,
      raisedAmountUnit: "USD",
    });
    await relate(visibleMember, visibleRound, "HAS_FINANCING_CONTEXT");
    await relate(visibleRound, fund, "HAS_INVESTOR");
    const hiddenRound = await createFundingRound(profile, "hidden-round", {
      roundName: "Series A",
      date: Date.UTC(2024, 1, 1) / 1000,
      raisedAmount: 100_000_000,
      raisedAmountUnit: "USD",
    });
    await relate(hiddenMember, hiddenRound, "HAS_FINANCING_CONTEXT");
    await relate(hiddenRound, fund, "HAS_INVESTOR");

    // A hidden selected round must not expose the Profile's other visible
    // rounds as this fund's portfolio history.
    const hiddenOnlyMember = await createProfileMemberFixture(
      postgres,
      "Organization",
      "hidden-only-company",
      { orgId: "hidden-only-company", name: "Hidden Only" },
    );
    const hiddenOnlyProfile = await memberProfile(hiddenOnlyMember);
    await createOrganizationMember(hiddenOnlyProfile, "not-this-funds-company");
    const hiddenOnlyRound = await createFundingRound(
      hiddenOnlyProfile,
      "hidden-only-round",
      {
        roundName: "Seed",
        date: Date.UTC(2024, 0, 1) / 1000,
        raisedAmount: 100_000_000,
        raisedAmountUnit: "USD",
      },
    );
    await relate(hiddenOnlyMember, hiddenOnlyRound, "HAS_FINANCING_CONTEXT");
    await relate(hiddenOnlyRound, fund, "HAS_INVESTOR");
    await createFundingRound(hiddenOnlyProfile, "unrelated-visible-round", {
      roundName: "Series A",
      date: Date.UTC(2024, 1, 1) / 1000,
      raisedAmount: 100_000_000,
      raisedAmountUnit: "USD",
    });

    const bannedMember = await createProfileMemberFixture(
      postgres,
      "Organization",
      "banned-profile-company",
      { orgId: "banned-profile-company", name: "Banned Profile Company" },
    );
    const bannedProfile = await memberProfile(bannedMember);
    const bannedRound = await createFundingRound(
      bannedProfile,
      "banned-profile-round",
      {
        roundName: "Seed",
        date: Date.UTC(2024, 0, 1) / 1000,
        raisedAmount: 200_000_000,
        raisedAmountUnit: "USD",
      },
    );
    await relate(bannedRound, fund, "HAS_INVESTOR");

    const project = await createProfileMemberFixture(
      postgres,
      "Project",
      "project-only-capital",
      {
        id: "project-only-capital",
        name: "Project Only",
        normalizedName: "project-only-capital",
      },
    );
    const projectProfile = await memberProfile(project);
    const projectRound = await createFundingRound(
      projectProfile,
      "project-only-round",
      {
        roundName: "Seed",
        date: Date.UTC(2024, 0, 1) / 1000,
        raisedAmount: 3_000_000,
        raisedAmountUnit: "USD",
      },
    );
    await relate(projectRound, fund, "HAS_INVESTOR");
    await postgres.query(
      `UPDATE graph_nodes SET properties = properties || '{"banned":true}'::jsonb WHERE id = ANY($1::bigint[])`,
      [[hiddenMember, hiddenOnlyMember, bannedProfile]],
    );

    await postgres.query(
      "SELECT refresh_fund_analytics_documents($1::text[])",
      [[slug]],
    );
    const details = await service.getFundDetailsBySlug(slug, {
      activityWindow: "all",
    });
    expect(details).toMatchObject({
      portfolioCount: 2,
      investmentRoundCount: 2,
      knownRoundCapital: 5_000_000,
    });
    if (!details) throw new Error("Expected visible fund details");
    expect(details.investments).toHaveLength(1);
    expect(details.investments[0]).toMatchObject({
      organizationId: "visible-capital-company",
      normalizedName: "visible-capital-company",
    });
    expect(details.investments[0].rounds).toEqual([
      expect.objectContaining({
        id: "visible-round",
        raisedAmount: 2_000_000,
        investorCount: 1,
        fundParticipated: true,
        investmentRole: "recorded-solo",
      }),
    ]);
  });

  async function memberProfile(memberId: string): Promise<string> {
    const [profile] = await postgres.query<{ id: string }>(
      `SELECT source_id::text AS id FROM graph_relationships
       WHERE target_id = $1
         AND type IN ('PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT')`,
      [memberId],
    );
    return profile.id;
  }

  async function createOrganizationMember(
    profileId: string,
    key: string,
  ): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `WITH member AS (
         INSERT INTO graph_nodes (label, labels, node_key, properties)
         VALUES ('Organization', ARRAY['Organization']::text[], $2,
           jsonb_build_object('orgId', $2::text, 'name', $2::text, 'normalizedName', $2::text))
         RETURNING id
       ), membership AS (
         INSERT INTO graph_relationships (
           source_id, target_id, type, relationship_key, properties
         )
         SELECT $1::bigint, member.id, 'PROFILE_HAS_ORGANIZATION', '', '{}'::jsonb
         FROM member
         RETURNING id
       )
       SELECT member.id::text AS id FROM member CROSS JOIN membership`,
      [profileId, key],
    );
    return row.id;
  }

  async function createFundingRound(
    profileId: string,
    key: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    // Profile ownership must exist when the funding-node constraint fires.
    const [row] = await postgres.query<{ id: string }>(
      `WITH funding_round AS (
         INSERT INTO graph_nodes (label, labels, node_key, properties)
         VALUES ('FundingRound', ARRAY['FundingRound']::text[], $2, $3::jsonb)
         RETURNING id
       ), ownership AS (
         INSERT INTO graph_relationships (
           source_id, target_id, type, relationship_key, properties
         )
         SELECT $1::bigint, funding_round.id, 'HAS_FUNDING_ROUND', '', '{}'::jsonb
         FROM funding_round
         RETURNING id
       )
       SELECT funding_round.id::text AS id
       FROM funding_round CROSS JOIN ownership`,
      [profileId, key, JSON.stringify({ id: key, ...properties })],
    );
    return row.id;
  }

  async function createNode(
    label: string,
    key: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const [row] = await postgres.query<{ id: string }>(
      `INSERT INTO graph_nodes (label, labels, node_key, properties)
       VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
       RETURNING id::text AS id`,
      [label, key, JSON.stringify({ id: key, ...properties })],
    );
    return row.id;
  }

  async function relate(
    source: string,
    target: string,
    type: string,
  ): Promise<void> {
    await postgres.query(
      `INSERT INTO graph_relationships (source_id, target_id, type, relationship_key, properties)
       VALUES ($1, $2, $3, '', '{}'::jsonb)`,
      [source, target, type],
    );
  }
});
