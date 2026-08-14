import { OrganizationsService } from "./organizations.service";
import { ProjectsService } from "src/projects/projects.service";
import axios from "axios";
import { ConflictException } from "@nestjs/common";

describe("admin directory services", () => {
  afterEach(() => jest.restoreAllMocks());
  const directory = {
    data: [{ orgId: "org-1", name: "Acme", projectCount: 1 }],
    total: 1,
  };

  it("delegates organization directory reads to the bounded projection", async () => {
    const searchDocuments = {
      getAdminOrganizationDirectory: jest.fn().mockResolvedValue(directory),
    };
    const service = new OrganizationsService(
      {} as never,
      {} as never,
      searchDocuments as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const options = { query: "acme", limit: 25, offset: 0 };

    await expect(service.getAdminDirectory(options)).resolves.toBe(directory);
    expect(searchDocuments.getAdminOrganizationDirectory).toHaveBeenCalledWith(
      options,
    );
  });

  it("delegates project directory reads to the bounded projection", async () => {
    const projectDirectory = {
      data: [{ id: "project-1", name: "Acme", orgIds: ["org-1"] }],
      total: 1,
    };
    const searchDocuments = {
      getAdminProjectDirectory: jest.fn().mockResolvedValue(projectDirectory),
    };
    const service = new ProjectsService(
      {} as never,
      {} as never,
      searchDocuments as never,
      {} as never,
    );
    const options = { query: "acme", limit: 25, offset: 0 };

    await expect(service.getAdminDirectory(options)).resolves.toBe(
      projectDirectory,
    );
    expect(searchDocuments.getAdminProjectDirectory).toHaveBeenCalledWith(
      options,
    );
  });

  it("proxies guarded organization classification writes to ETL", async () => {
    jest.spyOn(axios, "post").mockResolvedValue({
      data: { entityId: "org-1", vertical: "fintech", idempotent: false },
    });
    const service = new OrganizationsService(
      { get: jest.fn(() => "https://etl.example/") } as never,
      { getETLToken: jest.fn().mockResolvedValue("etl-token") } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateVerticalClassification("org-1", {
        expectedVertical: "crypto",
        vertical: "fintech",
        reason: "The current core product is financial infrastructure.",
        evidence: [],
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { entityId: "org-1", vertical: "fintech" },
    });
    expect(axios.post).toHaveBeenCalledWith(
      "https://etl.example/vertical-classifications/manual",
      expect.objectContaining({
        entityId: "org-1",
        expectedVertical: "crypto",
        vertical: "fintech",
      }),
      expect.objectContaining({
        headers: { Authorization: "Bearer etl-token" },
      }),
    );
  });

  it("preserves ETL stale-write conflicts", async () => {
    jest.spyOn(axios, "post").mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Expected crypto, found ai" } },
    });
    const service = new OrganizationsService(
      { get: jest.fn(() => "https://etl.example") } as never,
      { getETLToken: jest.fn().mockResolvedValue("etl-token") } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateVerticalClassification("org-1", {
        expectedVertical: "crypto",
        vertical: "fintech",
        reason: "Manual correction.",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
