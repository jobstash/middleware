import axios from "axios";
import * as Sentry from "@sentry/node";
import { ConfigService } from "@nestjs/config";
import { Auth0Service } from "../auth0/auth0.service";
import { CustomLogger } from "../shared/utils/custom-logger";
import { ProjectsService } from "./projects.service";
import { GraphRepository } from "../postgres/graph.repository";
import { SearchDocumentRepository } from "../postgres/search-document.repository";
import { UpdateProjectInput } from "./dto/update-project.input";
import { ProjectMoreInfoEntity } from "../shared/entities/project-more-info.entity";

jest.mock("@sentry/node", () => ({
  ...jest.requireActual("@sentry/node"),
  captureException: jest.fn(),
}));

describe("project update read-model visibility", () => {
  it("publishes completed link changes before returning and subsequent GET", async () => {
    const links: Record<string, string> = {};
    let projected = {
      id: "project",
      name: "Product",
      summary: "Product",
      docs: null as string | null,
      twitter: null as string | null,
    };
    const graph = {
      updateNodes: jest
        .fn()
        .mockResolvedValue([
          { nodeId: "123", properties: { id: "project", name: "Product" } },
        ]),
      findNode: jest
        .fn()
        .mockResolvedValue({ nodeId: "124", properties: { id: "category" } }),
      setRelationshipsToNodes: jest.fn().mockResolvedValue([]),
      replaceRelatedValueNodes: jest.fn(
        async (input: { type: string; values: string[] }) => {
          links[input.type] = input.values[0];
        },
      ),
    };
    const search = {
      getProjectById: jest.fn(async () => ({ ...projected })),
      refreshProjectDocuments: jest.fn(async () => {
        projected = {
          ...projected,
          docs: links.HAS_DOCSITE,
          twitter: links.HAS_TWITTER,
        };
        return 1;
      }),
    };
    const service = new ProjectsService(
      undefined,
      undefined,
      search as unknown as SearchDocumentRepository,
      graph as unknown as GraphRepository,
    );
    await service.update("project", {
      name: "Product",
      category: "Infrastructure",
      docs: "https://example.test/docs",
      twitter: "https://x.com/product",
    } as UpdateProjectInput);
    expect(search.refreshProjectDocuments).toHaveBeenCalledWith(["123"]);
    expect(await service.getProjectById("project")).toMatchObject({
      docs: "https://example.test/docs",
      twitter: "https://x.com/product",
    });
  });
});

describe("project scalar boundaries", () => {
  const input = {
    name: "Product",
    category: "Infrastructure",
  } as UpdateProjectInput;

  const setup = (
    summary: unknown,
    projection?: Record<string, unknown>,
  ): {
    service: ProjectsService;
    graph: Record<string, jest.Mock>;
    search: Record<string, jest.Mock>;
  } => {
    const graph = {
      updateNodes: jest.fn().mockResolvedValue([
        {
          nodeId: "123",
          properties: {
            id: "project",
            name: "Product",
            normalizedName: "product",
            summary,
            monthlyFees: 12,
          },
        },
      ]),
      findNode: jest.fn().mockResolvedValue({
        nodeId: "124",
        properties: { id: "category" },
      }),
      createNode: jest.fn(),
      setRelationshipsToNodes: jest.fn().mockResolvedValue([]),
      replaceRelatedValueNodes: jest.fn().mockResolvedValue([]),
    };
    const search = {
      getProjectById: jest.fn().mockResolvedValue(projection),
      refreshProjectDocuments: jest.fn().mockResolvedValue(1),
    };
    const service = new ProjectsService(
      undefined,
      undefined,
      search as unknown as SearchDocumentRepository,
      graph as unknown as GraphRepository,
    );
    return { service, graph, search };
  };

  beforeEach(() => {
    jest.spyOn(CustomLogger.prototype, "error").mockImplementation(() => {});
    jest.mocked(Sentry.captureException).mockReset().mockReturnValue("event");
  });

  afterEach(() => jest.restoreAllMocks());

  describe.each(["update", "updateMetrics"] as const)("%s summary", method => {
    const invoke = (
      service: ProjectsService,
    ): Promise<ProjectMoreInfoEntity> =>
      method === "update"
        ? service.update("project", input)
        : service.updateMetrics("project", {
            monthlyFees: 12,
            monthlyVolume: 24,
            monthlyRevenue: 6,
            monthlyActiveUsers: 10,
          });

    it.each([undefined, { summary: null }, { summary: undefined }])(
      "uses the stored scalar when the projection is nullish: %p",
      async projection => {
        const { service } = setup("Stored summary", projection);
        const result = await invoke(service);
        expect(result.getProperties()).toMatchObject({
          summary: "Stored summary",
          monthlyFees: 12,
          orgIds: [],
        });
      },
    );

    it.each([null, undefined, ""])(
      "preserves the valid empty summary response for %p",
      async summary => {
        const { service } = setup(summary);
        const result = await invoke(service);
        expect(result).toBeDefined();
        expect(result["raw"].summary).toBe("");
        expect(result.getProperties().summary).toBe("");
      },
    );

    it.each([
      { summary: {} },
      { summary: ["summary"] },
      { summary: 42 },
      { summary: true },
    ])("rejects a malformed stored fallback: %p", async ({ summary }) => {
      const { service } = setup(summary);
      expect(await invoke(service)).toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalledWith(
        new TypeError("Project summary must be a string"),
      );
    });

    it.each(["Projected summary", ""])(
      "retains non-nullish projection precedence for %p",
      async summary => {
        const { service } = setup(
          { invalid: true },
          {
            summary,
            orgIds: ["org"],
            description: "Projected description",
          },
        );
        const result = await invoke(service);
        expect(result["raw"].summary).toBe(summary);
        expect(result["raw"].orgIds).toEqual(["org"]);
        expect(result["raw"].description).toBe("Projected description");
        expect(result.getProperties().summary).toBe(summary);
        expect(Sentry.captureException).not.toHaveBeenCalled();
      },
    );
  });

  it("uses an existing category id before replacing project links", async () => {
    const { service, graph } = setup("Summary");
    expect(await service.update("project", input)).toBeDefined();
    expect(graph.createNode).not.toHaveBeenCalled();
    expect(graph.setRelationshipsToNodes).toHaveBeenCalledWith({
      sourceLabel: "Project",
      sourceWhere: { id: "project" },
      type: "HAS_CATEGORY",
      targetLabel: "ProjectCategory",
      targetProperty: "id",
      targetValues: ["category"],
      replace: true,
    });
    expect(
      graph.setRelationshipsToNodes.mock.invocationCallOrder[0],
    ).toBeLessThan(graph.replaceRelatedValueNodes.mock.invocationCallOrder[0]);
  });

  it("links the generated UUID when creating a category", async () => {
    const { service, graph } = setup("Summary");
    graph.findNode.mockResolvedValue(undefined);
    graph.createNode.mockImplementation(
      (_label: string, properties: Record<string, unknown>) =>
        Promise.resolve({ nodeId: "125", properties }),
    );
    expect(await service.update("project", input)).toBeDefined();
    const category = graph.createNode.mock.calls[0][1];
    expect(category).toEqual({
      name: "Infrastructure",
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
    expect(graph.setRelationshipsToNodes).toHaveBeenCalledWith(
      expect.objectContaining({ targetValues: [category.id], replace: true }),
    );
    expect(graph.createNode.mock.invocationCallOrder[0]).toBeLessThan(
      graph.setRelationshipsToNodes.mock.invocationCallOrder[0],
    );
  });

  it.each([
    { id: {} },
    { id: ["category"] },
    { id: null },
    { id: undefined },
    { id: 42 },
    { id: true },
  ])(
    "rejects malformed category id %p before relationship replacement",
    async ({ id }) => {
      const { service, graph, search } = setup("Summary");
      graph.findNode.mockResolvedValue({ nodeId: "124", properties: { id } });
      expect(await service.update("project", input)).toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalledWith(
        new TypeError("Project category id must be a string"),
      );
      expect(graph.createNode).not.toHaveBeenCalled();
      expect(graph.setRelationshipsToNodes).not.toHaveBeenCalled();
      expect(graph.replaceRelatedValueNodes).not.toHaveBeenCalled();
      expect(search.refreshProjectDocuments).not.toHaveBeenCalled();
    },
  );
});

describe("project import warning", () => {
  afterEach(() => jest.restoreAllMocks());

  it("logs only the URL and status while preserving the failure response", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({
      status: 204,
      data: { token: "response-secret", arbitrary: "response-content" },
    });
    const warn = jest
      .spyOn(CustomLogger.prototype, "warn")
      .mockImplementation(() => {});
    const service = new ProjectsService(
      {
        get: jest.fn().mockReturnValue("https://etl.example"),
      } as unknown as ConfigService,
      {
        getETLToken: jest.fn().mockResolvedValue("auth-secret"),
      } as unknown as Auth0Service,
      undefined,
      undefined,
    );
    const request = {
      name: "Unlogged name",
      url: "https://project.example",
      orgId: "org",
      defiLlamaSlug: "project",
      arbitrary: { token: "request-secret" },
    };
    expect(await service.addProjectByUrl(request)).toEqual({
      success: false,
      message: "Error adding project",
    });
    expect(warn.mock.calls).toEqual([
      ["Error queueing project https://project.example for import: HTTP 204"],
    ]);
  });
});
