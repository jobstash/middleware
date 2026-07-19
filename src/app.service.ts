import { Injectable } from "@nestjs/common";
import { ResponseWithNoData } from "src/shared/types";
import { ConfigService } from "@nestjs/config";
import { JobsService } from "./jobs/jobs.service";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "./shared/utils/custom-logger";
import { emailBuilder, raw, slugify, text } from "./shared/helpers";
import { OrganizationsService } from "./organizations/organizations.service";
import { ProjectsService } from "./projects/projects.service";
import { MailService } from "./mail/mail.service";

@Injectable()
export class AppService {
  private readonly logger = new CustomLogger(AppService.name);
  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly organizationsService: OrganizationsService,
    private readonly mailService: MailService,
  ) {}
  healthCheck(): ResponseWithNoData {
    return { success: true, message: "Server is healthy and up!" };
  }

  async addToWaitlist(
    email: string,
    company: string,
    role: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.mailService.sendEmail(
        emailBuilder({
          from: this.configService.getOrThrow<string>("EMAIL"),
          to: this.configService.getOrThrow<string>("ADMIN_EMAIL"),
          subject: `New Organization Interested in Ecosystem.Vision - ${company}`,
          title: "Hi team,",
          bodySections: [
            text(
              "A new organization has expressed interest in the Ecosystem.Vision platform. Below are the details:",
            ),
            raw(`
              <ul>
                <li>Organization Name: ${company}</li>
                <li>Role at Organization: ${role}</li>
                <li>Email: ${email}</li>
              </ul>
            `),
            text(
              "Please review and follow up accordingly. If a demo or further communication is required, make sure to coordinate with the organization promptly.",
            ),
            text("Let me know if you need any additional information."),
          ],
          footer: `Stay Frosty,<br/>Bill Harder`,
        }),
      );
      return {
        success: true,
        message: "Email sent successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "send-email",
          source: "app.service",
        });
        Sentry.captureException(err);
      });
      return {
        success: false,
        message: "Error sending email",
      };
    }
  }

  async sitemap(): Promise<string | undefined> {
    const FE_DOMAIN = this.configService.get<string>("FE_DOMAIN");
    const recentTimestamp = new Date().getTime();
    try {
      const jobs = await this.jobsService.getFrontendSitemapJobs();
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
                `${job.organizationName} ${job.title} ${job.shortUUID}`,
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
              job.hasProjects
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

    const organizations =
      await this.organizationsService.getEvSitemapOrganizations();

    const projects = await this.projectsService.getEvSitemapProjects();

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
          ${organizations
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
          ${projects
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
        </urlset>
    `;
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(`AppService::evSitemap ${err.message}`);
      return undefined;
    }
  }
}
