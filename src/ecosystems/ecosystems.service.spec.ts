import * as Sentry from "@sentry/node";
import { EcosystemRepository } from "../postgres/ecosystem.repository";
import { ShortOrgWithSummaryEntity } from "../shared/entities";
import { CustomLogger } from "../shared/utils/custom-logger";
import { EcosystemsService } from "./ecosystems.service";

jest.mock("@sentry/node", () => ({
  ...jest.requireActual("@sentry/node"),
  captureException: jest.fn(),
}));

describe("ecosystem member scalar boundaries", () => {
  const member = {
    orgId: "org",
    website: "https://organization.example",
    name: "Organization",
    normalizedName: "organization",
    summary: "Organization summary",
    location: "Distributed",
    logoUrl: null,
    projects: [],
    reviews: [],
    fundingRounds: [],
    headcountEstimate: 10,
    grants: [],
    ecosystems: ["ecosystem"],
    fundingStage: "Seed",
    recentlyFunded: true,
    teamCoverageStatus: "current",
    teamSignalsAsOf: "2026-11-06T00:00:00.000Z",
    currentMaintainerCount: 3,
    activeLeadCount: 1,
    newActiveLeadCount: 0,
    steppedDownLeadCount: 0,
    movedLeadCount: 0,
    earlyLeadDepartureCount: 0,
  };
  const fields = [
    ["orgId", "orgId"],
    ["website", "url"],
    ["name", "name"],
    ["normalizedName", "normalizedName"],
    ["summary", "summary"],
    ["location", "location"],
  ] as const;

  const setup = (payload: Record<string, unknown>): EcosystemsService => {
    const ecosystems = {
      findOwnedEcosystems: jest.fn().mockResolvedValue([
        {
          properties: {
            id: "ecosystem",
            name: "Ecosystem",
            normalizedName: "ecosystem",
            createdTimestamp: 1,
            updatedTimestamp: 2,
          },
          memberPayloads: [payload],
        },
      ]),
    };
    return new EcosystemsService(
      ecosystems as unknown as EcosystemRepository,
      undefined,
      undefined,
    );
  };

  beforeEach(() => {
    jest.spyOn(CustomLogger.prototype, "error").mockImplementation(() => {});
    jest.mocked(Sentry.captureException).mockReset().mockReturnValue("event");
  });

  afterEach(() => jest.restoreAllMocks());

  it("passes valid scalar fields unchanged to the real short-org entity", async () => {
    const mapping = jest.spyOn(
      ShortOrgWithSummaryEntity.prototype,
      "getProperties",
    );
    const service = setup(member);
    const result = await service.findOne("owner", "ecosystem");
    expect(mapping).toHaveBeenCalledTimes(1);
    expect(mapping.mock.contexts[0]["raw"]).toMatchObject({
      orgId: "org",
      url: "https://organization.example",
      name: "Organization",
      normalizedName: "organization",
      summary: "Organization summary",
      location: "Distributed",
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        orgs: [
          {
            orgId: "org",
            summary: "Organization summary",
            fundingStage: "Seed",
            recentlyFunded: true,
            teamCoverageStatus: "current",
            teamSignalsAsOf: member.teamSignalsAsOf,
            currentMaintainerCount: 3,
            activeLeadCount: 1,
            newActiveLeadCount: 0,
          },
        ],
      },
    });
  });

  describe.each(fields)("%s -> %s", (source, target) => {
    it.each([null, undefined, ""])(
      "retains the empty-string input mapping for %p",
      async value => {
        const mapping = jest.spyOn(
          ShortOrgWithSummaryEntity.prototype,
          "getProperties",
        );
        const service = setup({ ...member, [source]: value });
        const result = await service.findOne("owner", "ecosystem");
        expect(mapping).toHaveBeenCalledTimes(1);
        expect(mapping.mock.contexts[0]["raw"][target]).toBe("");
        expect(result).toMatchObject({
          success: true,
          data: { orgs: [{ [target]: "" }] },
        });
      },
    );

    it.each([
      { value: {} },
      { value: ["value"] },
      { value: 42 },
      { value: true },
    ])(
      "rejects present malformed data %p before entity output",
      async ({ value }) => {
        const mapping = jest.spyOn(
          ShortOrgWithSummaryEntity.prototype,
          "getProperties",
        );
        const service = setup({ ...member, [source]: value });
        expect(await service.findOne("owner", "ecosystem")).toEqual({
          success: false,
          message: "Failed to retrieve ecosystem",
        });
        expect(mapping).not.toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalledWith(
          new TypeError("Ecosystem member text must be a string"),
        );
      },
    );
  });

  it.each([
    { recentlyFunded: "yes" },
    { fundingStage: {} },
    { teamCoverageStatus: "invalid" },
    { currentMaintainerCount: "3" },
  ])("does not hide invalid funding/team metadata: %p", async invalid => {
    const result = await setup({ ...member, ...invalid }).findOne(
      "owner",
      "ecosystem",
    );
    expect(result).toEqual({
      success: false,
      message: "Failed to retrieve ecosystem",
    });
  });
});
