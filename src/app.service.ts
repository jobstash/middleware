import { Injectable } from "@nestjs/common";
import { ResponseWithNoData } from "src/shared/types";
import { Integer } from "neo4j-driver";
import { ConfigService } from "@nestjs/config";
import { JobsService } from "./jobs/jobs.service";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "./shared/utils/custom-logger";
import { JobListParams } from "./jobs/dto/job-list.input";
import { slugify } from "./shared/helpers";

@Injectable()
export class AppService {
  private readonly logger = new CustomLogger(AppService.name);
  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
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
}
