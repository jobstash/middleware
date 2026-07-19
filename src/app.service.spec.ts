import { ConfigService } from "@nestjs/config";
import { JobsService } from "./jobs/jobs.service";
import { MailService } from "./mail/mail.service";
import { OrganizationsService } from "./organizations/organizations.service";
import { ProjectsService } from "./projects/projects.service";
import { AppService } from "./app.service";

describe("AppService", () => {
  const jobsService = {
    getFrontendSitemapJobs: jest.fn(),
  };
  const projectsService = { getEvSitemapProjects: jest.fn() };
  const organizationsService = { getEvSitemapOrganizations: jest.fn() };
  const mailService = { sendEmail: jest.fn() };
  const configService = {
    get: jest.fn((key: string) =>
      key === "FE_DOMAIN" ? "https://jobs.example" : "https://ev.example",
    ),
  };
  const service = new AppService(
    jobsService as unknown as JobsService,
    configService as unknown as ConfigService,
    projectsService as unknown as ProjectsService,
    organizationsService as unknown as OrganizationsService,
    mailService as unknown as MailService,
  );

  beforeEach(() => jest.clearAllMocks());

  it("reports health without dependencies", () => {
    expect(service.healthCheck()).toEqual({
      success: true,
      message: "Server is healthy and up!",
    });
  });

  it("builds the frontend sitemap from every minimal PostgreSQL job row", async () => {
    jobsService.getFrontendSitemapJobs.mockResolvedValue([
      {
        shortUUID: "job-one",
        title: "Protocol Engineer",
        organizationName: "Acme",
        hasProjects: true,
      },
      {
        shortUUID: "job-two",
        title: "Product Lead",
        organizationName: "Beta",
        hasProjects: false,
      },
    ]);

    const sitemap = await service.sitemap();

    expect(jobsService.getFrontendSitemapJobs).toHaveBeenCalledTimes(1);
    expect(sitemap).toContain(
      "https://jobs.example/jobs/acme-protocol-engineer-job-one/details",
    );
    expect(sitemap).toContain(
      "https://jobs.example/jobs/acme-protocol-engineer-job-one/projects",
    );
    expect(sitemap).toContain(
      "https://jobs.example/jobs/beta-product-lead-job-two/details",
    );
    expect(sitemap).not.toContain(
      "https://jobs.example/jobs/beta-product-lead-job-two/projects",
    );
  });

  it("builds the EV sitemap from complete organization and project facets", async () => {
    organizationsService.getEvSitemapOrganizations.mockResolvedValue([
      {
        normalizedName: "acme",
        lastFundingAmount: 1_000,
        projectCount: 1,
      },
      {
        normalizedName: "beta",
        lastFundingAmount: 0,
        projectCount: 0,
      },
    ]);
    projectsService.getEvSitemapProjects.mockResolvedValue([
      { normalizedName: "alpha", orgIds: ["org-acme"] },
      { normalizedName: "standalone", orgIds: [] },
    ]);
    const sitemap = await service.evSitemap();

    expect(
      organizationsService.getEvSitemapOrganizations,
    ).toHaveBeenCalledTimes(1);
    expect(projectsService.getEvSitemapProjects).toHaveBeenCalledTimes(1);
    expect(sitemap).toContain(
      "https://ev.example/organizations/info/acme/investments",
    );
    expect(sitemap).toContain(
      "https://ev.example/organizations/info/acme/projects",
    );
    expect(sitemap).not.toContain(
      "https://ev.example/organizations/info/beta/investments",
    );
    expect(sitemap).toContain(
      "https://ev.example/organizations/info/alpha/organizations",
    );
    expect(sitemap).not.toContain("https://ev.example/grants");
    expect(sitemap).not.toContain("https://ev.example/impact");
  });
});
