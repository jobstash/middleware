import { Injectable } from "@nestjs/common";
import { ResponseWithNoData } from "src/shared/types";
import { Integer } from "neo4j-driver";
import { ConfigService } from "@nestjs/config";
import { JobsService } from "./jobs/jobs.service";

@Injectable()
export class AppService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {}
  healthCheck(): ResponseWithNoData {
    return { success: true, message: "Server is healthy and up!" };
  }

  async sitemap(): Promise<string> {
    const FE_DOMAIN = this.configService.get<string>("FE_DOMAIN");
    const recentTimestamp = new Date().getTime();
    const jobs = (
      await this.jobsService.getJobsListWithSearch({
        page: 1,
        tags: null,
        query: null,
        hacks: null,
        order: null,
        token: null,
        audits: null,
        chains: null,
        maxTvl: null,
        minTvl: null,
        mainNet: null,
        orderBy: null,
        projects: null,
        locations: null,
        seniority: null,
        investors: null,
        commitments: null,
        communities: null,
        maxHeadCount: null,
        minHeadCount: null,
        fundingRounds: null,
        maxMonthlyFees: null,
        minMonthlyFees: null,
        maxSalaryRange: null,
        minSalaryRange: null,
        publicationDate: null,
        classifications: null,
        maxMonthlyVolume: null,
        minMonthlyVolume: null,
        maxMonthlyRevenue: null,
        minMonthlyRevenue: null,
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
      })
    ).data;
    return `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${FE_DOMAIN}/jobs</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          <url>
            <loc>${FE_DOMAIN}/elite-fast-track</loc>
            <lastmod>${recentTimestamp}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
          </url>
          ${jobs
            .map(job => {
              const otherJobs = jobs.filter(
                x =>
                  x.organization.orgId === job.organization.orgId &&
                  x.shortUUID !== job.shortUUID,
              );
              const path =
                job.access === "protected" ? "elite-fast-track" : "jobs";
              return `<url>
              <loc>${FE_DOMAIN}/${path}/${job.shortUUID}/details</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            ${
              otherJobs.length > 0
                ? `<url>
                      <loc>${FE_DOMAIN}/${path}/${job.shortUUID}/other-jobs</loc>
                      <lastmod>${recentTimestamp}</lastmod>
                      <changefreq>daily</changefreq>
                      <priority>1.0</priority>
                    </url>`
                : ""
            }
            <url>
              <loc>${FE_DOMAIN}/${path}/${job.shortUUID}/organization</loc>
              <lastmod>${recentTimestamp}</lastmod>
              <changefreq>daily</changefreq>
              <priority>1.0</priority>
            </url>
            ${
              job.organization.projects.length > 0
                ? `<url>
                      <loc>${FE_DOMAIN}/${path}/${job.shortUUID}/projects</loc>
                      <lastmod>${recentTimestamp}</lastmod>
                      <changefreq>daily</changefreq>
                      <priority>1.0</priority>
                    </url>
                    <url>
                      <loc>${FE_DOMAIN}/${path}/${job.shortUUID}/competitors</loc>
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
  }
}
