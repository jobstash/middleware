import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { sort } from "fast-sort";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import { JobListResultEntity } from "src/shared/entities";
import { intConverter } from "src/shared/helpers";
import { JobListResult, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class PublicService {
  private readonly logger = new CustomLogger(PublicService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  getAllJobsListResults = async (): Promise<JobListResult[]> => {
    const results: JobListResult[] = [];
    const generatedQuery = `
      MATCH (organization: Organization)

      MATCH (organization)-[:HAS_JOBSITE]->(jobsite:Jobsite)-[:HAS_JOBPOST]->(raw_jobpost:Jobpost)-[:IS_CATEGORIZED_AS]-(:JobpostCategory)
      MATCH (raw_jobpost)-[:HAS_STATUS]->(:JobpostStatus {status: "active"})
      MATCH (raw_jobpost)-[:HAS_STRUCTURED_JOBPOST]->(structured_jobpost:StructuredJobpost)
                
      OPTIONAL MATCH (structured_jobpost)-[:HAS_TAG]->(tag:Tag)
      WHERE NOT (tag)<-[:IS_BLOCKED_TERM]-()
      
      OPTIONAL MATCH (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound)
      OPTIONAL MATCH (funding_round)-[:HAS_INVESTOR]->(investor:Investor)
      
      WITH structured_jobpost, organization, 
      COLLECT(DISTINCT PROPERTIES(investor)) AS investors,
      COLLECT(DISTINCT PROPERTIES(funding_round)) AS funding_rounds, 
      COLLECT(DISTINCT PROPERTIES(tag)) AS tags

      WITH {
          id: structured_jobpost.id,
          jobTitle: structured_jobpost.jobTitle,
          role: structured_jobpost.role,
          jobLocation: structured_jobpost.jobLocation,
          jobApplyPageUrl: structured_jobpost.jobApplyPageUrl,
          jobPageUrl: structured_jobpost.jobPageUrl,
          shortUUID: structured_jobpost.shortUUID,
          seniority: structured_jobpost.seniority,
          jobCreatedTimestamp: structured_jobpost.jobCreatedTimestamp,
          jobFoundTimestamp: structured_jobpost.jobFoundTimestamp,
          minSalaryRange: structured_jobpost.minSalaryRange,
          maxSalaryRange: structured_jobpost.maxSalaryRange,
          medianSalary: structured_jobpost.medianSalary,
          salaryCurrency: structured_jobpost.salaryCurrency,
          aiDetectedTechnologies: structured_jobpost.aiDetectedTechnologies,
          extractedTimestamp: structured_jobpost.extractedTimestamp,
          team: structured_jobpost.team,
          benefits: structured_jobpost.benefits,
          culture: structured_jobpost.culture,
          paysInCrypto: structured_jobpost.paysInCrypto,
          offersTokenAllocation: structured_jobpost.offersTokenAllocation,
          jobCommitment: structured_jobpost.jobCommitment,
          organization: {
              id: organization.id,
              orgId: organization.orgId,
              name: organization.name,
              description: organization.description,
              summary: organization.summary,
              location: organization.location,
              url: organization.url,
              logo: organization.logo,
              headcountEstimate: organization.headcountEstimate,
              twitter: organization.twitter,
              discord: organization.discord,
              github: organization.github,
              telegram: organization.telegram,
              docs: organization.docs,
              jobsiteLink: organization.jobsiteLink,
              createdTimestamp: organization.createdTimestamp,
              updatedTimestamp: organization.updatedTimestamp,
              teamSize: organization.teamSize,
              fundingRounds: [funding_round in funding_rounds WHERE funding_round.id IS NOT NULL],
              investors: [investor in investors WHERE investor.id IS NOT NULL]
          },
          tags: [tag in tags WHERE tag.id IS NOT NULL]
      } AS result

      RETURN COLLECT(result) as results
    `;

    try {
      const projects = await this.models.Projects.getProjectsMoreInfoData();
      const resultSet = (
        await this.neogma.queryRunner.run(generatedQuery)
      ).records[0]?.get("results") as JobListResult[];
      for (const result of resultSet) {
        const projectList = projects.filter(
          x => x.orgId === result.organization.orgId,
        );
        const updatedResult: JobListResult = {
          ...result,
          organization: {
            ...result.organization,
            projects: projectList,
          },
        };
        results.push(new JobListResultEntity(updatedResult).getProperties());
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsListResults ${err.message}`);
    }

    return results;
  };

  async getAllJobsList(params: {
    page: number;
    limit: number;
  }): Promise<PaginatedData<JobListResult>> {
    const paramsPassed = {
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const { page, limit } = paramsPassed;

    const results: JobListResult[] = [];

    try {
      const orgJobs = await this.getAllJobsListResults();
      results.push(...orgJobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(
        `PublicService::getAllJobsListWithSearch ${err.message}`,
      );
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const final = sort<JobListResult>(results).desc(
      job => job.lastSeenTimestamp,
    );

    return {
      page: (final.length > 0 ? params.page ?? 1 : -1) ?? -1,
      count: limit > final.length ? final.length : limit,
      total: final.length ? intConverter(final.length) : 0,
      data: final
        .slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        )
        .map(x => new JobListResultEntity(x).getProperties()),
    };
  }
}
