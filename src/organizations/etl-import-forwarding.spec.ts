import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { Auth0Service } from "src/auth0/auth0.service";
import { OrganizationsService } from "./organizations.service";
import { ProjectsService } from "src/projects/projects.service";

describe("ETL import forwarding", () => {
  const config = {
    get: jest.fn().mockReturnValue("https://etl.example"),
  } as unknown as ConfigService;
  const auth0 = {
    getETLToken: jest.fn().mockResolvedValue("etl-token"),
  } as unknown as Auth0Service;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("queues an organization through the ETL POST endpoint", async () => {
    const post = jest.spyOn(axios, "post").mockResolvedValue({ status: 202 });
    const service = new OrganizationsService(
      config,
      auth0,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await expect(
      service.addOrganizationByUrl({ name: "Tier", url: "tier.xyz" }),
    ).resolves.toEqual({
      success: true,
      message: "Organization queued for import successfully",
    });
    expect(post).toHaveBeenCalledWith(
      "https://etl.example/organization-importer/import-organization-by-url",
      undefined,
      {
        headers: { Authorization: "Bearer etl-token" },
        params: { name: "Tier", url: "tier.xyz" },
      },
    );
  });

  it("queues a project through the ETL POST endpoint", async () => {
    const post = jest.spyOn(axios, "post").mockResolvedValue({ status: 202 });
    const service = new ProjectsService(config, auth0, undefined, undefined);

    await expect(
      service.addProjectByUrl({
        name: "Example Protocol",
        url: "example.fi",
        orgId: "org-1",
        defiLlamaSlug: "example",
      }),
    ).resolves.toEqual({
      success: true,
      message: "Project queued for import successfully",
    });
    expect(post).toHaveBeenCalledWith(
      "https://etl.example/project-importer/import-project-by-url",
      undefined,
      {
        headers: { Authorization: "Bearer etl-token" },
        params: {
          name: "Example Protocol",
          url: "example.fi",
          orgId: "org-1",
          defiLlamaSlug: "example",
        },
      },
    );
  });
});
