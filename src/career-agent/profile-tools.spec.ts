import * as Ajv from "ajv";
import { randomUUID } from "node:crypto";
import {
  profileUpdateSchema,
  updateProfileFromConversation,
} from "./profile-tools";
const validate = new Ajv().compile(profileUpdateSchema);
it("accepts a bounded profile patch without a caller-selected identity or factual qualifications", () => {
  const input = {
    requestId: randomUUID(),
    revision: 0,
    expectedVersion: "a".repeat(32),
    preferences: { residenceCountry: "NL", workModes: ["remote"] },
  };
  expect(validate(input)).toBe(true);
  for (const extra of [
    { wallet: "bob" },
    { preferences: { skills: ["invented"] } },
    { preferences: { utcOffset: 20 } },
    { location: { city: "a".repeat(161) } },
    { preferences: {} },
  ])
    expect(validate({ ...input, ...extra })).toBe(false);
});
it("uses existing profile services with the same transaction and only the requested fields", async () => {
  const db = {
    query: jest.fn(async (sql: string) =>
      sql.includes("SELECT revision")
        ? [{ revision: 4 }]
        : sql.includes("md5(")
          ? [{ version: "a".repeat(32) }]
          : [],
    ),
  };
  const career = {
    mutate: jest.fn(async (wallet, operation, input, work) =>
      work(db, "owner"),
    ),
  };
  const profiles = {
    getJobPreferences: jest.fn(async () => ({
      workModes: ["hybrid"],
      residenceCountry: "NL",
    })),
    updateJobPreferences: jest.fn(async () => ({ workModes: ["remote"] })),
    updateUserAvailability: jest.fn(async () => ({ success: true })),
    updateUserLocationInfo: jest.fn(),
  };
  const result = await updateProfileFromConversation(
    career as never,
    profiles as never,
    "alice",
    {
      requestId: randomUUID(),
      revision: 4,
      expectedVersion: "a".repeat(32),
      preferences: { workModes: ["remote"] },
      available: true,
    },
  );
  expect(result.revision).toBe(5);
  expect(profiles.updateJobPreferences).toHaveBeenCalledWith(
    "alice",
    expect.objectContaining({ workModes: ["remote"] }),
    db,
  );
  expect(profiles.updateUserAvailability).toHaveBeenCalledWith(
    "alice",
    true,
    db,
  );
  expect(profiles.updateUserLocationInfo).not.toHaveBeenCalled();
  // The repository now emits the event for every domain mutation, in the shared transaction.
});
it("rejects stale profile versions before calling a profile write", async () => {
  const db = {
    query: jest.fn(async (sql: string) =>
      sql.includes("SELECT revision")
        ? [{ revision: 4 }]
        : [{ version: "b".repeat(32) }],
    ),
  };
  const career = {
    mutate: async (wallet, operation, input, work) => work(db, "owner"),
  };
  const profiles = { updateJobPreferences: jest.fn() };
  await expect(
    updateProfileFromConversation(career as never, profiles as never, "alice", {
      requestId: randomUUID(),
      revision: 4,
      expectedVersion: "a".repeat(32),
      preferences: { workModes: ["remote"] },
    }),
  ).rejects.toThrow("Profile changed");
  expect(profiles.updateJobPreferences).not.toHaveBeenCalled();
});
