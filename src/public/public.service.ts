import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import {
  JobFilterConfigsEntity,
  JobListResultEntity,
} from "src/shared/entities";
import { publicationDateRangeGenerator } from "src/shared/helpers";
import {
  JobFilterConfigs,
  JobListResult,
  PaginatedData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { JobListParams } from "src/jobs/dto/job-list.input";
import { DateRange } from "src/shared/enums";
import { TagsService } from "src/tags/tags.service";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";

export const shapeLegacyPublicJobPayload = (
  payload: JobListResult,
): JobListResult => ({
  ...payload,
  organization: payload.organization
    ? {
        ...payload.organization,
        hasUser: false,
        atsClient: null,
        projects: payload.organization.projects.map(project => ({
          ...project,
          jobs: [],
          repos: [],
          grants: [],
          investors: [],
          fundingRounds: [],
        })),
      }
    : null,
});

@Injectable()
export class PublicService {
  private readonly logger = new CustomLogger(PublicService.name);
  constructor(
    private readonly tagsService: TagsService,
    private readonly searchDocuments: SearchDocumentRepository,
  ) {}

  getAllJobsListResults = async (
    authenticated: boolean,
  ): Promise<JobListResult[]> => {
    const payloads =
      await this.searchDocuments.getPublicJobPayloads(authenticated);
    return payloads.map(payload => {
      const { publishedTimestampIsVerified, ...job } =
        payload as JobListResult & {
          publishedTimestampIsVerified?: boolean;
        };
      return Object.assign(
        new JobListResultEntity(
          shapeLegacyPublicJobPayload(job),
        ).getProperties(),
        {
          publishedTimestampIsVerified: publishedTimestampIsVerified ?? false,
        },
      );
    });
  };

  async getAllJobsList(
    params: JobListParams,
    authenticated: boolean,
  ): Promise<PaginatedData<JobListResult>> {
    try {
      const range = publicationDateRangeGenerator(
        params.publicationDate as DateRange,
      );
      const page = await this.searchDocuments.searchJobs({
        ...range,
        ...params,
        publicAccessOnly: !authenticated,
        publishedBeforeOrAt: authenticated ? 1_746_057_600_000 : undefined,
        suppressPublicForExpertOrganizations: authenticated,
      });
      return {
        ...page,
        data: page.data.map(payload => {
          const { publishedTimestampIsVerified, ...job } =
            payload as JobListResult & {
              publishedTimestampIsVerified?: boolean;
            };
          return Object.assign(
            new JobListResultEntity(
              shapeLegacyPublicJobPayload(job),
            ).getProperties(),
            {
              publishedTimestampIsVerified:
                publishedTimestampIsVerified ?? false,
            },
          );
        }),
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("PublicService::getAllJobsList " + err.message);
      return { page: -1, count: 0, total: 0, data: [] };
    }
  }

  getAllJobsArchiveResults = async (): Promise<
    (JobListResult & {
      online: boolean;
      publishedTimestampIsVerified: boolean;
    })[]
  > => {
    const first = await this.searchDocuments.getArchiveJobPayloads(1, 100);
    const pages = Math.ceil(first.total / 100);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
        this.searchDocuments.getArchiveJobPayloads(index + 2, 100),
      ),
    );
    return [first, ...rest].flatMap(result =>
      result.data.map(payload => {
        const { online, publishedTimestampIsVerified, ...job } = payload;
        return {
          ...new JobListResultEntity(
            shapeLegacyPublicJobPayload(job),
          ).getProperties(),
          online,
          publishedTimestampIsVerified: publishedTimestampIsVerified ?? false,
        };
      }),
    );
  };

  async getAllJobsArchive(params: JobListParams): Promise<
    PaginatedData<
      JobListResult & {
        online: boolean;
        publishedTimestampIsVerified: boolean;
      }
    >
  > {
    try {
      const page = await this.searchDocuments.getArchiveJobPayloads(
        params.page,
        params.limit,
      );
      return {
        ...page,
        data: page.data.map(payload => {
          const { online, publishedTimestampIsVerified, ...job } = payload;
          return {
            ...new JobListResultEntity(
              shapeLegacyPublicJobPayload(job),
            ).getProperties(),
            online,
            publishedTimestampIsVerified: publishedTimestampIsVerified ?? false,
          };
        }),
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("PublicService::getAllJobsArchive " + err.message);
      return { page: -1, count: 0, total: 0, data: [] };
    }
  }

  async getAllJobsFilterConfigs(
    ecosystem: string | null = null,
  ): Promise<JobFilterConfigs> {
    try {
      const [values, popularTags] = await Promise.all([
        this.searchDocuments.getJobFilterValues(ecosystem ?? undefined),
        this.tagsService.getPopularTags(100),
      ]);
      return new JobFilterConfigsEntity({
        ...values,
        tags: popularTags.map(tag => tag.name),
      }).getProperties();
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "PublicService::getAllJobsFilterConfigs " + err.message,
      );
      return undefined;
    }
  }
}
