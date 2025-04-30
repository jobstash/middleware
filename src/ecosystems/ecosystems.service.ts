import { Injectable } from "@nestjs/common";
import { CreateEcosystemDto } from "./dto/create-ecosystem.dto";
import { UpdateEcosystemDto } from "./dto/update-ecosystem.dto";
import { UpdateEcosystemOrgsDto } from "./dto/update-ecosystem-orgs.dto";
import {
  data,
  FundingRound,
  OrganizationEcosystem,
  OrganizationEcosystemWithOrgs,
  OrgReview,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { InjectConnection } from "nestjs-neogma";
import { Neogma } from "neogma";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  generateOrgAggregateRatings,
  nonZeroOrNull,
  slugify,
} from "src/shared/helpers";
import { sort } from "fast-sort";
import { ShortOrgEntity } from "src/shared/entities";

@Injectable()
export class EcosystemsService {
  private readonly logger = new CustomLogger(EcosystemsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async create(
    orgId: string,
    createEcosystemDto: CreateEcosystemDto,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem>> {
    try {
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
        return {
          success: false,
          message: "Failed to create ecosystem",
        };
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
      return {
        success: false,
        message: "Failed to create ecosystem",
      };
    }
  }

  async findAll(
    orgId: string,
  ): Promise<ResponseWithOptionalData<OrganizationEcosystem[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:OWNS_ECOSYSTEM]->(ecosystem:OrganizationEcosystem)
          RETURN ecosystem { .* } as ecosystem
        `,
        { orgId },
      );
      return {
        success: true,
        message: "Retrieved all ecosystems successfully",
        data: result.records.map(record => {
          const ecosystem = record.get("ecosystem");
          return new OrganizationEcosystem({
            ...ecosystem,
            createdTimestamp: nonZeroOrNull(ecosystem.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(ecosystem.updatedTimestamp),
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
          MATCH (org:Organization {orgId: $orgId})-[:OWNS_ECOSYSTEM]->(ecosystem:OrganizationEcosystem)
          WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
          RETURN ecosystem {
            .*
            orgs: [
              (ecosystem)<-[:IS_MEMBER_OF_ECOSYSTEM]-(org:Organization) | org {
                orgId: org.orgId,
                name: org.name,
                normalizedName: org.normalizedName,
                url: [(org)-[:HAS_WEBSITE]->(website) | website.url][0]
                logoUrl: org.logoUrl,
                summary: org.summary,
                location: org.location,
                projectCount: size((org)-[:HAS_PROJECT]->(:Project)),
                headcountEstimate: org.headcountEstimate,
                fundingRounds: apoc.coll.toSet([
                  (org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) WHERE funding_round.id IS NOT NULL | funding_round {.*}
                ]),
                grants: [(org)-[:HAS_PROJECT|HAS_GRANT_FUNDING*2]->(funding: GrantFunding) | funding {
                  .*,
                  programName: [(funding)-[:FUNDED_BY]->(prog) | prog.name][0]
                }],
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
      const ecosystem = result.records[0].get("ecosystem");
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
              return new ShortOrgEntity({
                ...org,
                reviewCount: org.reviews.length,
                aggregateRating: generateOrgAggregateRatings(
                  org.reviews.map((x: OrgReview) => x.rating),
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (ecosystem:OrganizationEcosystem)
          WHERE ecosystem.id = $idOrSlug OR ecosystem.normalizedName = $idOrSlug
          SET ecosystem.name = $name
          SET ecosystem.updatedTimestamp = timestamp()
          RETURN ecosystem { .* } as ecosystem
        `,
        { idOrSlug, ...updateEcosystemDto },
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
    }
  }

  async updateEcosystemOrgs(
    orgId: string,
    dto: UpdateEcosystemOrgsDto,
  ): Promise<ResponseWithNoData> {
    try {
      const ecosystem = data(await this.findOne(orgId, dto.ecosystem));
      if (!ecosystem) return { success: false, message: "Ecosystem not found" };
      await this.neogma.queryRunner.run(
        `
          MATCH (ecosystem:OrganizationEcosystem {normalizedName: $ecosystem})<-[r:IS_MEMBER_OF_ECOSYSTEM]-(org:Organization))
          DELETE r

          WITH  ecosystem
          MATCH (org:Organization WHERE org.orgId IN $orgIds)
          MERGE (org)-[:IS_MEMBER_OF_ECOSYSTEM]->(ecosystem)
        `,
        { ...dto },
      );
      return {
        success: true,
        message: "Updated organization ecosystem successfully",
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
}
