import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BigQuery } from "@google-cloud/bigquery";
import {
  ApplicantEnrichmentData,
  UserWorkHistory,
} from "src/shared/interfaces";

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
      WITH user_ids AS (
        SELECT id, login
        FROM github_gql.users
        WHERE login IN UNNEST(@logins)
      ),
          
      repo_contributions AS (
        SELECT
          u.id AS user_id,
          u.login AS user_login,
          c.repository_id,
          r.organization_id,
          o.login AS organization_login,
          o.name AS organization_name,
          r.name AS repository_name,
          COUNT(DISTINCT CASE WHEN c.author_id = u.id THEN c.id END) AS authored_commits,
          MIN(CASE WHEN c.author_id = u.id THEN c.authored_date END) AS first_authored_commit_date,
          MAX(CASE WHEN c.author_id = u.id THEN c.authored_date END) AS last_authored_commit_date,
          COUNT(DISTINCT CASE WHEN c.committer_id = u.id THEN c.id END) AS committed_commits,
          MIN(CASE WHEN c.committer_id = u.id THEN c.committer_date END) AS first_committed_commit_date,
          MAX(CASE WHEN c.committer_id = u.id THEN c.committer_date END) AS last_committed_commit_date,
          COUNT(DISTINCT CASE WHEN i.author_id = u.id THEN i.id END) AS authored_issues_count,
          MIN(CASE WHEN i.author_id = u.id THEN i.created_at END) AS first_authored_issue_date,
          MAX(CASE WHEN i.author_id = u.id THEN i.created_at END) AS last_authored_issue_date,
          COUNT(DISTINCT CASE WHEN pr.author_id = u.id THEN pr.id END) AS authored_pr_count,
          MIN(CASE WHEN pr.author_id = u.id THEN pr.created_at END) AS first_authored_pr_date,
          MAX(CASE WHEN pr.author_id = u.id THEN pr.created_at END) AS last_authored_pr_date,
          COUNT(DISTINCT CASE WHEN pr.merger_id = u.id THEN pr.id END) AS merged_pr_count,
          MIN(CASE WHEN pr.merger_id = u.id THEN pr.merged_at END) AS first_merged_pr_date,
          MAX(CASE WHEN pr.merger_id = u.id THEN pr.merged_at END) AS last_merged_pr_date
        FROM github_gql.commits c
        JOIN user_ids u ON c.author_id = u.id OR c.committer_id = u.id
        LEFT JOIN github_gql.issues i ON i.repository_id = c.repository_id AND i.author_id = u.id
        LEFT JOIN github_gql.pull_requests pr ON pr.repository_id = c.repository_id AND (pr.author_id = u.id OR pr.merger_id = u.id)
        JOIN github_gql.repositories r ON c.repository_id = r.id
        JOIN github_gql.organizations o ON r.organization_id = o.id
        GROUP BY u.id, u.login, c.repository_id, r.organization_id, o.login, o.name, r.name
      ),
      
      org_aggregates AS (
        SELECT
          rc.user_id,
          rc.user_login,
          rc.organization_id,
          rc.organization_login,
          rc.organization_name,
          ARRAY_AGG(
            STRUCT(
              rc.repository_id AS id,
              rc.repository_name AS name,
              STRUCT(
                STRUCT(
                  rc.authored_commits AS count,
                  CAST(rc.first_authored_commit_date AS STRING) AS first,
                  CAST(rc.last_authored_commit_date AS STRING) AS last
                ) AS authored,
                STRUCT(
                  rc.committed_commits AS count,
                  CAST(rc.first_committed_commit_date AS STRING) AS first,
                  CAST(rc.last_committed_commit_date AS STRING) AS last
                ) AS committed
              ) AS commits,
              STRUCT(
                STRUCT(
                  rc.authored_issues_count AS count,
                  CAST(rc.first_authored_issue_date AS STRING) AS first,
                  CAST(rc.last_authored_issue_date AS STRING) AS last
                ) AS authored
              ) AS issues,
              STRUCT(
                STRUCT(
                  rc.authored_pr_count AS count,
                  CAST(rc.first_authored_pr_date AS STRING) AS first,
                  CAST(rc.last_authored_pr_date AS STRING) AS last
                ) AS authored,
                STRUCT(
                  rc.merged_pr_count AS count,
                  CAST(rc.first_merged_pr_date AS STRING) AS first,
                  CAST(rc.last_merged_pr_date AS STRING) AS last
                ) AS merged
              ) AS pull_requests
            )
          ) AS repositories
        FROM repo_contributions rc
        GROUP BY rc.user_id, rc.user_login, rc.organization_id, rc.organization_login, rc.organization_name
      ),
                
      user_aggregates AS (
        SELECT
          oa.user_id AS id,
          oa.user_login AS login,
          ARRAY_AGG(
            STRUCT(
              oa.organization_id AS id,
              oa.organization_login AS login,
              oa.organization_name AS name,
              oa.repositories
            )
          ) AS organizations
        FROM org_aggregates oa
        GROUP BY oa.user_id, oa.user_login
      )
            
      SELECT 
        ua.*
      FROM user_aggregates ua;
    `;
    const [rows] = await this.bigquery.query({
      query: sql,
      location: "EU",
      params: { logins: applicants },
      types: {
        logins: ["STRING"],
      },
    });
    return rows.map((row: UserWorkHistory) => ({
      login: row.login,
      cryptoNative: row.organizations.some(org =>
        org.repositories.some(
          repo =>
            repo.commits.committed.count > 0 &&
            repo.pull_requests.merged.count > 0,
        ),
      ),
      organizations: row.organizations.map(org => {
        const repositories = org.repositories.map(repo => ({
          name: repo.name,
          firstContributedAt: [
            repo.commits.authored.first,
            repo.commits.committed.first,
            repo.issues.authored.first,
            repo.pull_requests.authored.first,
            repo.pull_requests.merged.first,
          ]
            .filter(Boolean)
            .sort()[0],
          lastContributedAt: [
            repo.commits.authored.last,
            repo.commits.committed.last,
            repo.issues.authored.last,
            repo.pull_requests.authored.last,
            repo.pull_requests.merged.last,
          ]
            .filter(Boolean)
            .sort()
            .reverse()[0],
          commitsCount: repo.commits.committed.count,
        }));

        return {
          login: org.login,
          name: org.name,
          firstContributedAt: repositories
            .map(repo => repo.firstContributedAt)
            .filter(Boolean)
            .sort()[0],
          lastContributedAt: repositories
            .map(repo => repo.lastContributedAt)
            .filter(Boolean)
            .sort()
            .reverse()[0],
          repositories,
        };
      }),
    }));
  }
}
