import { Client } from "pg";
import { WorkArrangementV1 } from "../../shared/interfaces/work-arrangement.interface";
import {
  jobEmployerPayload,
  jobWorkArrangementPayload,
} from "./job-employer-payload.sql";

const databaseUrl = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("job WorkArrangementV1 payload in PostgreSQL", () => {
  let db: Client;

  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname)) {
      throw new Error(
        "Work-arrangement fixtures require an isolated local database",
      );
    }
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
  });

  afterAll(async () => {
    if (db) await db.end();
  });

  it.each(["remote", "hybrid", "onsite"])(
    "retains %s options missing contextual fields and preserves explicit classifications",
    async mode => {
      const option = {
        optionKey: "legacy",
        scope: "country_list",
        includedCountries: ["nl"],
        excludedCountries: ["us"],
        includedRegions: ["EU"],
        excludedRegions: ["APAC"],
        requiredUtcBand: { minimumMinutes: -120, maximumMinutes: 180 },
        preferredUtcBand: { minimumMinutes: 0, maximumMinutes: 60 },
        residencyRequirements: ["Netherlands resident"],
        workAuthorizations: ["EU work permit"],
        sponsorshipStatus: "unavailable",
        officeCity: "Amsterdam",
        attendanceCadence: "Weekly",
        travelRequirement: "Quarterly",
        confidence: "source_stated",
        evidence: "private extraction text",
      };
      const arrangement = {
        classification: "conflicting",
        fullyRemote: false,
        remoteOptions: [],
        hybridOptions: [],
        onsiteOptions: [],
        [`${mode}Options`]: [
          option,
          {
            ...option,
            optionKey: "explicit",
            mode,
            classification: "remote_unqualified",
          },
        ],
      };
      const { rows } = await db.query(
        `SELECT ${jobWorkArrangementPayload("job")} AS payload
         FROM (SELECT $1::jsonb AS work_arrangement) job`,
        [JSON.stringify(arrangement)],
      );
      const payload = rows[0].payload;
      const expectedOption = {
        classification: "conflicting",
        mode,
        scope: "country_list",
        includedCountries: ["NL"],
        excludedCountries: ["US"],
        includedRegions: ["EU"],
        excludedRegions: ["APAC"],
        requiredUtcBand: { minimumUtcOffset: -2, maximumUtcOffset: 3 },
        preferredUtcBand: { minimumUtcOffset: 0, maximumUtcOffset: 1 },
        residencyRequirements: ["Netherlands resident"],
        workAuthorizationRequirements: ["EU work permit"],
        sponsorshipStatus: "unavailable",
        officeCity: "Amsterdam",
        attendanceCadence: "Weekly",
        travelRequirement: "Quarterly",
        confidence: "source_stated",
      };
      expect(payload).toEqual({
        classification: "conflicting",
        fullyRemote: false,
        remoteOptions: [],
        hybridOptions: [],
        onsiteOptions: [],
        [`${mode}Options`]: [
          { ...expectedOption, classification: "remote_unqualified" },
          expectedOption,
        ],
      });
      expect(WorkArrangementV1.WorkArrangementV1Type.is(payload)).toBe(true);
    },
  );

  it.each(["remote", "hybrid", "onsite"])(
    "preserves explicit null and invalid %s option metadata for strict rejection",
    async mode => {
      for (const field of ["mode", "classification"]) {
        for (const value of [null, "invalid", 123, false, {}, []]) {
          const option = {
            mode,
            classification: "verified_remote",
            scope: "global",
            [field]: value,
          };
          const arrangement = {
            classification: "verified_remote",
            fullyRemote: false,
            remoteOptions: [],
            hybridOptions: [],
            onsiteOptions: [],
            [`${mode}Options`]: [option],
          };
          const { rows } = await db.query(
            `SELECT ${jobWorkArrangementPayload("job")} AS payload
             FROM (SELECT $1::jsonb AS work_arrangement) job`,
            [JSON.stringify(arrangement)],
          );
          const payload = rows[0].payload;
          expect(payload[`${mode}Options`]).toHaveLength(1);
          expect(payload[`${mode}Options`][0][field]).toEqual(value);
          expect(
            WorkArrangementV1.WorkArrangementV1Type.decode(payload)._tag,
          ).toBe("Left");
        }
      }
    },
  );

  it.each([null, "invalid", 123, false, {}, []])(
    "preserves invalid parent classification %p when an option inherits it",
    async classification => {
      const { rows } = await db.query(
        `SELECT ${jobWorkArrangementPayload("job")} AS payload
         FROM (SELECT $1::jsonb AS work_arrangement) job`,
        [
          JSON.stringify({
            classification,
            remoteOptions: [{ scope: "global" }],
            hybridOptions: [],
            onsiteOptions: [],
          }),
        ],
      );
      const payload = rows[0].payload;
      expect(payload.classification).toEqual(classification);
      expect(payload.remoteOptions).toHaveLength(1);
      expect(payload.remoteOptions[0]).toMatchObject({
        mode: "remote",
        classification,
      });
      expect(WorkArrangementV1.WorkArrangementV1Type.decode(payload)._tag).toBe(
        "Left",
      );
    },
  );

  it("retains explicit supported modes in their stored arrays without repartitioning", async () => {
    const { rows } = await db.query(
      `SELECT ${jobWorkArrangementPayload("job")} AS payload
       FROM (SELECT $1::jsonb AS work_arrangement) job`,
      [
        JSON.stringify({
          classification: "conflicting",
          remoteOptions: [{ scope: "global", mode: "onsite" }],
          hybridOptions: [{ scope: "global", mode: "remote" }],
          onsiteOptions: [{ scope: "global", mode: "hybrid" }],
        }),
      ],
    );
    expect(rows[0].payload.remoteOptions).toHaveLength(1);
    expect(rows[0].payload.hybridOptions).toHaveLength(1);
    expect(rows[0].payload.onsiteOptions).toHaveLength(1);
    expect(rows[0].payload.remoteOptions[0].mode).toBe("onsite");
    expect(rows[0].payload.hybridOptions[0].mode).toBe("remote");
    expect(rows[0].payload.onsiteOptions[0].mode).toBe("hybrid");
  });

  it("includes the validated public arrangement in the employer payload without leaking employer relation arrays", async () => {
    const { rows } = await db.query(
      `SELECT ${jobEmployerPayload("job.payload")} AS payload
       FROM (SELECT
         '{"shortUUID":"fixture-job"}'::jsonb AS payload,
         NULL::jsonb AS work_arrangement,
         'fixture-org'::text AS organization_id,
         NULL::text AS project_id
       ) job
       CROSS JOIN (SELECT
         '{"id":"fixture-org","tags":["private"],"jobs":["recursive"]}'::jsonb AS payload
       ) organization
       CROSS JOIN (SELECT NULL::jsonb AS payload) project`,
    );
    expect(rows[0].payload).toEqual({
      shortUUID: "fixture-job",
      organization: { id: "fixture-org" },
      project: null,
      workArrangement: {
        classification: "unstated",
        fullyRemote: null,
        remoteOptions: [],
        hybridOptions: [],
        onsiteOptions: [],
      },
    });
  });
});
