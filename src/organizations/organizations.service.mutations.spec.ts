import { BadRequestException } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";

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
