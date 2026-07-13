import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { addDays, differenceInHours } from "date-fns";
import { sort } from "fast-sort";
import { PrivyService } from "src/auth/privy/privy.service";
import { ProfileService } from "src/auth/profile/profile.service";
import { ScorerService } from "src/scorer/scorer.service";
import {
  AllJobListResultEntity,
  AllJobsFilterConfigsEntity,
  EcosystemJobListResultEntity,
  JobApplicantEntity,
  JobDetailsEntity,
  JobMatchCategory,
  JobMatchResult,
  JobpostFolderEntity,
} from "src/shared/entities";
import {
  intConverter,
  nonZeroOrNull,
  paginate,
  publicationDateRangeGenerator,
  slugify,
} from "src/shared/helpers";
import {
  AllJobsFilterConfigs,
  AllJobsListResult,
  data,
  DateRange,
  EcosystemJobListResult,
  JobApplicant,
  JobDetailsResult,
  JobFilterConfigs,
  JobFilterConfigsEntity,
  JobListResult,
  JobListResultEntity,
  JobpostFolder,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RpcService } from "src/user/rpc.service";
import { AllJobsParams } from "./dto/all-jobs.input";
import { BlockJobsInput } from "./dto/block-jobs.input";
import { ChangeJobClassificationInput } from "./dto/change-classification.input";
import { ChangeJobCommitmentInput } from "./dto/change-commitment.input";
import { ChangeJobLocationTypeInput } from "./dto/change-location-type.input";
import { CreateJobFolderInput } from "./dto/create-job-folder.input";
import { EditJobTagsInput } from "./dto/edit-tags.input";
import { FeatureJobsInput } from "./dto/feature-jobs.input";
import { JobListParams } from "./dto/job-list.input";
import { UpdateJobApplicantListInput } from "./dto/update-job-applicant-list.input";
import { UpdateJobFolderInput } from "./dto/update-job-folder.input";
import { UpdateJobMetadataInput } from "./dto/update-job-metadata.input";
import { ChangeJobProjectInput } from "./dto/update-job-project.input";
import { SimilarJob } from "./dto/similar-jobs.output";
import { PillarJob } from "./dto/suggested-jobs.output";
import {
  FrontendSitemapJob,
  SearchDocumentRepository,
} from "src/postgres/search-document.repository";
import {
  ApplicantList,
  JobGraphRepository,
} from "src/postgres/job-graph.repository";
import { TagsService } from "src/tags/tags.service";

@Injectable()
export class JobsService {
  private readonly logger = new CustomLogger(JobsService.name);
  constructor(
    private readonly rpcService: RpcService,
    private readonly scorerService: ScorerService,
    private readonly privyService: PrivyService,
    private readonly profileService: ProfileService,
    private readonly searchDocuments: SearchDocumentRepository,
    private readonly jobGraph: JobGraphRepository,
    private readonly tagsService: TagsService,
  ) {}

  getJobsListResults = async (
    ecosystem?: string | undefined,
  ): Promise<JobListResult[]> => {
    const payloads = await this.searchDocuments.getJobPayloads(ecosystem);
    return payloads.flatMap(payload => {
      try {
        return [new JobListResultEntity(payload).getProperties()];
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "entity-mapping",
            source: "jobs.service.postgres",
          });
          scope.setExtra("failed_result", {
            id: payload?.id,
            shortUUID: payload?.shortUUID,
          });
          Sentry.captureException(error);
        });
        return [];
      }
    });
  };

  getFrontendSitemapJobs(): Promise<FrontendSitemapJob[]> {
    return this.searchDocuments.getFrontendSitemapJobs();
  }

  getAllOrgJobsListResults = async (
    orgId: string,
  ): Promise<EcosystemJobListResult[]> => {
    const payloads =
      await this.searchDocuments.getOrganizationJobPayloads(orgId);
    return payloads.flatMap(payload => {
      try {
        return [
          new EcosystemJobListResultEntity(
            payload as EcosystemJobListResult,
          ).getProperties(),
        ];
      } catch (error) {
        Sentry.captureException(error);
        return [];
      }
    });
  };

  getAllJobsListResults = async (): Promise<AllJobsListResult[]> => {
    const payloads = await this.searchDocuments.getAllJobPayloads();
    return payloads.flatMap(payload => {
      try {
        return [
          new AllJobListResultEntity(
            payload as unknown as AllJobsListResult,
          ).getProperties(),
        ];
      } catch (error) {
        Sentry.captureException(error);
        return [];
      }
    });
  };

  async getJobsListWithSearch(
    params: JobListParams & { ecosystemHeader?: string },
  ): Promise<PaginatedData<JobListResult>> {
    const postgresPage = await this.searchDocuments.searchJobs({
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
      ...params,
    });
    return {
      ...postgresPage,
      data: postgresPage.data.map(payload =>
        new JobListResultEntity(payload).getProperties(),
      ),
    };
  }

  async getFilterConfigs(
    ecosystem: string | null = null,
  ): Promise<JobFilterConfigs> {
    const [values, popularTags] = await Promise.all([
      this.searchDocuments.getJobFilterValues(ecosystem ?? undefined),
      this.tagsService.getPopularTags(100),
    ]);
    return new JobFilterConfigsEntity({
      ...values,
      tags: popularTags.map(tag => tag.name),
    }).getProperties();
  }

  async getFeaturedJobs(
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    try {
      const jobs = await this.getJobsListResults(ecosystem);
      const now = new Date().getTime();
      const featured = ecosystem
        ? jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.featured === true &&
                job.featureStartDate <= now &&
                now <= job.featureEndDate,
            )
        : jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.featured === true &&
                job.featureStartDate <= now &&
                now <= job.featureEndDate,
            );
      const result = sort<JobListResult>(featured).by([
        { desc: (job): boolean => job.featured },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { asc: (job): number => job.featureStartDate },
      ]);
      return {
        success: true,
        message: "Featured jobs retrieved successfully",
        data: result,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getFeaturedJobs ${err.message}`);
      return { success: false, message: "Failed to retrieve featured jobs" };
    }
  }

  async getFeaturedJobsByOrgId(
    ecosystem: string | undefined,
    orgId: string,
  ): Promise<ResponseWithOptionalData<JobListResult[]>> {
    try {
      const jobs = (await this.getJobsListResults(ecosystem)).filter(
        x => x?.organization?.orgId === orgId,
      );
      const now = new Date().getTime();
      const featured = ecosystem
        ? jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.featured === true &&
                job.featureStartDate <= now &&
                now <= job.featureEndDate,
            )
        : jobs
            .map(x => new JobListResultEntity(x).getProperties())
            .filter(
              job =>
                job.featured === true &&
                job.featureStartDate <= now &&
                now <= job.featureEndDate,
            );
      const result = sort<JobListResult>(featured).by([
        { desc: (job): boolean => job.featured },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { asc: (job): number => job.featureStartDate },
      ]);
      return {
        success: true,
        message: "Org featured jobs retrieved successfully",
        data: result,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getFeaturedJobsByOrgId ${err.message}`);
      return {
        success: false,
        message: "Failed to retrieve featured jobs by orgId",
      };
    }
  }

  async getJobDetailsByUuid(
    uuid: string,
    ecosystem: string | undefined,
    protectLink = true,
  ): Promise<JobDetailsResult | undefined> {
    try {
      const projected = await this.searchDocuments.getJobByShortUuid(uuid, {
        ecosystem,
      });
      return projected
        ? new JobDetailsEntity(projected as JobDetailsResult).getProperties(
            protectLink,
          )
        : undefined;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", uuid);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobDetailsByUuid ${err.message}`);
      return undefined;
    }
  }

  async getJobDetailsByUuidForUpdate(
    uuid: string,
  ): Promise<EcosystemJobListResult | undefined> {
    try {
      const projected = await this.searchDocuments.getJobByShortUuid(uuid, {
        includeOffline: true,
      });
      return projected
        ? new EcosystemJobListResultEntity(
            projected as EcosystemJobListResult,
          ).getProperties()
        : undefined;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", uuid);
        Sentry.captureException(err);
      });
      this.logger.error(
        `JobsService::getJobDetailsByUuidForUpdate ${err.message}`,
      );
      return undefined;
    }
  }

  async getJobsByOrgId(
    id: string,
    ecosystem: string | undefined,
  ): Promise<JobListResult[] | undefined> {
    try {
      const payloads = await this.searchDocuments.getJobPayloads(ecosystem, id);
      return sort(
        payloads.map(orgJob => new JobListResultEntity(orgJob).getProperties()),
      ).desc(x => x.timestamp);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getJobsByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getTopJobsByOrgId(
    id: string,
  ): Promise<ResponseWithOptionalData<EcosystemJobListResult[]>> {
    try {
      const jobs = await this.getAllOrgJobsListResults(id);
      const topJobs = sort(jobs).desc(x => x.applications ?? 0);
      return {
        success: true,
        message: "Top jobs retrieved successfully",
        data: topJobs.slice(0, 10),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getTopJobsByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getAllJobsByOrgId(
    id: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<EcosystemJobListResult>> {
    try {
      return paginate<EcosystemJobListResult>(
        page ?? 1,
        limit ?? 20,
        await this.getAllOrgJobsListResults(id),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(err);
      });
      this.logger.error(`JobsService::getAllJobsByOrgId ${err.message}`);
      return undefined;
    }
  }

  async getOrgAllJobsListFilters(id: string): Promise<JobFilterConfigs> {
    const values = await this.searchDocuments.getJobFilterValues(undefined, id);
    return new JobFilterConfigsEntity(values).getProperties();
  }

  async getJobsByOrgIdWithApplicants(
    orgId: string,
    list: ApplicantList = "all",
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    try {
      const applicants = (await this.jobGraph.getApplicants({
        organizationId: orgId,
        list,
      })) as unknown as JobApplicant[];
      const ecosystemActivations =
        await this.scorerService.getAllUserEcosystemActivations(orgId);

      return {
        success: true,
        message: "Org jobs and applicants retrieved successfully",
        data: applicants.map(applicant => {
          const wallets = applicant.user.linkedAccounts.wallets;
          return new JobApplicantEntity({
            ...applicant,
            ecosystemActivations: wallets.flatMap(
              wallet =>
                ecosystemActivations
                  .find(activation => activation.wallet === wallet)
                  ?.ecosystemActivations?.map(activation => activation.name) ??
                [],
            ),
          }).getProperties();
        }),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(err);
      });
      this.logger.error(
        "JobsService::getJobsByOrgIdWithApplicants " + err.message,
      );
      return {
        success: false,
        message: "Org jobs and applicants retrieval failed",
      };
    }
  }

  async getJobApplicants(
    list: ApplicantList = "all",
  ): Promise<ResponseWithOptionalData<JobApplicant[]>> {
    try {
      const applicants = (await this.jobGraph.getApplicants({
        list,
        useAdminList: true,
      })) as unknown as JobApplicant[];

      return {
        success: true,
        message: "Org jobs and applicants retrieved successfully",
        data: await Promise.all(
          applicants.map(async applicant => {
            const privyId = await this.profileService.getPrivyId(
              applicant.user.wallet,
            );
            const user = await this.privyService.getUserById(privyId);
            const wallets =
              await this.privyService.getUserLinkedWallets(privyId);
            const ecosystemActivations =
              await this.rpcService.getEcosystemsForWallet(
                applicant.user.wallet,
              );
            return new JobApplicantEntity({
              ...applicant,
              user: {
                ...applicant.user,
                linkedAccounts: {
                  discord: user.discord?.username ?? null,
                  telegram: user.telegram?.username ?? null,
                  twitter: user.twitter?.username ?? null,
                  email: user.email?.address ?? null,
                  farcaster: user.farcaster?.username ?? null,
                  github: user.github?.username ?? null,
                  google: user.google?.email ?? null,
                  apple: user.apple?.email ?? null,
                  wallets,
                },
              },
              ecosystemActivations,
            }).getProperties();
          }),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", list);
        Sentry.captureException(err);
      });
      this.logger.error("JobsService::getJobApplicants " + err.message);
      return {
        success: false,
        message: "Org jobs and applicants retrieval failed",
      };
    }
  }

  async getAllJobsWithSearch(
    params: AllJobsParams,
  ): Promise<Response<AllJobsListResult[]>> {
    const paramsPassed = {
      ...params,
      query: params.query ? new RegExp(params.query, "gi") : null,
    };

    const {
      organizations: organizationFilterList,
      category: classificationFilterList,
      query,
    } = paramsPassed;

    const results: AllJobsListResult[] = [];

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
      this.logger.error(`JobsService::getAllJobsWithSearch ${err.message}`);
      return {
        success: false,
        message: "Error retrieving all jobs",
        data: [],
      };
    }

    const jobFilters = (jlr: AllJobsListResult): boolean => {
      if (jlr.organization) {
        const { name: orgName } = jlr.organization;
        const { title: jobTitle, tags, classification } = jlr;

        const matchesQuery =
          orgName.match(query) ||
          jobTitle.match(query) ||
          tags.filter(tag => tag.name.match(query)).length > 0;

        return (
          (!classificationFilterList ||
            classificationFilterList.includes(slugify(classification))) &&
          (!query || matchesQuery) &&
          (!organizationFilterList ||
            organizationFilterList.includes(slugify(orgName)))
        );
      } else {
        return false;
      }
    };

    const filtered = results.filter(jobFilters);

    const final = sort<AllJobsListResult>(filtered).desc(job => job.timestamp);

    return {
      success: true,
      message: "All jobposts retrieved successfully",
      data: final.map(x => new AllJobListResultEntity(x).getProperties()),
    };
  }

  async getAllJobsFilterConfigs(): Promise<AllJobsFilterConfigs> {
    const values = await this.searchDocuments.getAllJobsFilterValues();
    return new AllJobsFilterConfigsEntity(values).getProperties();
  }

  async getUserBookmarkedJobs(
    wallet: string,
    ecosystem: string | undefined,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const payloads = await this.jobGraph.getUserJobPayloads(
        wallet,
        "BOOKMARKED",
        ecosystem,
      );
      return {
        success: true,
        message: "User bookmarked jobs retrieved successfully",
        data: payloads.map(payload =>
          new JobListResultEntity(
            payload as unknown as JobListResult,
          ).getProperties(),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error("JobsService::getUserBookmarkedJobs " + err.message);
      return {
        success: false,
        message: "Error getting user bookmarked jobs",
      };
    }
  }

  async getUserAppliedJobs(
    wallet: string,
    ecosystem: string | undefined,
  ): Promise<Response<JobListResult[]> | ResponseWithNoData> {
    try {
      const payloads = await this.jobGraph.getUserJobPayloads(
        wallet,
        "APPLIED_TO",
        ecosystem,
      );
      return {
        success: true,
        message: "User applied jobs retrieved successfully",
        data: payloads.map(payload =>
          new JobListResultEntity(
            payload as unknown as JobListResult,
          ).getProperties(),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error("JobsService::getUserAppliedJobs " + err.message);
      return {
        success: false,
        message: "Error getting user applied jobs",
      };
    }
  }

  async getUserJobFolders(
    wallet: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder[]>> {
    try {
      const folders = await this.jobGraph.getJobFolders({ wallet });
      return {
        success: true,
        message: "User job folders retrieved successfully",
        data: folders.map(folder =>
          new JobpostFolderEntity(
            folder as unknown as JobpostFolder,
          ).getProperties(),
        ),
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getUserJobFolders " + err.message);
      return { success: false, message: "Error getting user job folders" };
    }
  }

  async getUserJobFolderById(
    id: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const [folder] = await this.jobGraph.getJobFolders({ id });
      return folder
        ? {
            success: true,
            message: "User job folder retrieved successfully",
            data: new JobpostFolderEntity(
              folder as unknown as JobpostFolder,
            ).getProperties(),
          }
        : {
            success: false,
            message: "Public user job folder not found for that id",
          };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getUserJobFolderById " + err.message);
      return { success: false, message: "Error getting user job folder by id" };
    }
  }

  async getPublicJobFolderBySlug(
    slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const [folder] = await this.jobGraph.getJobFolders({
        slug,
        publicOnly: true,
      });
      return folder
        ? {
            success: true,
            message: "User job folder retrieved successfully",
            data: new JobpostFolderEntity(
              folder as unknown as JobpostFolder,
            ).getProperties(),
          }
        : {
            success: false,
            message: "Public user job folder not found for that slug",
          };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getPublicJobFolderBySlug " + err.message);
      return {
        success: false,
        message: "Error getting public job folder by slug",
      };
    }
  }

  private async getJobFolderBySlug(
    slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const [folder] = await this.jobGraph.getJobFolders({ slug });
      return folder
        ? {
            success: true,
            message: "User job folder retrieved successfully",
            data: new JobpostFolderEntity(
              folder as unknown as JobpostFolder,
            ).getProperties(),
          }
        : {
            success: false,
            message: "Public user job folder not found for that slug",
          };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getJobFolderBySlug " + err.message);
      return {
        success: false,
        message: "Error getting user job folder by slug",
      };
    }
  }

  async getUserJobFolderBySlug(
    wallet: string,
    slug: string,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const [folder] = await this.jobGraph.getJobFolders({ wallet, slug });
      return folder
        ? {
            success: true,
            message: "User job folder retrieved successfully",
            data: new JobpostFolderEntity(
              folder as unknown as JobpostFolder,
            ).getProperties(),
          }
        : {
            success: false,
            message: "User job folder not found for that slug",
          };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getUserJobFolderBySlug " + err.message);
      return {
        success: false,
        message: "Error getting user job folder by slug",
      };
    }
  }

  async updateJobApplicantList(
    dto: UpdateJobApplicantListInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.updateApplicantLists({
        applicants: dto.applicants,
        list: dto.list,
        field: "adminList",
      });
      return {
        success: true,
        message: "Org job applicant list updated successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::updateJobApplicantList " + err.message);
      return {
        success: false,
        message: "Error updating org job applicant list",
      };
    }
  }

  async updateOrgJobApplicantList(
    orgId: string,
    dto: UpdateJobApplicantListInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.updateApplicantLists({
        applicants: dto.applicants,
        list: dto.list,
        field: "list",
        organizationId: orgId,
      });
      return {
        success: true,
        message: "Org job applicant list updated successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error(
        "JobsService::updateOrgJobApplicantList " + err.message,
      );
      return {
        success: false,
        message: "Error updating org job applicant list",
      };
    }
  }

  async createUserJobFolder(
    wallet: string,
    dto: CreateJobFolderInput,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const existing = data(await this.getJobFolderBySlug(slugify(dto.name)));
      if (existing) {
        return {
          success: false,
          message: "Folder with that name already exists",
        };
      }
      const id = await this.jobGraph.saveJobFolder({
        wallet,
        name: dto.name,
        isPublic: dto.isPublic,
        jobs: dto.jobs,
      });
      if (!id) {
        return { success: false, message: "Job folder creation failed" };
      }
      return {
        success: true,
        message: "Job folder created successfully",
        data: data(await this.getUserJobFolderById(id)),
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::createUserJobFolder " + err.message);
      return { success: false, message: "Error creating job folder" };
    }
  }

  async updateUserJobFolder(
    id: string,
    dto: UpdateJobFolderInput,
  ): Promise<ResponseWithOptionalData<JobpostFolder>> {
    try {
      const toUpdate = data(await this.getUserJobFolderById(id));
      if (!toUpdate) {
        return { success: false, message: "Job folder update failed" };
      }
      const existing = data(await this.getJobFolderBySlug(slugify(dto.name)));
      if (existing && existing.id !== toUpdate.id) {
        return {
          success: false,
          message: "Folder with that name already exists",
        };
      }
      const updatedId = await this.jobGraph.saveJobFolder({
        id,
        name: dto.name,
        isPublic: dto.isPublic,
        jobs: dto.jobs,
      });
      if (!updatedId) {
        return { success: false, message: "Job folder update failed" };
      }
      return {
        success: true,
        message: "Job folder updated successfully",
        data: data(await this.getUserJobFolderById(updatedId)),
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::updateUserJobFolder " + err.message);
      return { success: false, message: "Error updating job folder" };
    }
  }

  async deleteUserJobFolder(id: string): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.deleteJobFolder(id);
      return {
        success: true,
        message: "Job folder deleted successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::deleteUserJobFolder " + err.message);
      return { success: false, message: "Error deleting job folder" };
    }
  }

  async changeJobClassification(
    wallet: string,
    dto: ChangeJobClassificationInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: dto.shortUUIDs,
        relationshipType: "HAS_CLASSIFICATION",
        targetLabel: "JobpostClassification",
        targetProperty: "name",
        targetValues: [dto.classification],
        creator: wallet,
      });
      return {
        success: true,
        message: "Job classification changed successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::changeClassification " + err.message);
      return { success: false, message: "Error changing job classification" };
    }
  }

  async editJobTags(
    wallet: string,
    dto: EditJobTagsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: [dto.shortUUID],
        relationshipType: "HAS_TAG",
        targetLabel: "Tag",
        targetProperty: "normalizedName",
        targetValues: dto.tags,
        creator: wallet,
      });
      return { success: true, message: "Job tags updated successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::editJobTags " + err.message);
      return { success: false, message: "Error editing job tags" };
    }
  }

  async changeJobCommitment(
    wallet: string,
    dto: ChangeJobCommitmentInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: [dto.shortUUID],
        relationshipType: "HAS_COMMITMENT",
        targetLabel: "JobpostCommitment",
        targetProperty: "name",
        targetValues: [dto.commitment],
        creator: wallet,
      });
      return { success: true, message: "Job commitment changed successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::changeJobCommitment " + err.message);
      return { success: false, message: "Error changing job commitment" };
    }
  }

  async changeJobLocationType(
    wallet: string,
    dto: ChangeJobLocationTypeInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: [dto.shortUUID],
        relationshipType: "HAS_LOCATION_TYPE",
        targetLabel: "JobpostLocationType",
        targetProperty: "name",
        targetValues: [dto.locationType],
        creator: wallet,
      });
      return {
        success: true,
        message: "Job location type changed successfully",
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::changeJobLocationType " + err.message);
      return { success: false, message: "Error changing job location type" };
    }
  }

  async changeJobProject(
    wallet: string,
    dto: ChangeJobProjectInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: [dto.shortUUID],
        relationshipType: "HAS_PROJECT",
        targetLabel: "Project",
        targetProperty: "id",
        targetValues: [dto.projectId],
        creator: wallet,
      });
      return { success: true, message: "Job project changed successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::changeJobProject " + err.message);
      return { success: false, message: "Failed to change job project" };
    }
  }

  async update(
    shortUUID: string,
    job: Omit<
      UpdateJobMetadataInput,
      | "commitment"
      | "classification"
      | "locationType"
      | "project"
      | "tags"
      | "isBlocked"
      | "isOnline"
    >,
  ): Promise<boolean> {
    try {
      await this.jobGraph.updateJobProperties([shortUUID], {
        ...job,
        access: job.protected ? "protected" : "public",
        protected: undefined,
      });
      return true;
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::update " + err.message);
      return false;
    }
  }

  async blockJobs(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: dto.shortUUIDs,
        relationshipType: "HAS_JOB_DESIGNATION",
        targetLabel: "BlockedDesignation",
        targetProperty: "name",
        targetValues: ["BlockedDesignation"],
        creator: wallet,
        replace: false,
      });
      return { success: true, message: "Jobs blocked successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::blockJobs " + err.message);
      return { success: false, message: "Error blocking jobs" };
    }
  }

  async unblockJobs(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.deleteJobRelationships({
        shortUuids: dto.shortUUIDs,
        relationshipType: "HAS_JOB_DESIGNATION",
        targetLabel: "BlockedDesignation",
      });
      return { success: true, message: "Jobs unblocked successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::unblockJobs " + err.message);
      return { success: false, message: "Error unblocking jobs" };
    }
  }

  async makeJobsOffline(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: dto.shortUUIDs,
        relationshipType: "HAS_STATUS",
        targetLabel: "JobpostOfflineStatus",
        creator: wallet,
      });
      return { success: true, message: "Jobs made offline successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::makeJobsOffline " + err.message);
      return { success: false, message: "Error making jobs offline" };
    }
  }

  async makeJobsOnline(
    wallet: string,
    dto: BlockJobsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.replaceJobRelationships({
        shortUuids: dto.shortUUIDs,
        relationshipType: "HAS_STATUS",
        targetLabel: "JobpostOnlineStatus",
        creator: wallet,
      });
      return { success: true, message: "Jobs made online successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::makeJobsOnline " + err.message);
      return { success: false, message: "Error making jobs online" };
    }
  }

  async featureJobpost(dto: FeatureJobsInput): Promise<ResponseWithNoData> {
    try {
      await this.jobGraph.updateJobProperties([dto.shortUUID], {
        featured: true,
        featureStartDate: new Date(dto.startDate).getTime(),
        featureEndDate: new Date(dto.endDate).getTime(),
      });
      return { success: true, message: "Job made featured successfully" };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::makeJobFeatured " + err.message);
      return { success: false, message: "Error making job featured" };
    }
  }

  async handleJobPromotion(shortUUID: string): Promise<void> {
    const job = await this.getJobDetailsByUuid(shortUUID, undefined);
    if (job) {
      const isAlreadyPromoted = job.featured;
      if (isAlreadyPromoted) {
        this.logger.log(
          `Job ${job.shortUUID} is already promoted, extending feature duration...`,
        );
        await this.featureJobpost({
          shortUUID: job.shortUUID,
          startDate: new Date(job.featureStartDate).toISOString(),
          endDate: addDays(job.featureEndDate, 7).toISOString(),
        });
      } else {
        this.logger.log(
          `Promoting job ${job.shortUUID} to featured status for a week...`,
        );
        await this.featureJobpost({
          shortUUID: job.shortUUID,
          startDate: new Date().toISOString(),
          endDate: addDays(new Date(), 7).toISOString(),
        });
      }
      this.logger.log(`Job ${job.shortUUID} promoted successfully`);
    } else {
      this.logger.error(
        `Job ${shortUUID} could not be promoted because it does not exist`,
      );
    }
  }

  async getSimilarJobs(
    uuid: string,
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<SimilarJob[]>> {
    try {
      const data = (await this.jobGraph.getSimilarJobs(uuid, ecosystem))
        .map(result => ({
          ...(result as unknown as SimilarJob),
          timestamp: nonZeroOrNull(result.timestamp as number),
        }))
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      return {
        success: true,
        message: "Similar jobs retrieved successfully",
        data,
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getSimilarJobs " + err.message);
      return { success: false, message: "Failed to retrieve similar jobs" };
    }
  }

  async getJobMatchScore(
    shortUuid: string,
    skills: string[],
    isExpert: boolean,
  ): Promise<ResponseWithOptionalData<JobMatchResult>> {
    // Expert mode is part of the API contract but does not alter legacy scoring.
    void isExpert;
    try {
      const matchData = await this.jobGraph.getJobTagMatchData(shortUuid);
      if (!matchData) {
        return { success: false, message: "Job not found" };
      }
      const jobTagSet = new Set(matchData.jobTags);
      if (jobTagSet.size === 0 || skills.length === 0) {
        return {
          success: true,
          message: "Job match score calculated successfully",
          data: {
            score: 0,
            category: JobMatchCategory.UNLIKELY_FIT,
            matchedSkills: [],
            recommendedSkills: [],
          },
        };
      }
      return {
        success: true,
        message: "Job match score calculated successfully",
        data: this.calculateMatchScore(
          skills,
          jobTagSet,
          matchData.tagMappings,
          matchData.allTags,
        ),
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getJobMatchScore " + err.message);
      return { success: false, message: "Failed to calculate job match score" };
    }
  }

  private calculateMatchScore(
    userSkills: string[],
    jobTagSet: Set<string>,
    tagMappings: Array<{
      id: string;
      name: string;
      normalizedName: string;
      expanded: string[];
    }>,
    allTags: Array<{ id: string; name: string; normalizedName: string }>,
  ): JobMatchResult {
    const tagLookup = new Map(allTags.map(t => [t.normalizedName, t]));
    const userSkillSet = new Set(userSkills);
    const matchedSkills = userSkills
      .filter(s => jobTagSet.has(s))
      .map(s => tagLookup.get(s))
      .filter(
        (t): t is { id: string; name: string; normalizedName: string } =>
          t != null,
      );
    const matchedCount = matchedSkills.length;
    const jobCoverage = matchedCount / jobTagSet.size;
    const skillRelevance = matchedCount / userSkills.length;
    const score =
      jobCoverage === 0 || skillRelevance === 0
        ? 0
        : Math.sqrt(jobCoverage * skillRelevance);
    const roundedScore = Math.round(score * 100) / 100;
    const category =
      roundedScore >= 0.55
        ? JobMatchCategory.STRONG_FIT
        : roundedScore >= 0.25
          ? JobMatchCategory.PARTIAL_FIT
          : JobMatchCategory.UNLIKELY_FIT;

    const recommendedSkills = tagMappings
      .filter(tm => !tm.expanded.some(name => userSkillSet.has(name)))
      .map(tm => ({
        id: tm.id,
        name: tm.name,
        normalizedName: tm.normalizedName,
      }));

    return {
      score: roundedScore,
      category,
      matchedSkills,
      recommendedSkills,
    };
  }

  async getSuggestedJobs(
    skills: string[],
    isExpert: boolean,
    limit: number,
    page: number,
  ): Promise<ResponseWithOptionalData<PaginatedData<PillarJob>>> {
    if (!skills.length) {
      return {
        success: true,
        message: "Suggested jobs retrieved successfully",
        data: { page, count: 0, total: 0, data: [] },
      };
    }

    try {
      const result = await this.jobGraph.getSuggestedJobPayloads({
        skills,
        minimumOverlapRatio: isExpert ? 0.15 : 0.25,
        minimumMatchCount: Math.min(
          5,
          Math.max(1, Math.ceil(skills.length / 3)),
        ),
        limit,
        offset: (page - 1) * limit,
      });
      const jobs = result.rows.map(raw => {
        const job = raw as unknown as PillarJob;
        const organization = job.organization;
        const seniorityLabels: Record<string, string> = {
          "1": "Intern",
          "2": "Junior",
          "3": "Senior",
          "4": "Lead",
          "5": "Head",
        };
        return {
          ...job,
          salary: intConverter(job.salary) || null,
          minimumSalary: intConverter(job.minimumSalary) || null,
          maximumSalary: intConverter(job.maximumSalary) || null,
          timestamp: intConverter(job.timestamp),
          featureStartDate: intConverter(job.featureStartDate) || null,
          featureEndDate: intConverter(job.featureEndDate) || null,
          seniority: seniorityLabels[String(job.seniority)] ?? job.seniority,
          tags: (job.tags ?? []).filter(
            (tag: { name: string | null }) => tag.name !== null,
          ),
          organization: organization
            ? {
                ...organization,
                headcountEstimate:
                  intConverter(organization.headcountEstimate) || null,
                fundingRounds: (organization.fundingRounds ?? []).map(
                  round => ({
                    ...round,
                    date: intConverter(round.date),
                    raisedAmount: intConverter(round.raisedAmount) || null,
                  }),
                ),
                investors: [
                  ...new Map(
                    (organization.investors ?? []).map(
                      (investor: { id: string }) =>
                        [investor.id, investor] as const,
                    ),
                  ).values(),
                ],
              }
            : null,
        } as PillarJob;
      });
      return {
        success: true,
        message: "Suggested jobs retrieved successfully",
        data: {
          page,
          count: jobs.length,
          total: result.total,
          data: jobs,
        },
      };
    } catch (err) {
      Sentry.captureException(err);
      this.logger.error("JobsService::getSuggestedJobs " + err.message);
      return { success: false, message: "Failed to retrieve suggested jobs" };
    }
  }
}
