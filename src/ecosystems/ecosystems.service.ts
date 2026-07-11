import { BadRequestException, Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { sort } from "fast-sort";
import { EcosystemRepository } from "src/postgres/ecosystem.repository";
import { SearchDocumentRepository } from "src/postgres/search-document.repository";
import {
  EcosystemJobFilterConfigsEntity,
  EcosystemJobListResultEntity,
  JobListResultEntity,
  ShortOrgWithSummaryEntity,
} from "src/shared/entities";
import { DateRange } from "src/shared/enums";
import {
  dropPublicJobsFromOrgsWithOnlineExpertJobs,
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  publicationDateRangeGenerator,
} from "src/shared/helpers";
import {
  EcosystemJobFilterConfigs,
  EcosystemJobListResult,
  FundingRound,
  JobListResult,
  OrgReview,
  PaginatedData,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import {
  OrganizationEcosystem,
  OrganizationEcosystemWithOrgs,
} from "src/shared/interfaces/org";
import { StoredFilter } from "src/shared/interfaces/stored-filter.interface";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { TagsService } from "src/tags/tags.service";
import { CreateEcosystemDto } from "./dto/create-ecosystem.dto";
import { CreateStoredFilterDto } from "./dto/create-stored-filter.dto";
import { EcosystemJobListParams } from "./dto/ecosystem-job-list.input";
import { UpdateEcosystemOrgsDto } from "./dto/update-ecosystem-orgs.dto";
import { UpdateEcosystemDto } from "./dto/update-ecosystem.dto";
import { UpdateStoredFilterDto } from "./dto/update-stored-filter.dto";

@Injectable()
export class EcosystemsService {
  private readonly logger = new CustomLogger(EcosystemsService.name);

  constructor(
    private readonly ecosystems: EcosystemRepository,
    private readonly searchDocuments: SearchDocumentRepository,
    private readonly tagsService: TagsService,
  ) {}

  async create(
    orgId: string,
    dto: CreateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    try {
      const result = await this.ecosystems.createEcosystem(orgId, dto.name);
      if (result.status === "conflict") {
        throw new BadRequestException({
          success: false,
          message: "This ecosystem name is not available",
        });
      }
      if (result.status === "not_found") {
        return {
          success: false,
          message: "Failed to create ecosystem for org",
        };
      }
      return {
        success: true,
        message: "Created ecosystem successfully",
        data: this.toEcosystem(result.value),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.capture("create", error, dto);
      throw new BadRequestException({
        success: false,
        message: "Failed to create ecosystem for unknown reason",
      });
    }
  }

  async createStoredFilter(
    orgId: string,
    address: string,
    dto: CreateStoredFilterDto,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    try {
      const filter = await this.ecosystems.createStoredFilter(
        orgId,
        address,
        dto,
      );
      return filter
        ? {
            success: true,
            message: "Created stored filter successfully",
            data: this.toStoredFilter(filter),
          }
        : { success: false, message: "Failed to create stored filter" };
    } catch (error) {
      this.capture("createStoredFilter", error, dto);
      return { success: false, message: "Failed to create stored filter" };
    }
  }

  async findAll(
    orgId: string,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs[]>> {
    try {
      const records = await this.ecosystems.findOwnedEcosystems(orgId);
      return {
        success: true,
        message: "Retrieved all ecosystems successfully",
        data: records.map(record => this.toEcosystemWithOrganizations(record)),
      };
    } catch (error) {
      this.capture("findAll", error, orgId);
      return { success: false, message: "Failed to retrieve ecosystems" };
    }
  }

  async findAllStoredFilters(
    orgId: string,
    address: string,
  ): Promise<ResponseWithOptionalData<StoredFilter[]>> {
    try {
      const filters = await this.ecosystems.findStoredFilters(orgId, address);
      return {
        success: true,
        message: "Retrieved all stored filters successfully",
        data: filters.map(filter => this.toStoredFilter(filter)),
      };
    } catch (error) {
      this.capture("findAllStoredFilters", error, orgId);
      return { success: false, message: "Failed to retrieve stored filters" };
    }
  }

  async findStoredFilterById(
    id: string,
    address: string,
    orgId: string,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    try {
      const [filter] = await this.ecosystems.findStoredFilters(
        orgId,
        address,
        id,
      );
      return filter
        ? {
            success: true,
            message: "Retrieved stored filter successfully",
            data: this.toStoredFilter(filter),
          }
        : { success: false, message: "Failed to retrieve stored filter" };
    } catch (error) {
      this.capture("findStoredFilterById", error, id);
      return { success: false, message: "Failed to retrieve stored filter" };
    }
  }

  async findOrgIdByEcosystem(
    idOrSlug: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const organizationId =
        await this.ecosystems.findOwnerOrganizationId(idOrSlug);
      return organizationId
        ? {
            success: true,
            message: "Retrieved ecosystem owner orgId successfully",
            data: organizationId,
          }
        : {
            success: false,
            message: "Failed to retrieve ecosystem owner orgId",
          };
    } catch (error) {
      this.capture("findOrgIdByEcosystem", error, idOrSlug);
      return {
        success: false,
        message: "Failed to retrieve ecosystem owner orgId",
      };
    }
  }

  async findOne(
    orgId: string,
    idOrSlug: string,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs>> {
    try {
      const [record] = await this.ecosystems.findOwnedEcosystems(
        orgId,
        idOrSlug,
      );
      return record
        ? {
            success: true,
            message: "Retrieved ecosystem successfully",
            data: this.toEcosystemWithOrganizations(record),
          }
        : { success: false, message: "Ecosystem not found" };
    } catch (error) {
      this.capture("findOne", error, idOrSlug);
      return { success: false, message: "Failed to retrieve ecosystem" };
    }
  }

  async update(
    orgId: string,
    idOrSlug: string,
    dto: UpdateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    try {
      const result = await this.ecosystems.updateEcosystem(
        orgId,
        idOrSlug,
        dto.name,
      );
      if (result.status === "conflict") {
        throw new BadRequestException({
          success: false,
          message: "This ecosystem name is not available",
        });
      }
      if (result.status === "not_found") {
        return { success: false, message: "Ecosystem not found" };
      }
      return {
        success: true,
        message: "Updated ecosystem successfully",
        data: this.toEcosystem(result.value),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.capture("update", error, dto);
      return { success: false, message: "Failed to update ecosystem" };
    }
  }

  async updateStoredFilter(
    orgId: string,
    address: string,
    id: string,
    dto: UpdateStoredFilterDto,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    try {
      const filter = await this.ecosystems.updateStoredFilter(
        orgId,
        address,
        id,
        dto,
      );
      return filter
        ? {
            success: true,
            message: "Updated stored filter successfully",
            data: this.toStoredFilter(filter),
          }
        : {
            success: false,
            message:
              "You do not have permission to update this stored filter or it does not exist",
          };
    } catch (error) {
      this.capture("updateStoredFilter", error, dto);
      return { success: false, message: "Failed to update stored filter" };
    }
  }

  async remove(orgId: string, idOrSlug: string): Promise<ResponseWithNoData> {
    try {
      const deleted = await this.ecosystems.deleteEcosystem(orgId, idOrSlug);
      return deleted
        ? { success: true, message: "Deleted ecosystem successfully" }
        : { success: false, message: "Ecosystem not found" };
    } catch (error) {
      this.capture("remove", error, idOrSlug);
      return { success: false, message: "Failed to delete ecosystem" };
    }
  }

  async removeStoredFilter(
    orgId: string,
    address: string,
    id: string,
  ): Promise<ResponseWithNoData> {
    try {
      const deleted = await this.ecosystems.deleteStoredFilter(
        orgId,
        address,
        id,
      );
      return deleted
        ? { success: true, message: "Deleted stored filter successfully" }
        : {
            success: false,
            message:
              "You do not have permission to delete this stored filter or it does not exist",
          };
    } catch (error) {
      this.capture("removeStoredFilter", error, id);
      return { success: false, message: "Failed to delete stored filter" };
    }
  }

  async updateEcosystemOrgs(
    orgId: string,
    idOrSlug: string,
    dto: UpdateEcosystemOrgsDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs>> {
    try {
      const record = await this.ecosystems.replaceMemberOrganizations(
        orgId,
        idOrSlug,
        dto.orgIds,
      );
      return record
        ? {
            success: true,
            message: "Updated organization ecosystem successfully",
            data: this.toEcosystemWithOrganizations(record),
          }
        : { success: false, message: "Ecosystem not found" };
    } catch (error) {
      this.capture("updateEcosystemOrgs", error, dto);
      return { success: false, message: "Failed to update ecosystem orgs" };
    }
  }

  getJobsListResults = async (
    ecosystems: string[],
  ): Promise<EcosystemJobListResult[]> => {
    try {
      const payloads =
        await this.searchDocuments.getEcosystemJobPayloads(ecosystems);
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
    } catch (error) {
      this.capture("getJobsListResults", error, ecosystems);
      return [];
    }
  };

  async getJobsListWithSearch(
    params: EcosystemJobListParams & { ecosystems: string[] },
  ): Promise<PaginatedData<EcosystemJobListResult>> {
    try {
      const page = await this.searchDocuments.searchJobs({
        ...publicationDateRangeGenerator(params.publicationDate as DateRange),
        ...params,
        includeOffline: params.online !== true,
        includeBlocked: params.blocked !== true,
      });
      return {
        ...page,
        data: page.data.map(payload =>
          new EcosystemJobListResultEntity(
            payload as EcosystemJobListResult,
          ).getProperties(),
        ),
      };
    } catch (error) {
      this.capture("getJobsListWithSearch", error, params);
      return { page: -1, count: 0, total: 0, data: [] };
    }
  }

  async getEcosystemJobs(ecosystem: string): Promise<JobListResult[]> {
    const jobs = (await this.getJobsListResults([ecosystem])).filter(
      job => job.online,
    );
    const visible = dropPublicJobsFromOrgsWithOnlineExpertJobs(
      jobs,
      () => true,
    );
    return sort(
      visible.map(job => new JobListResultEntity(job).getProperties()),
    ).desc(job => job.timestamp);
  }

  async getFilterConfigs(
    ecosystems: string[],
  ): Promise<EcosystemJobFilterConfigs> {
    try {
      const [values, popularTags] = await Promise.all([
        this.searchDocuments.getJobFilterValues(ecosystems),
        this.tagsService.getPopularTags(100),
      ]);
      return new EcosystemJobFilterConfigsEntity({
        ...values,
        tags: popularTags.map(tag => tag.name),
      }).getProperties();
    } catch (error) {
      this.capture("getFilterConfigs", error, ecosystems);
      return undefined;
    }
  }

  private toEcosystem(
    properties: Record<string, unknown>,
  ): OrganizationEcosystem {
    return new OrganizationEcosystem({
      ...properties,
      createdTimestamp: nonZeroOrNull(
        properties.createdTimestamp as number | string,
      ),
      updatedTimestamp: nonZeroOrNull(
        properties.updatedTimestamp as number | string,
      ),
    } as unknown as OrganizationEcosystem);
  }

  private toStoredFilter(properties: Record<string, unknown>): StoredFilter {
    return new StoredFilter({
      ...properties,
      createdTimestamp: nonZeroOrNull(
        properties.createdTimestamp as number | string,
      ),
      updatedTimestamp: nonZeroOrNull(
        properties.updatedTimestamp as number | string,
      ),
    } as unknown as StoredFilter);
  }

  private toEcosystemWithOrganizations(record: {
    properties: Record<string, unknown>;
    memberPayloads: Record<string, unknown>[];
  }): OrganizationEcosystemWithOrgs {
    return new OrganizationEcosystemWithOrgs({
      ...this.toEcosystem(record.properties),
      orgs: record.memberPayloads.map(payload => {
        const reviews = (payload.reviews ?? []) as OrgReview[];
        const fundingRounds = (payload.fundingRounds ?? []) as FundingRound[];
        const lastFundingRound = sort(fundingRounds).desc(
          round => round.date,
        )[0];
        return new ShortOrgWithSummaryEntity({
          orgId: String(payload.orgId ?? ""),
          url: String(payload.website ?? ""),
          name: String(payload.name ?? ""),
          normalizedName: String(payload.normalizedName ?? ""),
          summary: String(payload.summary ?? ""),
          location: String(payload.location ?? ""),
          logoUrl: (payload.logoUrl as string | null | undefined) ?? null,
          projectCount: Array.isArray(payload.projects)
            ? payload.projects.length
            : 0,
          headcountEstimate: Number(payload.headcountEstimate ?? 0),
          reviewCount: reviews.length,
          aggregateRating: generateOrgAggregateRating(
            generateOrgAggregateRatings(reviews.map(review => review.rating)),
          ),
          lastFundingAmount: lastFundingRound?.raisedAmount ?? 0,
          lastFundingDate: lastFundingRound?.date ?? 0,
          grants: Array.isArray(payload.grants) ? payload.grants : [],
          ecosystems: Array.isArray(payload.ecosystems)
            ? payload.ecosystems
            : [],
        } as never).getProperties();
      }),
    });
  }

  private capture(action: string, error: unknown, input?: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "ecosystems.service" });
      if (input !== undefined) scope.setExtra("input", input);
      Sentry.captureException(error);
    });
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`EcosystemsService::${action} ${message}`);
  }
}
