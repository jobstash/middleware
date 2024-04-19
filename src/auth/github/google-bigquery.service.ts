import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BigQuery } from "@google-cloud/bigquery";
import {
  ApplicantEnrichmentData,
  RepositoryWorkHistory,
} from "src/shared/interfaces";
import { groupBy, repoWorkHistoryAggregator } from "src/shared/helpers";

@Injectable()
export class GoogleBigQueryService {
  private readonly logger = new Logger(GoogleBigQueryService.name);
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

  async getApplicantEnrichmentData(
    applicants: string[],
  ): Promise<ApplicantEnrichmentData[]> {
    const sql = `
      SELECT
        e.actor_login,
        e.org_login,
        o.name AS org_name,
        e.repo_name,
        e.type,
        JSON_VALUE(e.payload, '$.action') AS action,
        JSON_VALUE(e.payload, '$.pull_request.merged') AS merged,
        SUM(
          CASE
            WHEN e.type = 'PushEvent' THEN CAST(JSON_VALUE(e.payload, '$.distinct_size') AS INT64)
            WHEN e.type = 'PullRequestEvent' THEN CAST(JSON_VALUE(e.payload, '$.pull_request.commits') AS INT64)
          ELSE
          NULL
        END
          ) AS commits_count,
        COUNT(*) AS count,
        MIN(e.created_at) AS first,
        MAX(e.created_at) AS last
      FROM
        \`dbt.ecosystem_events\` e
      JOIN
        \`github_gql_us.organizations\` o
      ON
        e.org_login = o.login
      WHERE
        e.actor_login IN UNNEST(@logins)
        AND e.org_login IS NOT NULL
      GROUP BY
        e.actor_login,
        e.org_login,
        o.name,
        e.repo_name,
        e.type,
        action,
        merged
      ORDER BY
        e.actor_login,
        e.org_login,
        e.repo_name,
        e.type,
        action
    `;
    const [rows] = await this.bigquery.query({
      query: sql,
      location: "US",
      params: { logins: applicants },
      types: {
        logins: ["STRING"],
      },
    });

    return applicants.map(applicant => {
      type WorkDataInstance = RepositoryWorkHistory["data"][0];

      const applicantData = rows.filter(
        (row: WorkDataInstance) => row.actor_login === applicant,
      ) as WorkDataInstance[];

      type TempRepoType = {
        name: string;
        org_login: string;
        org_name: string;
        data: WorkDataInstance[];
      };

      const repositories: TempRepoType[] = Array.from(
        new Set(applicantData.map(x => x.repo_name)),
      ).map(repo_name => ({
        name: repo_name,
        org_login: applicantData.find(data => data.repo_name === repo_name)
          ?.org_login,
        org_name: applicantData.find(data => data.repo_name === repo_name)
          ?.org_name,
        data: applicantData.filter(data => data.repo_name === repo_name),
      })) as TempRepoType[];

      const organizationGroups = groupBy<TempRepoType, "org_login">(
        repositories,
        "org_login",
      );

      const result: ApplicantEnrichmentData = {
        login: applicant,
        organizations: Object.keys(organizationGroups).map(group => {
          return {
            login: group,
            name: organizationGroups[group][0].org_name,
            repositories: organizationGroups[group].map(repo =>
              repoWorkHistoryAggregator(repo),
            ),
          };
        }),
      };

      return result;
    });
  }
}
