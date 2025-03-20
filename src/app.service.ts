import { Injectable } from "@nestjs/common";
import { ResponseWithNoData } from "src/shared/types";
import { Integer } from "neo4j-driver";
import { ConfigService } from "@nestjs/config";
import { JobsService } from "./jobs/jobs.service";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "./shared/utils/custom-logger";
import { JobListParams } from "./jobs/dto/job-list.input";
import { slugify } from "./shared/helpers";
import { OrganizationsService } from "./organizations/organizations.service";
import { GrantsService } from "./grants/grants.service";
import { ProjectsService } from "./projects/projects.service";
import { OrgListParams } from "./organizations/dto/org-list.input";
import { ProjectListParams } from "./projects/dto/project-list.input";

@Injectable()
export class AppService {
  private readonly logger = new CustomLogger(AppService.name);
  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly grantsService: GrantsService,
    private readonly projectsService: ProjectsService,
    private readonly organizationsService: OrganizationsService,
  ) {}
  healthCheck(): ResponseWithNoData {
    return { success: true, message: "Server is healthy and up!" };
  }

  async sitemap(): Promise<string | undefined> {
    const FE_DOMAIN = this.configService.get<string>("FE_DOMAIN");
    const recentTimestamp = new Date().getTime();
    try {
      const result = await this.jobsService.getJobsListWithSearch({
        ...new JobListParams(),
        page: 1,
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
      });
      const jobs = result.data;
      return `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${FE_DOMAIN}</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          <url>
            <loc>${FE_DOMAIN}/jobs</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          ${jobs
            .map(job => {
              const path = "jobs";
              const slug = slugify(
                `${job.organization.name} ${job.title} ${job.shortUUID}`,
              );
              return `<url>
              <loc>${FE_DOMAIN}/${path}/${slug}/details</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            <url>
              <loc>${FE_DOMAIN}/${path}/${slug}/organization</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            ${
              job.organization.projects.length > 0
                ? `<url>
                      <loc>${FE_DOMAIN}/${path}/${slug}/projects</loc>
                      <lastmod>${recentTimestamp}</lastmod>
                      <changefreq>daily</changefreq>
                      <priority>1.0</priority>
                    </url>
                    <url>
                      <loc>${FE_DOMAIN}/${path}/${slug}/competitors</loc>
                      <lastmod>${recentTimestamp}</lastmod>
                      <changefreq>daily</changefreq>
                      <priority>1.0</priority>
                    </url>`
                : ""
            }`;
            })
            .join("")}
        </urlset>
    `;
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(`AppService::sitemap ${err.message}`);
      return undefined;
    }
  }

  async evSitemap(): Promise<string | undefined> {
    const EV_DOMAIN = this.configService.get<string>("EV_DOMAIN");
    const recentTimestamp = new Date().getTime();

    const organizations = await this.organizationsService.getOrgsListWithSearch(
      {
        ...new OrgListParams(),
        page: 1,
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
      },
    );

    const projects = await this.projectsService.getProjectsListWithSearch({
      ...new ProjectListParams(),
      page: 1,
      limit: Integer.MAX_SAFE_VALUE.toNumber(),
    });

    const grants = await this.grantsService.getGrantsList(
      1,
      Integer.MAX_SAFE_VALUE.toNumber(),
      "active",
    );

    const impact = await this.grantsService.getGrantsList(
      1,
      Integer.MAX_SAFE_VALUE.toNumber(),
      "inactive",
    );

    try {
      return `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${EV_DOMAIN}</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          <url>
            <loc>${EV_DOMAIN}/organizations</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          ${organizations.data
            .map(org => {
              return `<url>
              <loc>${EV_DOMAIN}/organizations/info/${org.normalizedName}</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            <url>
              <loc>${EV_DOMAIN}/organizations/info/${org.normalizedName}/jobs</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            ${
              org.lastFundingAmount > 0
                ? `<url>
              <loc>${EV_DOMAIN}/organizations/info/${org.normalizedName}/investments</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>`
                : ""
            }
                ${
                  org.projectCount > 0
                    ? `<url>
              <loc>${EV_DOMAIN}/organizations/info/${org.normalizedName}/projects</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>`
                    : ""
                }`;
            })
            .join("")}
          <url>
            <loc>${EV_DOMAIN}/projects</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          ${projects.data
            .map(project => {
              return `<url>
              <loc>${EV_DOMAIN}/organizations/info/${project.normalizedName}</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            <url>
              <loc>${EV_DOMAIN}/organizations/info/${project.normalizedName}/grants</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            ${
              project.orgIds.length > 0
                ? `<url>
              <loc>${EV_DOMAIN}/organizations/info/${project.normalizedName}/organizations</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>`
                : ""
            }`;
            })
            .join("")}
          <url>
            <loc>${EV_DOMAIN}/grants</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          ${grants.data
            .map(grant => {
              return `<url>
              <loc>${EV_DOMAIN}/grants/info/${grant.slug}</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            `;
            })
            .join("")}
          <url>
            <loc>${EV_DOMAIN}/impact</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          ${impact.data
            .map(project => {
              return `<url>
              <loc>${EV_DOMAIN}/grants/info/${project.slug}</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            `;
            })
            .join("")}
        </urlset>
    `;
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(`AppService::evSitemap ${err.message}`);
      return undefined;
    }
  }
}
