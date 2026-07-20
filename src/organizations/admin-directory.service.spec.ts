import { OrganizationsService } from "./organizations.service";
import { ProjectsService } from "src/projects/projects.service";

describe("admin directory services", () => {
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
});
