import { BadRequestException } from "@nestjs/common";
import axios from "axios";
import * as Sentry from "@sentry/node";
import { ConfigService } from "@nestjs/config";
import { Auth0Service } from "../auth0/auth0.service";
import { CustomLogger } from "../shared/utils/custom-logger";
import { OrganizationsService } from "./organizations.service";

jest.mock("@sentry/node", () => ({
  ...jest.requireActual("@sentry/node"),
  captureException: jest.fn(),
}));

describe("OrganizationsService mutations", () => {
  const graph = {
    createNode: jest.fn(),
    findNode: jest.fn(),
    refreshOrganizationSearchDocuments: jest.fn(),
    transaction: jest.fn(),
    updateNodes: jest.fn(),
    upsertRelationship: jest.fn(),
  };
  const service = new OrganizationsService(
    {} as never,
    {} as never,
    {} as never,
    graph as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refreshes the organization search document after updating canonical fields", async () => {
    const manager = { query: jest.fn() };
    graph.transaction.mockImplementation((work: (value: unknown) => unknown) =>
      work(manager),
    );
    graph.updateNodes.mockResolvedValue([
      {
        nodeId: "42",
        properties: {
          id: "organization-42",
          orgId: "99000244",
          name: "Second tier",
          normalizedName: "second-tier",
          logoUrl: null,
          description: "Description",
          summary: "Summary",
          headcountEstimate: null,
          location: "Distributed",
          createdTimestamp: 1,
          updatedTimestamp: 2,
        },
      },
    ]);
    graph.refreshOrganizationSearchDocuments.mockResolvedValue(undefined);

    await service.update("99000244", {
      name: "Second tier",
      logoUrl: null,
      description: "Description",
      summary: "Summary",
      headcountEstimate: null,
      location: "Distributed",
    } as never);

    expect(graph.updateNodes).toHaveBeenCalledWith(
      "Organization",
      { orgId: "99000244" },
      expect.objectContaining({
        name: "Second tier",
        normalizedName: "second-tier",
      }),
      manager,
    );
    expect(graph.refreshOrganizationSearchDocuments).toHaveBeenCalledWith(
      ["42"],
      manager,
    );
  });

  it("creates and links an active jobsite in one transaction", async () => {
    const manager = { query: jest.fn() };
    graph.transaction.mockImplementation((work: (value: unknown) => unknown) =>
      work(manager),
    );
    graph.findNode.mockResolvedValue({
      nodeId: "42",
      properties: { orgId: "99000244" },
    });
    graph.createNode.mockImplementation(
      (_label: string, properties: Record<string, unknown>) =>
        Promise.resolve({ nodeId: "43", properties }),
    );
    graph.upsertRelationship.mockResolvedValue(undefined);
    graph.refreshOrganizationSearchDocuments.mockResolvedValue(undefined);

    const result = await service.createOrgJobsite({
      orgId: "99000244",
      url: "https://jobs.example.com/tier",
      type: "custom",
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        url: "https://jobs.example.com/tier",
        type: "custom",
      },
    });
    expect(graph.createNode).toHaveBeenCalledWith(
      "Jobsite",
      expect.objectContaining({
        url: "https://jobs.example.com/tier",
        type: "custom",
      }),
      expect.stringMatching(/^Organization:42:HAS_JOBSITE:/),
      manager,
    );
    expect(graph.upsertRelationship).toHaveBeenCalledWith({
      sourceNodeId: "42",
      targetNodeId: "43",
      type: "HAS_JOBSITE",
      executor: manager,
    });
    expect(graph.refreshOrganizationSearchDocuments).toHaveBeenCalledWith(
      ["42"],
      manager,
    );
  });

  it("does not create a jobsite when the organization is absent", async () => {
    graph.transaction.mockImplementation((work: (value: unknown) => unknown) =>
      work({}),
    );
    graph.findNode.mockResolvedValue(undefined);

    await expect(
      service.createOrgJobsite({
        orgId: "missing",
        url: "https://jobs.example.com/missing",
        type: "custom",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(graph.createNode).not.toHaveBeenCalled();
  });
});

describe("organization project name boundary", () => {
  afterEach(() => jest.restoreAllMocks());

  const setup = (
    names: unknown[],
  ): {
    graph: { setRelationshipsToNodes: jest.Mock };
    service: OrganizationsService;
  } => {
    const graph = {
      setRelationshipsToNodes: jest
        .fn()
        .mockResolvedValue(names.map(name => ({ properties: { name } }))),
    };
    const service = new OrganizationsService(
      undefined,
      undefined,
      undefined,
      graph as never,
      undefined,
      undefined,
    );
    return { graph, service };
  };

  it("returns linked project names unchanged", async () => {
    const { graph, service } = setup(["Project One", "Project Two", ""]);
    expect(
      await service.updateOrgProjects("org", ["one", "two", "three"]),
    ).toEqual({
      success: true,
      message: "Updated organization projects successfully",
      data: ["Project One", "Project Two", ""],
    });
    expect(graph.setRelationshipsToNodes).toHaveBeenCalledWith({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org" },
      type: "HAS_PROJECT",
      targetLabel: "Project",
      targetProperty: "id",
      targetValues: ["one", "two", "three"],
      replace: true,
    });
  });

  it("retains the empty relationship response", async () => {
    const { service } = setup([]);
    expect(await service.updateOrgProjects("org", [])).toEqual({
      success: true,
      message: "Updated organization projects successfully",
      data: [],
    });
  });

  it.each([
    { name: {} },
    { name: ["name"] },
    { name: null },
    { name: undefined },
    { name: 42 },
    { name: true },
  ])(
    "returns the existing failure response for malformed project name %p",
    async ({ name }) => {
      const capture = jest
        .mocked(Sentry.captureException)
        .mockReset()
        .mockReturnValue("event");
      const { service } = setup(["Valid project", name]);
      expect(await service.updateOrgProjects("org", ["one", "two"])).toEqual({
        success: false,
        message: "Failed to update org projects",
      });
      expect(capture).toHaveBeenCalledWith(
        new TypeError("Project name must be a string"),
      );
    },
  );
});

describe("organization import warnings", () => {
  const config = {
    get: jest.fn().mockReturnValue("https://etl.example"),
  } as unknown as ConfigService;
  const auth0 = {
    getETLToken: jest.fn().mockResolvedValue("auth-secret"),
  } as unknown as Auth0Service;

  afterEach(() => jest.restoreAllMocks());

  it("logs only organization URL and status on a nonaccepted response", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({
      status: 204,
      statusText: "No Content",
      data: { token: "response-secret", arbitrary: "response-content" },
    });
    const warn = jest
      .spyOn(CustomLogger.prototype, "warn")
      .mockImplementation(() => {});
    const service = new OrganizationsService(
      config,
      auth0,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    const request = {
      name: "Unlogged name",
      url: "https://organization.example",
      arbitrary: { token: "request-secret" },
    };
    expect(await service.addOrganizationByUrl(request)).toEqual({
      success: false,
      message: "Error adding organization: No Content",
    });
    expect(warn.mock.calls).toEqual([
      [
        "Error queueing organization https://organization.example for import: HTTP 204",
      ],
    ]);
  });

  it("logs only organization/jobsite identifiers and status on a nonaccepted response", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({
      status: 204,
      data: { token: "response-secret", arbitrary: "response-content" },
    });
    const warn = jest
      .spyOn(CustomLogger.prototype, "warn")
      .mockImplementation(() => {});
    const graph = {
      findRelatedNodes: jest
        .fn()
        .mockResolvedValue([
          { properties: { id: "jobsite", url: "https://jobs.example" } },
        ]),
    };
    const service = new OrganizationsService(
      config,
      auth0,
      undefined,
      graph as never,
      undefined,
      undefined,
    );
    const request = {
      orgId: "org",
      jobsiteId: "jobsite",
      arbitrary: { token: "request-secret" },
    };
    expect(await service.importOrganizationJobsiteById(request)).toEqual({
      success: false,
      message: "Error importing organization jobsite",
    });
    expect(graph.findRelatedNodes).toHaveBeenCalledWith({
      sourceLabel: "Organization",
      sourceWhere: { orgId: "org" },
      relationshipType: "HAS_DETECTED_JOBSITE",
      targetLabel: "DetectedJobsite",
      targetWhere: { id: "jobsite" },
    });
    expect(warn.mock.calls).toEqual([
      ["Error queueing organization org jobsite jobsite for import: HTTP 204"],
    ]);
  });
});
