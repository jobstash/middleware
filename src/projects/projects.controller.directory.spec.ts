import { ConfigService } from "@nestjs/config";
import { ProjectsController } from "./projects.controller";

describe("ProjectsController admin directory", () => {
  const buildController = (): {
    controller: ProjectsController;
    projectsService: { getAdminDirectory: jest.Mock };
  } => {
    const projectsService = {
      getAdminDirectory: jest.fn(),
    };
    const configService = {
      get: jest.fn(() => "test-token"),
    };
    const controller = new ProjectsController(
      projectsService as never,
      {} as never,
      {} as never,
      configService as unknown as ConfigService,
      {} as never,
    );
    return { controller, projectsService };
  };

  it("normalizes and caps the admin project directory request", async () => {
    const { controller, projectsService } = buildController();
    projectsService.getAdminDirectory.mockResolvedValue({
      data: [{ id: "project-1", name: "Acme", orgIds: ["org-1"] }],
      total: 1,
    });

    await expect(
      controller.getProjectDirectory("  DEFI  ", "1000", "-1"),
    ).resolves.toEqual({
      success: true,
      message: "Retrieved the project directory successfully",
      data: [{ id: "project-1", name: "Acme", orgIds: ["org-1"] }],
      total: 1,
    });
    expect(projectsService.getAdminDirectory).toHaveBeenCalledWith({
      query: "DEFI",
      limit: 100,
      offset: 0,
    });
  });

  it("keeps the response contract when the directory query fails", async () => {
    const { controller, projectsService } = buildController();
    projectsService.getAdminDirectory.mockRejectedValue(new Error("db down"));

    await expect(
      controller.getProjectDirectory(undefined, undefined, undefined),
    ).resolves.toEqual({
      success: false,
      message: "Error retrieving the project directory!",
      data: [],
      total: 0,
    });
  });
});
