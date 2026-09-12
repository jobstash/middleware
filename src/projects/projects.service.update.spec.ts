import { ProjectsService } from "./projects.service";
import { GraphRepository } from "../postgres/graph.repository";
import { SearchDocumentRepository } from "../postgres/search-document.repository";
import { UpdateProjectInput } from "./dto/update-project.input";

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
