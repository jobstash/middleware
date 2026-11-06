import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { JobListParams } from "./job-list.input";
import { AdminJobsParams } from "./admin-jobs.input";
import { JobMatchInput } from "./job-match.input";
import { SuggestedJobsInput } from "./suggested-jobs.input";

const pipe = new ValidationPipe({ transform: true });
const jobBooleanFields = [
  "paysInCrypto",
  "offersTokenAllocation",
  "audits",
  "hacks",
  "newActiveLeads",
  "steppedDownLeads",
  "movedLeads",
  "earlyLeadDepartures",
  "recentlyFunded",
  "token",
  "onboardIntoWeb3",
  "expertJobs",
];

async function jobQuery(field: string, value: unknown): Promise<JobListParams> {
  return pipe.transform(
    { [field]: value },
    { type: "query", metatype: JobListParams },
  );
}

describe("strict job boolean input transformations", () => {
  it.each(jobBooleanFields)(
    "preserves true, false and null for %s",
    async field => {
      for (const value of [true, false, "true", "false", null, undefined]) {
        const transformed = await jobQuery(field, value);
        const expected = typeof value === "string" ? value === "true" : value;
        expect(transformed[field]).toBe(expected);
      }
    },
  );

  it.each(jobBooleanFields)("rejects malformed values for %s", async field => {
    for (const value of ["TRUE", "false ", "0", 0, 1, [], {}]) {
      await expect(jobQuery(field, value)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it("preserves the admin online filter's tri-state behavior", async () => {
    for (const [input, expected] of [
      ["true", true],
      ["false", false],
      [undefined, undefined],
      [null, null],
    ]) {
      const result = await pipe.transform(
        { online: input },
        { type: "query", metatype: AdminJobsParams },
      );
      expect(result.online).toBe(expected);
    }
    await expect(
      pipe.transform(
        { online: "yes" },
        { type: "query", metatype: AdminJobsParams },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps expert match required while suggestions default only nullish inputs", async () => {
    for (const value of [null, undefined, "TRUE", 1]) {
      await expect(
        pipe.transform(
          { skills: ["typescript"], isExpert: value },
          { type: "body", metatype: JobMatchInput },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const value of [null, undefined]) {
      const result = await pipe.transform(
        { isExpert: value },
        { type: "query", metatype: SuggestedJobsInput },
      );
      expect(result.isExpert).toBe(false);
    }
    for (const metatype of [JobMatchInput, SuggestedJobsInput]) {
      const result = await pipe.transform(
        { skills: ["typescript"], isExpert: "false" },
        { type: "query", metatype },
      );
      expect(result.isExpert).toBe(false);
      await expect(
        pipe.transform(
          { skills: ["typescript"], isExpert: "yes" },
          { type: "query", metatype },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
