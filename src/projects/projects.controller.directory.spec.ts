import { ConfigService } from "@nestjs/config";
import { ProjectsController } from "./projects.controller";

describe("ProjectsController admin directory", () => {
  const buildController = (): {
    controller: ProjectsController;
    projectsService: {
      getAdminDirectory: jest.Mock;
      getProjectsForAdminGrid: jest.Mock;
    };
  } => {
    const projectsService = {
      getAdminDirectory: jest.fn(),
      getProjectsForAdminGrid: jest.fn(),
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

  it("normalizes server-side project grid paging and filters", async () => {
    const { controller, projectsService } = buildController();
    projectsService.getProjectsForAdminGrid.mockResolvedValue({
      data: [{ id: "project-1", name: "Acme" }],
      total: 1,
    });

    await expect(
      controller.getProjectsForAdminGrid(
        "5000",
        "-1",
        "  DEFI  ",
        "true",
        "false",
      ),
    ).resolves.toEqual({
      success: true,
      message: "Retrieved the project grid successfully",
      data: [{ id: "project-1", name: "Acme" }],
      total: 1,
    });
    expect(projectsService.getProjectsForAdminGrid).toHaveBeenCalledWith({
      limit: 500,
      offset: 0,
      query: "DEFI",
      reviewOnly: true,
      bannedOnly: false,
    });
  });
});
