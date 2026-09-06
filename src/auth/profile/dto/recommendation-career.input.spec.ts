import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RecommendationCareerInput } from "./recommendation-career.input";

describe("RecommendationCareerInput", () => {
  const check = (input: unknown) =>
    validate(plainToInstance(RecommendationCareerInput, input), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  it("accepts unknown dates without manufacturing employment history", async () => {
    expect(
      await check({
        roles: [
          {
            title: "Engineer",
            company: "Acme",
            description: "Build tools",
            startDate: null,
            endDate: null,
            current: true,
            seniority: null,
          },
        ],
        educationLevel: null,
      }),
    ).toEqual([]);
  });
  it("rejects attempts to set another user or an invalid date", async () => {
    expect(
      await check({ wallet: "another-user", roles: [], educationLevel: null }),
    ).not.toEqual([]);
    expect(
      await check({
        roles: [
          {
            title: "Engineer",
            company: "Acme",
            description: "",
            startDate: "2026-02-30",
            endDate: null,
            current: true,
            seniority: null,
          },
        ],
        educationLevel: null,
      }),
    ).not.toEqual([]);
  });
  it("bounds profile text and number of roles", async () => {
    expect(
      await check({ roles: Array(31).fill({}), educationLevel: null }),
    ).not.toEqual([]);
  });
});
