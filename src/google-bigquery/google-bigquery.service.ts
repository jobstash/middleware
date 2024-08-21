import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BigQuery } from "@google-cloud/bigquery";
import {
  RawGrantProjectCodeMetrics,
  RawGrantProjectOnchainMetrics,
} from "src/shared/interfaces";

@Injectable()
export class GoogleBigQueryService {
  private readonly GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  private readonly GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  private readonly bigquery: BigQuery;

  constructor(private readonly configService: ConfigService) {
    this.GOOGLE_SERVICE_ACCOUNT_EMAIL = this.configService.getOrThrow<string>(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    );
    this.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY =
      this.configService.getOrThrow<string>(
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
      );
    this.bigquery = new BigQuery({
      projectId: "jobstash",
      credentials: {
        client_email: this.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: this.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.split(
          String.raw`\n`,
        ).join("\n"),
      },
    });
  }

  async getGrantProjectsCodeMetrics(
    projects: string[],
  ): Promise<RawGrantProjectCodeMetrics[]> {
    const query = `
      WITH projects AS (
        SELECT DISTINCT project_id
        FROM jobstash.oso_production.projects_v1
        WHERE LOWER(project_name) IN UNNEST(@projects)
      )

      SELECT *
      FROM jobstash.oso_production.code_metrics_by_project_v1
      WHERE project_id IN (
        SELECT project_id FROM projects
      )
    `;

    const [rows] = await this.bigquery.query({
      query,
      location: "US",
      params: { projects },
      types: {
        logins: ["STRING"],
      },
    });

    return rows;
  }

  async getGrantProjectsOnchainMetrics(
    projects: string[],
  ): Promise<RawGrantProjectOnchainMetrics[]> {
    const query = `
      WITH projects AS (
        SELECT DISTINCT project_id
        FROM jobstash.oso_production.projects_v1
        WHERE LOWER(project_name) IN UNNEST(@projects)
      )

      SELECT *
      FROM jobstash.oso_production.onchain_metrics_by_project_v1
      WHERE project_id IN (
        SELECT project_id FROM projects
      )
    `;

    const [rows] = await this.bigquery.query({
      query,
      location: "US",
      params: { projects },
      types: {
        logins: ["STRING"],
      },
    });

    return rows;
  }
}
