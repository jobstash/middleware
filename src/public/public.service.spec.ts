import { JobListResult } from "src/shared/interfaces";
import { shapeLegacyPublicJobPayload } from "./public.service";

describe("shapeLegacyPublicJobPayload", () => {
  it("keeps stored project data out of the legacy public projection", () => {
    const payload = {
      organization: {
        hasUser: true,
        atsClient: "greenhouse",
        projects: [
          {
            id: "project-1",
            jobs: [{ id: "job-1" }],
            repos: [{ id: "repo-1" }],
            grants: [{ id: "grant-1" }],
            investors: [{ id: "investor-1" }],
            fundingRounds: [{ id: "round-1" }],
          },
        ],
      },
    } as unknown as JobListResult;

    const shaped = shapeLegacyPublicJobPayload(payload);

    expect(shaped.organization).toMatchObject({
      hasUser: false,
      atsClient: null,
      projects: [
        {
          id: "project-1",
          jobs: [],
          repos: [],
          grants: [],
          investors: [],
          fundingRounds: [],
        },
      ],
    });
    expect(payload.organization.projects[0].jobs).toEqual([{ id: "job-1" }]);
  });
});
