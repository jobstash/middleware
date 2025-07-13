import { BadRequestException, Injectable } from "@nestjs/common";
import { CreateEcosystemDto } from "./dto/create-ecosystem.dto";
import { UpdateEcosystemDto } from "./dto/update-ecosystem.dto";
import { UpdateEcosystemOrgsDto } from "./dto/update-ecosystem-orgs.dto";
import {
  data,
  EcosystemJobFilterConfigs,
  EcosystemJobListResult,
  FundingRound,
  OrganizationEcosystem,
  OrganizationEcosystemWithOrgs,
  OrgReview,
  PaginatedData,
  ProjectWithBaseRelations,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { InjectConnection } from "nestjs-neogma";
import { Neogma } from "neogma";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  notStringOrNull,
  paginate,
  publicationDateRangeGenerator,
  slugify,
} from "src/shared/helpers";
import { sort } from "fast-sort";
import {
  EcosystemJobFilterConfigsEntity,
  EcosystemJobListResultEntity,
  ShortOrgWithSummaryEntity,
} from "src/shared/entities";
import { differenceInHours } from "date-fns";
import { go } from "fuzzysort";
import { uniq } from "lodash";
import { DateRange } from "src/shared/enums";
import { EcosystemJobListParams } from "./dto/ecosystem-job-list.input";
import { ConfigService } from "@nestjs/config";
import { TagsService } from "src/tags/tags.service";
import { CreateStoredFilterDto } from "./dto/create-stored-filter.dto";
import { StoredFilter } from "src/shared/interfaces/stored-filter.interface";
import { UpdateStoredFilterDto } from "./dto/update-stored-filter.dto";

@Injectable()
export class EcosystemsService {
  private readonly logger = new CustomLogger(EcosystemsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly tagsService: TagsService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    orgId: string,
    createEcosystemDto: CreateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    try {
      const check = await this.neogma.queryRunner.run(
        `
          RETURN EXISTS {MATCH (:OrganizationEcosystem {normalizedName: $normalizedName})} AS existing
        `,
        { normalizedName: slugify(createEcosystemDto.name) },
      );
      const existing = check.records[0].get("existing") as boolean;
      if (existing) {
        throw new BadRequestException({
          success: false,
          message: "This ecosystem name is not available",
        });
      }
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})
          MERGE (org)-[:OWNS_ECOSYSTEM]->(ecosystem:OrganizationEcosystem {normalizedName: $normalizedName})
          ON CREATE SET
            ecosystem.id = randomUUID(),
            ecosystem.name = $name,
            ecosystem.createdTimestamp = timestamp()
          ON MATCH SET
            ecosystem.updatedTimestamp = timestamp()
          
          RETURN ecosystem { .* } as ecosystem
        `,
        {
          orgId,
          ...createEcosystemDto,
          normalizedName: slugify(createEcosystemDto.name),
        },
      );
      const ecosystem = result.records[0].get("ecosystem");
      if (ecosystem) {
        return {
          success: true,
          message: "Created ecosystem successfully",
          data: new OrganizationEcosystem({
            ...ecosystem,
            createdTimestamp: nonZeroOrNull(ecosystem.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(ecosystem.updatedTimestamp),
          }),
        };
      } else {
        throw new BadRequestException({
          success: false,
          message: "Failed to create ecosystem for org",
        });
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", createEcosystemDto);
        Sentry.captureException(error);
      });
      this.logger.error(`EcosystemsService::create ${error.message}`);
      throw new BadRequestException({
        success: false,
        message: "Failed to create ecosystem for unknown reason",
      });
    }
  }

  async createStoredFilter(
    orgId: string,
    address: string,
    createStoredFilterDto: CreateStoredFilterDto,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId}), (user:User {wallet: $address})
          MERGE (org)-[:HAS_STORED_FILTER]->(filter:StoredFilter {filter: $filter})<-[:CREATED_STORED_FILTER]-(user)
          ON CREATE SET
            filter.id = randomUUID(),
            filter.name = $name,
            filter.filter = $filter,
            filter.public = $public,
            filter.createdTimestamp = timestamp()
          
          RETURN filter { .* } as filter
        `,
        {
          orgId,
          address,
          ...createStoredFilterDto,
        },
      );
      const filter = result.records[0].get("filter");
      if (filter) {
        return {
          success: true,
          message: "Created stored filter successfully",
          data: new StoredFilter({
            ...filter,
            createdTimestamp: nonZeroOrNull(filter.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(filter.updatedTimestamp),
          }),
        };
      } else {
        return {
          success: false,
          message: "Failed to create stored filter",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", createStoredFilterDto);
        Sentry.captureException(error);
      });
      this.logger.error(
        `EcosystemsService::createStoredFilter ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to create stored filter",
      };
    }
  }

  async findAll(
    orgId: string,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (:Organization {orgId: $orgId})-[:OWNS_ECOSYSTEM]->(ecosystem:OrganizationEcosystem)
          RETURN ecosystem {
            .*,
            orgs: [
              (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem) | org {
                orgId: org.orgId,
                name: org.name,
                summary: org.summary,
                normalizedName: org.normalizedName,
                url: [(org)-[:HAS_WEBSITE]->(website) | website.url][0],
                logoUrl: org.logoUrl,
                summary: org.summary,
                location: org.location,
                projectCount: apoc.coll.sum([(org)-[:HAS_PROJECT]->(project:Project) | 1]),
                headcountEstimate: org.headcountEstimate,
                fundingRounds: apoc.coll.toSet([
                  (org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                ]),
                grants: [(org)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                  .*,
                  programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                }],
                ecosystems: [(org)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
                reviews: [
                  (org)-[:HAS_REVIEW]->(review:OrgReview) | review {
                    compensation: {
                      salary: review.salary,
                      currency: review.currency,
                      offersTokenAllocation: review.offersTokenAllocation
                    },
                    rating: {
                      onboarding: review.onboarding,
                      careerGrowth: review.careerGrowth,
                      benefits: review.benefits,
                      workLifeBalance: review.workLifeBalance,
                      diversityInclusion: review.diversityInclusion,
                      management: review.management,
                      product: review.product,
                      compensation: review.compensation
                    },
                    review: {
                      title: review.title,
                      location: review.location,
                      timezone: review.timezone,
                      pros: review.pros,
                      cons: review.cons
                    },
                    reviewedTimestamp: review.reviewedTimestamp
                  }
                ]
              }
            ]
          } as ecosystem
        `,
        { orgId },
      );
      return {
        success: true,
        message: "Retrieved all ecosystems successfully",
        data: result.records.map(record => {
          const ecosystem = record.get("ecosystem");
          return new OrganizationEcosystemWithOrgs({
            ...ecosystem,
            createdTimestamp: nonZeroOrNull(ecosystem.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(ecosystem.updatedTimestamp),
            orgs: ecosystem.orgs.map(org => {
              const lastFundingRound = sort(
                org.fundingRounds as FundingRound[],
              ).desc(x => x.date)[0];
              return new ShortOrgWithSummaryEntity({
                ...org,
                reviewCount: org.reviews.length,
                aggregateRating: generateOrgAggregateRating(
                  generateOrgAggregateRatings(
                    org.reviews.map((x: OrgReview) => x.rating),
                  ),
                ),
                lastFundingAmount: lastFundingRound?.raisedAmount ?? 0,
                lastFundingDate: lastFundingRound?.date ?? 0,
              }).getProperties();
            }),
          });
        }),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(error);
      });
      this.logger.error(`EcosystemsService::findAll ${error.message}`);
      return {
        success: false,
        message: "Failed to retrieve ecosystems",
      };
    }
  }

  async findAllStoredFilters(
    orgId: string,
    address: string,
  ): Promise<ResponseWithOptionalData<StoredFilter[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_STORED_FILTER]->(filter:StoredFilter)
          WHERE filter.public = true OR EXISTS((filter)<-[:CREATED_STORED_FILTER]-(:User {wallet: $address}))
          RETURN filter { .* } as filter
        `,
        { orgId, address },
      );
      return {
        success: true,
        message: "Retrieved all stored filters successfully",
        data: result.records.map(record => {
          const filter = record.get("filter");
          return new StoredFilter({
            ...filter,
            createdTimestamp: nonZeroOrNull(filter.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(filter.updatedTimestamp),
          });
        }),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(error);
      });
      this.logger.error(
        `EcosystemsService::findAllStoredFilters ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve stored filters",
      };
    }
  }

  async findStoredFilterById(
    id: string,
    address: string,
    orgId: string,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_STORED_FILTER]->(filter:StoredFilter {id: $id})
          WHERE filter.public = true OR EXISTS((filter)<-[:CREATED_STORED_FILTER]-(:User {wallet: $address}))
          RETURN filter { .* } as filter
        `,
        { orgId, id, address },
      );
      const filter = result.records[0].get("filter");
      if (filter) {
        return {
          success: true,
          message: "Retrieved stored filter successfully",
          data: new StoredFilter({
            ...filter,
            createdTimestamp: nonZeroOrNull(filter.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(filter.updatedTimestamp),
          }),
        };
      } else {
        return {
          success: false,
          message: "Failed to retrieve stored filter",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(error);
      });
      this.logger.error(
        `EcosystemsService::findStoredFilterById ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve stored filter",
      };
    }
  }

  async findOrgIdByEcosystem(
    idOrSlug: string,
  ): Promise<ResponseWithOptionalData<string[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (ecosystem:OrganizationEcosystem)
          WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
          MATCH (org:Organization)-[:OWNS_ECOSYSTEM]->(ecosystem)
          RETURN org.orgId as orgId
        `,
        { idOrSlug },
      );
      return {
        success: true,
        message: "Retrieved ecosystem owner orgId successfully",
        data: result.records[0].get("orgId"),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", idOrSlug);
        Sentry.captureException(error);
      });
      this.logger.error(
        `EcosystemsService::findOrgIdByEcosystem ${error.message}`,
      );
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (:Organization {orgId: $orgId})-[:OWNS_ECOSYSTEM]->(ecosystem:OrganizationEcosystem)
          WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
          RETURN ecosystem {
            .*,
            orgs: [
              (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem) | org {
                orgId: org.orgId,
                name: org.name,
                summary: org.summary,
                normalizedName: org.normalizedName,
                url: [(org)-[:HAS_WEBSITE]->(website) | website.url][0],
                logoUrl: org.logoUrl,
                summary: org.summary,
                location: org.location,
                projectCount: apoc.coll.sum([(org)-[:HAS_PROJECT]->(project:Project) | 1]),
                headcountEstimate: org.headcountEstimate,
                fundingRounds: apoc.coll.toSet([
                  (org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                ]),
                grants: [(org)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                  .*,
                  programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                }],
                ecosystems: [(org)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
                reviews: [
                  (org)-[:HAS_REVIEW]->(review:OrgReview) | review {
                    compensation: {
                      salary: review.salary,
                      currency: review.currency,
                      offersTokenAllocation: review.offersTokenAllocation
                    },
                    rating: {
                      onboarding: review.onboarding,
                      careerGrowth: review.careerGrowth,
                      benefits: review.benefits,
                      workLifeBalance: review.workLifeBalance,
                      diversityInclusion: review.diversityInclusion,
                      management: review.management,
                      product: review.product,
                      compensation: review.compensation
                    },
                    review: {
                      title: review.title,
                      location: review.location,
                      timezone: review.timezone,
                      pros: review.pros,
                      cons: review.cons
                    },
                    reviewedTimestamp: review.reviewedTimestamp
                  }
                ]
              }
            ]
          } as ecosystem
        `,
        { orgId, idOrSlug },
      );
      const ecosystem = result.records[0]?.get("ecosystem");
      if (ecosystem) {
        return {
          success: true,
          message: "Retrieved ecosystem successfully",
          data: new OrganizationEcosystemWithOrgs({
            ...ecosystem,
            createdTimestamp: nonZeroOrNull(ecosystem.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(ecosystem.updatedTimestamp),
            orgs: ecosystem.orgs.map(org => {
              const lastFundingRound = sort(
                org.fundingRounds as FundingRound[],
              ).desc(x => x.date)[0];
              return new ShortOrgWithSummaryEntity({
                ...org,
                reviewCount: org.reviews.length,
                aggregateRating: generateOrgAggregateRating(
                  generateOrgAggregateRatings(
                    org.reviews.map((x: OrgReview) => x.rating),
                  ),
                ),
                lastFundingAmount: lastFundingRound?.raisedAmount ?? 0,
                lastFundingDate: lastFundingRound?.date ?? 0,
              }).getProperties();
            }),
          }),
        };
      } else {
        return {
          success: false,
          message: "Ecosystem not found",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", idOrSlug);
        Sentry.captureException(error);
      });
      this.logger.error(`EcosystemsService::findOne ${error.message}`);
      return {
        success: false,
        message: "Failed to retrieve ecosystem",
      };
    }
  }

  async update(
    orgId: string,
    idOrSlug: string,
    updateEcosystemDto: UpdateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    try {
      const existing = data(await this.findOne(orgId, idOrSlug));
      if (!existing) return { success: false, message: "Ecosystem not found" };
      const check = await this.neogma.queryRunner.run(
        `
          RETURN EXISTS {MATCH (:OrganizationEcosystem {normalizedName: $normalizedName})} AS existing
        `,
        { normalizedName: slugify(updateEcosystemDto.name) },
      );
      const updatedNameExists = check.records[0].get("existing") as boolean;
      if (updatedNameExists) {
        throw new BadRequestException({
          success: false,
          message: "This ecosystem name is not available",
        });
      }
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (ecosystem:OrganizationEcosystem)
          WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
          SET ecosystem.name = $name
          SET ecosystem.updatedTimestamp = timestamp()
          SET ecosystem.normalizedName = $normalizedname
          RETURN ecosystem { .* } as ecosystem
        `,
        {
          idOrSlug,
          ...updateEcosystemDto,
          normalizedname: slugify(updateEcosystemDto.name),
        },
      );
      const ecosystem = result.records[0].get("ecosystem");
      if (ecosystem) {
        return {
          success: true,
          message: "Updated ecosystem successfully",
          data: new OrganizationEcosystem({
            ...existing,
            createdTimestamp: nonZeroOrNull(existing.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(existing.updatedTimestamp),
          }),
        };
      } else {
        return {
          success: false,
          message: "Failed to update ecosystem",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", updateEcosystemDto);
        Sentry.captureException(error);
      });
      this.logger.error(`EcosystemsService::update ${error.message}`);
      return {
        success: false,
        message: "Failed to update ecosystem",
      };
    }
  }

  async updateStoredFilter(
    orgId: string,
    address: string,
    id: string,
    updateStoredFilterDto: UpdateStoredFilterDto,
  ): Promise<ResponseWithOptionalData<StoredFilter>> {
    try {
      const result1 = await this.neogma.queryRunner.run(
        `
        RETURN EXISTS((:Organization {orgId: $orgId})-[:HAS_STORED_FILTER]->(:StoredFilter {id: $id})<-[:CREATED_STORED_FILTER]-(:User {wallet: $address})) as exists
        `,
        { id, orgId, address },
      );
      const isOwner = result1.records[0].get("exists");
      if (!isOwner) {
        return {
          success: false,
          message:
            "You do not have permission to update this stored filter or it does not exist",
        };
      }
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (filter:StoredFilter {id: $id})
          SET filter.name = $name
          SET filter.filter = $filter
          SET filter.public = $public
          SET filter.updatedTimestamp = timestamp()
          RETURN filter { .* } as filter
        `,
        {
          orgId,
          address,
          id,
          ...updateStoredFilterDto,
        },
      );
      const filter = result.records[0].get("filter");
      if (filter) {
        return {
          success: true,
          message: "Updated stored filter successfully",
          data: new StoredFilter({
            ...filter,
            createdTimestamp: nonZeroOrNull(filter.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(filter.updatedTimestamp),
          }),
        };
      } else {
        return {
          success: false,
          message: "Failed to update stored filter",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", updateStoredFilterDto);
        Sentry.captureException(error);
      });
      this.logger.error(
        `EcosystemsService::updateStoredFilter ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to update stored filter",
      };
    }
  }

  async remove(orgId: string, idOrSlug: string): Promise<ResponseWithNoData> {
    const ecosystem = data(await this.findOne(orgId, idOrSlug));
    if (ecosystem) {
      try {
        await this.neogma.queryRunner.run(
          `
            MATCH (ecosystem:OrganizationEcosystem)
            WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
            DETACH DELETE ecosystem
          `,
          { idOrSlug },
        );
        return {
          success: true,
          message: "Deleted ecosystem successfully",
        };
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "ecosystems.service",
          });
          scope.setExtra("input", idOrSlug);
          Sentry.captureException(error);
        });
        this.logger.error(`EcosystemsService::remove ${error.message}`);
        return {
          success: false,
          message: "Failed to delete ecosystem",
        };
      }
    } else {
      return {
        success: false,
        message: "Ecosystem not found",
      };
    }
  }

  async removeStoredFilter(
    orgId: string,
    address: string,
    id: string,
  ): Promise<ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        RETURN EXISTS((:Organization {orgId: $orgId})-[:HAS_STORED_FILTER]->(:StoredFilter {id: $id})<-[:CREATED_STORED_FILTER]-(:User {wallet: $address})) as exists
        `,
        { id, orgId, address },
      );
      const isOwner = result.records[0].get("exists");
      if (!isOwner) {
        return {
          success: false,
          message:
            "You do not have permission to delete this stored filter or it does not exist",
        };
      }
      await this.neogma.queryRunner.run(
        `
          MATCH (:Organization {orgId: $orgId})-[:HAS_STORED_FILTER]->(filter:StoredFilter {id: $id})<-[:CREATED_STORED_FILTER]-(:User {wallet: $address})
          DETACH DELETE filter
          `,
        { id, orgId, address },
      );
      return {
        success: true,
        message: "Deleted stored filter successfully",
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", id);
        Sentry.captureException(error);
      });
      this.logger.error(
        `EcosystemsService::removeStoredFilter ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to delete stored filter",
      };
    }
  }

  async updateEcosystemOrgs(
    orgId: string,
    idOrSlug: string,
    dto: UpdateEcosystemOrgsDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystemWithOrgs>> {
    try {
      const existing = data(await this.findOne(orgId, idOrSlug));
      if (!existing) return { success: false, message: "Ecosystem not found" };
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (ecosystem:OrganizationEcosystem)
          WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
          OPTIONAL MATCH (ecosystem)<-[r:IS_MEMBER_OF_ECOSYSTEM]-(org:Organization)
          DELETE r

          WITH ecosystem
          MATCH (organization:Organization WHERE organization.orgId IN $orgIds)
          MERGE (organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem)
          RETURN ecosystem {
            .*,
            orgs: [
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM]-(org) | org {
                orgId: org.orgId,
                name: org.name,
                summary: org.summary,
                normalizedName: org.normalizedName,
                url: [(org)-[:HAS_WEBSITE]->(website) | website.url][0],
                logoUrl: org.logoUrl,
                summary: org.summary,
                location: org.location,
                projectCount: apoc.coll.sum([(org)-[:HAS_PROJECT]->(project:Project) | 1]),
                headcountEstimate: org.headcountEstimate,
                fundingRounds: apoc.coll.toSet([
                  (org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                ]),
                grants: [(org)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                  .*,
                  programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                }],
                ecosystems: [(org)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
                reviews: [
                  (org)-[:HAS_REVIEW]->(review:OrgReview) | review {
                    compensation: {
                      salary: review.salary,
                      currency: review.currency,
                      offersTokenAllocation: review.offersTokenAllocation
                    },
                    rating: {
                      onboarding: review.onboarding,
                      careerGrowth: review.careerGrowth,
                      benefits: review.benefits,
                      workLifeBalance: review.workLifeBalance,
                      diversityInclusion: review.diversityInclusion,
                      management: review.management,
                      product: review.product,
                      compensation: review.compensation
                    },
                    review: {
                      title: review.title,
                      location: review.location,
                      timezone: review.timezone,
                      pros: review.pros,
                      cons: review.cons
                    },
                    reviewedTimestamp: review.reviewedTimestamp
                  }
                ]
              }
            ]
          } as ecosystem
        `,
        { ...dto, idOrSlug },
      );
      const ecosystem = result.records[0].get("ecosystem");
      return {
        success: true,
        message: "Updated organization ecosystem successfully",
        data: new OrganizationEcosystemWithOrgs({
          ...ecosystem,
          createdTimestamp: nonZeroOrNull(ecosystem.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(ecosystem.updatedTimestamp),
          orgs:
            ecosystem?.orgs?.map(org => {
              const lastFundingRound = sort(
                org.fundingRounds as FundingRound[],
              ).desc(x => x.date)[0];
              return new ShortOrgWithSummaryEntity({
                ...org,
                reviewCount: org.reviews.length,
                aggregateRating: generateOrgAggregateRating(
                  generateOrgAggregateRatings(
                    org.reviews.map((x: OrgReview) => x.rating),
                  ),
                ),
                lastFundingAmount: lastFundingRound?.raisedAmount ?? 0,
                lastFundingDate: lastFundingRound?.date ?? 0,
              }).getProperties();
            }) ?? [],
        }),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", dto);
        Sentry.captureException(err);
      });
      this.logger.error(
        `EcosystemsService::updateEcosystemOrgs ${err.message}`,
      );
      return { success: false, message: "Failed to update ecosystem orgs" };
    }
  }

  getJobsListResults = async (
    ecosystems: string[],
  ): Promise<EcosystemJobListResult[]> => {
    const results: EcosystemJobListResult[] = [];
    const generatedQuery = `
        CYPHER runtime = parallel
        MATCH (structured_jobpost:StructuredJobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(:Organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem:OrganizationEcosystem WHERE ecosystem.normalizedName IN $ecosystems)
        MATCH (structured_jobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        WITH DISTINCT tag, structured_jobpost
        OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
        OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
        WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
        WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
        WITH DISTINCT canonicalTag as tag, structured_jobpost
        WITH COLLECT(tag { .* }) as tags, structured_jobpost
        RETURN structured_jobpost {
            id: structured_jobpost.id,
            url: structured_jobpost.url,
            title: structured_jobpost.title,
            access: structured_jobpost.access,
            salary: structured_jobpost.salary,
            culture: structured_jobpost.culture,
            location: structured_jobpost.location,
            summary: structured_jobpost.summary,
            benefits: structured_jobpost.benefits,
            shortUUID: structured_jobpost.shortUUID,
            seniority: structured_jobpost.seniority,
            description: structured_jobpost.description,
            requirements: structured_jobpost.requirements,
            paysInCrypto: structured_jobpost.paysInCrypto,
            minimumSalary: structured_jobpost.minimumSalary,
            maximumSalary: structured_jobpost.maximumSalary,
            salaryCurrency: structured_jobpost.salaryCurrency,
            onboardIntoWeb3: structured_jobpost.onboardIntoWeb3,
            ethSeasonOfInternships: structured_jobpost.ethSeasonOfInternships,
            responsibilities: structured_jobpost.responsibilities,
            featured: structured_jobpost.featured,
            featureStartDate: structured_jobpost.featureStartDate,
            featureEndDate: structured_jobpost.featureEndDate,
            blocked: EXISTS((structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)),
            online: EXISTS((structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)),
            applications: apoc.coll.sum([(structured_jobpost)<-[:APPLIED_TO]-(:User) | 1]),
            views: apoc.coll.sum([(structured_jobpost)<-[:VIEWED_DETAILS]-(:User) | 1]),
            timestamp: CASE WHEN structured_jobpost.publishedTimestamp IS NULL THEN structured_jobpost.firstSeenTimestamp ELSE structured_jobpost.publishedTimestamp END,
            offersTokenAllocation: structured_jobpost.offersTokenAllocation,
            classification: [(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name ][0],
            commitment: [(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name ][0],
            locationType: [(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name ][0],
            organization: [(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(organization:Organization) | organization {
                .*,
                atsClient: [(organization)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
                hasUser: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
                discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                aliases: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(alias) | alias.name],
                twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                projects: [
                  (organization)-[:HAS_PROJECT]->(project) | project {
                    .*,
                    orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                    discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                    website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                    docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                    telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                    github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                    category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                    twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                    hacks: [
                      (project)-[:HAS_HACK]->(hack) | hack { .* }
                    ],
                    audits: [
                      (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                    ],
                    chains: [
                      (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                    ],
                    ecosystems: [
                      (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                    ],
                    investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                    fundingRounds: [
                      (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                    ],
                    grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                      .*,
                      programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                    }]
                  }
                ],
                fundingRounds: apoc.coll.toSet([
                        (organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                ]),
                grants: [(organization)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                  .*,
                  programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                }],
                investors: apoc.coll.toSet([
                  (organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor) | investor { .* }
                ]),
                ecosystems: [(organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem) | ecosystem.name],
                reviews: [
                  (organization)-[:HAS_REVIEW]->(review:OrgReview) | review {
                    compensation: {
                      salary: review.salary,
                      currency: review.currency,
                      offersTokenAllocation: review.offersTokenAllocation
                    },
                    rating: {
                      onboarding: review.onboarding,
                      careerGrowth: review.careerGrowth,
                      benefits: review.benefits,
                      workLifeBalance: review.workLifeBalance,
                      diversityInclusion: review.diversityInclusion,
                      management: review.management,
                      product: review.product,
                      compensation: review.compensation
                    },
                    review: {
                      title: review.title,
                      location: review.location,
                      timezone: review.timezone,
                      pros: review.pros,
                      cons: review.cons
                    },
                    reviewedTimestamp: review.reviewedTimestamp
                  }
                ]
            }][0],
            project: [
              (structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(project:Project) | project {
                .*,
                atsClient: [(project)-[:HAS_ATS_CLIENT]->(atsClient:AtsClient) | atsClient.name][0],
                hasUser: CASE WHEN EXISTS((:User)-[:HAS_PROJECT_AUTHORIZATION]->(project)) THEN true ELSE false END,
                orgIds: [(org: Organization)-[:HAS_PROJECT]->(project) | org.orgId],
                discord: [(project)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                website: [(project)-[:HAS_WEBSITE]->(website) | website.url][0],
                docs: [(project)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                telegram: [(project)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                github: [(project)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                category: [(project)-[:HAS_CATEGORY]->(category) | category.name][0],
                twitter: [(project)-[:HAS_TWITTER]->(twitter) | twitter.username][0],
                hacks: [
                  (project)-[:HAS_HACK]->(hack) | hack { .* }
                ],
                audits: [
                  (project)-[:HAS_AUDIT]->(audit) | audit { .* }
                ],
                chains: [
                  (project)-[:IS_DEPLOYED_ON]->(chain) | chain { .* }
                ],
                ecosystems: [
                  (project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem) | ecosystem.name
                ],
                investors: [(project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor { .* }],
                fundingRounds: [
                  (project)<-[:HAS_PROJECT]-(organization: Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round { .* }
                ],
                grants: [(project)-[:HAS_GRANT_FUNDING]->(funding: GrantFunding) | funding {
                  .*,
                  programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                }]
              }
            ][0],
            tags: apoc.coll.toSet(tags)
        } AS result
      `;

    try {
      const queryResult = await this.neogma.queryRunner.run(generatedQuery, {
        ecosystems,
      });
      const resultSet = queryResult.records.map(
        record => record.get("result") as EcosystemJobListResult,
      );
      for (const result of resultSet) {
        results.push(new EcosystemJobListResultEntity(result).getProperties());
      }
      this.logger.log(`Found ${results.length} jobs`);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`EcosystemService::getJobsListResults ${err.message}`);
    }

    return results;
  };

  async getJobsListWithSearch(
    params: EcosystemJobListParams & { ecosystems: string[] },
  ): Promise<PaginatedData<EcosystemJobListResult>> {
    const paramsPassed = {
      ...publicationDateRangeGenerator(params.publicationDate as DateRange),
      ...params,
      limit: params.limit ?? 10,
      page: params.page ?? 1,
    };
    const {
      minTvl,
      maxTvl,
      minMonthlyVolume,
      maxMonthlyVolume,
      minMonthlyFees,
      maxMonthlyFees,
      minMonthlyRevenue,
      maxMonthlyRevenue,
      minSalaryRange,
      maxSalaryRange,
      minHeadCount,
      maxHeadCount,
      startDate,
      endDate,
      seniority: seniorityFilterList,
      locations: locationFilterList,
      tags: tagFilterList,
      audits: auditFilter,
      hacks: hackFilter,
      chains: chainFilterList,
      projects: projectFilterList,
      organizations: organizationFilterList,
      investors: investorFilterList,
      fundingRounds: fundingRoundFilterList,
      classifications: classificationFilterList,
      commitments: commitmentFilterList,
      token,
      onboardIntoWeb3,
      ethSeasonOfInternships,
      query,
      order,
      orderBy,
      page,
      limit,
      online,
      blocked,
      ecosystems,
    } = paramsPassed;

    const results: EcosystemJobListResult[] = [];

    try {
      const jobs = await this.getJobsListResults(ecosystems);
      results.push(...jobs);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", params);
        Sentry.captureException(err);
      });
      this.logger.error(
        `EcosystemsService::getJobsListWithSearch ${err.message}`,
      );
      return {
        page: -1,
        count: 0,
        total: 0,
        data: [],
      };
    }

    const projectBasedFilters = (
      projects: ProjectWithBaseRelations[],
    ): boolean => {
      return (
        (!projectFilterList ||
          projects.filter(x => projectFilterList.includes(slugify(x.name)))
            .length > 0) &&
        (token === null ||
          projects.filter(x => notStringOrNull(x.tokenAddress) !== null)
            .length > 0) &&
        (!minTvl || projects.filter(x => (x?.tvl ?? 0) >= minTvl).length > 0) &&
        (!maxTvl || projects.filter(x => (x?.tvl ?? 0) < maxTvl).length > 0) &&
        (!minMonthlyVolume ||
          projects.filter(x => (x?.monthlyVolume ?? 0) >= minMonthlyVolume)
            .length > 0) &&
        (!maxMonthlyVolume ||
          projects.filter(x => (x?.monthlyVolume ?? 0) < maxMonthlyVolume)
            .length > 0) &&
        (!minMonthlyFees ||
          projects.filter(x => (x?.monthlyFees ?? 0) >= minMonthlyFees).length >
            0) &&
        (!maxMonthlyFees ||
          projects.filter(x => (x?.monthlyFees ?? 0) < maxMonthlyFees).length >
            0) &&
        (!minMonthlyRevenue ||
          projects.filter(x => (x?.monthlyRevenue ?? 0) >= minMonthlyRevenue)
            .length > 0) &&
        (!maxMonthlyRevenue ||
          projects.filter(x => (x?.monthlyRevenue ?? 0) < maxMonthlyRevenue)
            .length > 0) &&
        (auditFilter === null ||
          projects.filter(x => x.audits.length > 0).length > 0 ===
            auditFilter) &&
        (hackFilter === null ||
          projects.filter(x => x.hacks.length > 0).length > 0 === hackFilter) &&
        (!chainFilterList ||
          uniq(projects.flatMap(x => x.chains)).filter(x =>
            chainFilterList.includes(slugify(x.name)),
          ).length > 0)
      );
    };

    const orgBasedFilters = (jlr: EcosystemJobListResult): boolean => {
      const filters = [
        minHeadCount,
        maxHeadCount,
        organizationFilterList,
        investorFilterList,
        fundingRoundFilterList,
        projectFilterList,
        token,
        minTvl,
        maxTvl,
        minMonthlyVolume,
        maxMonthlyVolume,
        minMonthlyFees,
        maxMonthlyFees,
        minMonthlyRevenue,
        maxMonthlyRevenue,
        auditFilter,
        hackFilter,
        chainFilterList,
      ].filter(Boolean);
      const jobFromOrg = !!jlr.organization;
      const filtersApplied = filters.length > 0;

      if (!filtersApplied) return true;
      if (filtersApplied && !jobFromOrg) return false;

      const {
        projects,
        investors,
        fundingRounds,
        name: orgName,
        headcountEstimate,
      } = jlr.organization;
      const {
        tags,
        seniority,
        locationType,
        classification,
        commitment,
        salary,
        salaryCurrency,
        timestamp,
      } = jlr;

      return (
        projectBasedFilters(projects) &&
        (!organizationFilterList ||
          organizationFilterList.includes(slugify(orgName))) &&
        (!seniorityFilterList ||
          seniorityFilterList.includes(slugify(seniority))) &&
        (!locationFilterList ||
          locationFilterList.includes(slugify(locationType))) &&
        (!minHeadCount || (headcountEstimate ?? 0) >= minHeadCount) &&
        (!maxHeadCount || (headcountEstimate ?? 0) < maxHeadCount) &&
        (!minSalaryRange ||
          ((salary ?? 0) >= minSalaryRange && salaryCurrency === "USD")) &&
        (!maxSalaryRange ||
          ((salary ?? 0) < maxSalaryRange && salaryCurrency === "USD")) &&
        (!startDate || timestamp >= startDate) &&
        (!endDate || timestamp < endDate) &&
        (!commitmentFilterList ||
          commitmentFilterList.includes(slugify(commitment))) &&
        (!classificationFilterList ||
          classificationFilterList.includes(slugify(classification))) &&
        (!investorFilterList ||
          investors.filter(investor =>
            investorFilterList.includes(slugify(investor.name)),
          ).length > 0) &&
        (!fundingRoundFilterList ||
          fundingRoundFilterList.includes(
            slugify(
              sort<FundingRound>(fundingRounds).desc(x => x.date)[0]?.roundName,
            ),
          )) &&
        (!tagFilterList ||
          tags.filter(tag => tagFilterList.includes(slugify(tag.name))).length >
            0)
      );
    };

    const jobFilters = (jlr: EcosystemJobListResult): boolean => {
      const {
        title,
        tags,
        seniority,
        locationType,
        classification,
        commitment,
        salary,
        salaryCurrency,
        timestamp,
        project,
        organization,
      } = jlr;

      const searchSpace = [
        title,
        jlr?.project?.name,
        organization?.name,
        ...tags.map(x => x.name),
        ...(organization?.aliases ?? []),
        ...(organization?.projects?.map(x => x.name) ?? []),
      ].filter(Boolean);

      const matching = query
        ? go(query, searchSpace, {
            threshold: 0.3,
          }).map(s => s.target)
        : [];

      const matchesQuery = matching.length > 0;

      return (
        (!organization || orgBasedFilters(jlr)) &&
        (!project || projectBasedFilters([project].filter(Boolean))) &&
        (!locationFilterList ||
          locationFilterList.includes(slugify(locationType))) &&
        (!seniorityFilterList ||
          seniorityFilterList.includes(slugify(seniority))) &&
        (!minSalaryRange ||
          ((salary ?? 0) >= minSalaryRange && salaryCurrency === "USD")) &&
        (!maxSalaryRange ||
          ((salary ?? 0) < maxSalaryRange && salaryCurrency === "USD")) &&
        (!startDate || timestamp >= startDate) &&
        (!endDate || timestamp < endDate) &&
        (!classificationFilterList ||
          classificationFilterList.includes(slugify(classification))) &&
        (!commitmentFilterList ||
          commitmentFilterList.includes(slugify(commitment))) &&
        (onboardIntoWeb3 === null || jlr.onboardIntoWeb3 === onboardIntoWeb3) &&
        (ethSeasonOfInternships === null ||
          jlr.ethSeasonOfInternships === ethSeasonOfInternships) &&
        (!query || matchesQuery) &&
        (!tagFilterList ||
          tags.filter(tag => tagFilterList.includes(slugify(tag.name))).length >
            0) &&
        (!online || online === jlr.online) &&
        (!blocked || blocked === jlr.blocked)
      );
    };

    const filtered = results
      .filter(jobFilters)
      .map(x => new EcosystemJobListResultEntity(x).getProperties());

    const getSortParam = (jlr: EcosystemJobListResult): number => {
      const p1 =
        jlr?.organization?.projects.sort(
          (a, b) => b.monthlyVolume - a.monthlyVolume,
        )[0] ?? null;
      switch (orderBy) {
        case "audits":
          return p1?.audits?.length ?? 0;
        case "hacks":
          return p1?.hacks?.length ?? 0;
        case "chains":
          return p1?.chains?.length ?? 0;
        case "tvl":
          return p1?.tvl ?? 0;
        case "monthlyVolume":
          return p1?.monthlyVolume ?? 0;
        case "monthlyFees":
          return p1?.monthlyFees ?? 0;
        case "monthlyRevenue":
          return p1?.monthlyRevenue ?? 0;
        case "fundingDate":
          return (
            sort<FundingRound>(jlr?.organization?.fundingRounds ?? []).desc(
              x => x.date,
            )[0]?.date ?? 0
          );
        case "headcountEstimate":
          return jlr?.organization?.headcountEstimate ?? 0;
        case "publicationDate":
          return jlr.timestamp;
        case "salary":
          return jlr.salary;
        default:
          return jlr.timestamp;
      }
    };

    let final = [];
    if (!order || order === "desc") {
      final = sort<EcosystemJobListResult>(filtered).by([
        { desc: (job): boolean => job.featured },
        { asc: (job): number => job.featureStartDate },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { desc: (job): number => getSortParam(job) },
      ]);
    } else {
      final = sort<EcosystemJobListResult>(filtered).by([
        { desc: (job): boolean => job.featured },
        { asc: (job): number => job.featureStartDate },
        {
          desc: (job): number =>
            differenceInHours(job.featureEndDate, job.featureStartDate),
        },
        { asc: (job): number => getSortParam(job) },
      ]);
    }

    this.logger.log(`Sorted ${final.length} jobs`);

    return paginate<EcosystemJobListResult>(page, limit, final);
  }

  async getFilterConfigs(
    ecosystems: string[],
  ): Promise<EcosystemJobFilterConfigs> {
    try {
      const popularity =
        this.configService.get<string>("SKILL_THRESHOLD") ?? null;
      const tags = (await this.tagsService.getPopularTags(100)).map(
        x => x.name,
      );
      const result = await this.neogma.queryRunner
        .run(
          `
            CYPHER runtime = parallel
            RETURN {
              maxTvl: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.tvl
              ]),
                    
              minTvl: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.tvl
              ]),
                    
              minMonthlyVolume: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.monthlyVolume
              ]),
                    
              maxMonthlyVolume: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.monthlyVolume
              ]),
                    
              minMonthlyFees: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.monthlyFees
              ]),
                    
              maxMonthlyFees: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.monthlyFees
              ]),
                    
              minMonthlyRevenue: apoc.coll.min([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.monthlyRevenue
              ]),
                    
              maxMonthlyRevenue: apoc.coll.max([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                  | project.monthlyRevenue
              ]),
                    
              minSalaryRange: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]
                    ->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND j.salaryCurrency CONTAINS "USD"
                  | j.salary
              ]),
                    
              maxSalaryRange: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]
                    ->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND j.salaryCurrency CONTAINS "USD"
                  | j.salary
              ]),
                    
              minHeadCount: apoc.coll.min([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                    ->(:JobpostOnlineStatus)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                  | org.headcountEstimate
              ]),
                    
              maxHeadCount: apoc.coll.max([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                    ->(:JobpostOnlineStatus)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                  | org.headcountEstimate
              ]),
                    
              fundingRounds: apoc.coll.toSet([
                (org:Organization)-[:HAS_FUNDING_ROUND]->(round:FundingRound)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                  | round.roundName
              ]),
                    
              investors: apoc.coll.toSet([
                (org:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                  | investor.name
              ]),
                    
              ecosystems: apoc.coll.toSet([
                (org:Organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem:Ecosystem)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                  | ecosystem.name
              ]),
                    
              projects: apoc.coll.toSet([
                (org)-[:HAS_PROJECT]->(project:Project)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                  | project.name
              ]),
                    
              classifications: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]
                    ->(j:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                  | classification.name
              ]),
                    
              commitments: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]
                    ->(j:StructuredJobpost)-[:HAS_COMMITMENT]->(commitment:JobpostCommitment)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                  | commitment.name
              ]),
                    
              chains: apoc.coll.toSet([
                (org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain:Chain)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST
                                   |HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
                    AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                        ->(:JobpostOnlineStatus)
                  | chain.name
              ]),
                    
              locations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]
                    ->(j:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(location:JobpostLocationType)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND (j)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                  | location.name
              ]),
                    
              organizations: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]
                    ->(:JobpostOnlineStatus)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                  | org.name
              ]),
                    
              seniority: apoc.coll.toSet([
                (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]
                    ->(j:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
                  WHERE EXISTS {
                          (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(orgEco:OrganizationEcosystem)
                          WHERE orgEco.normalizedName IN $ecosystems
                        }
                    AND j.seniority IS NOT NULL
                  | j.seniority
              ])
            } AS res;
          `,
          { ecosystems, popularity },
        )
        .then(res =>
          res.records.length
            ? new EcosystemJobFilterConfigsEntity({
                ...res.records[0].get("res"),
                tags,
              }).getProperties()
            : undefined,
        );
      return result;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`EcosystemsService::getFilterConfigs ${err.message}`);
      return undefined;
    }
  }
}
