import { BadRequestException, Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { CreateWhiteLabelBoardDto } from "src/white-label-boards/dto/create-white-label-board.dto";
import { UpdateWhiteLabelBoardDto } from "src/white-label-boards/dto/update-white-label-board.dto";
import {
  nonZeroOrNull,
  notStringOrNull,
  toShortOrgWithSummary,
} from "src/shared/helpers";
import {
  ResponseWithOptionalData,
  data,
  ResponseWithNoData,
  ShortOrgWithSummary,
  OrgListResult,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import {
  WhiteLabelBoard,
  WhiteLabelBoardWithSource,
  OrganizationEcosystemWithOrgs,
} from "src/shared/interfaces/org";
import { EcosystemsService } from "src/ecosystems/ecosystems.service";
import { OrganizationsService } from "src/organizations/organizations.service";

@Injectable()
export class WhiteLabelBoardsService {
  private readonly logger = new CustomLogger(WhiteLabelBoardsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly ecosystemsService: EcosystemsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async create(
    orgId: string,
    createWhiteLabelBoardDto: CreateWhiteLabelBoardDto,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoard>> {
    try {
      const check =
        createWhiteLabelBoardDto.domain && createWhiteLabelBoardDto.route
          ? await this.neogma.queryRunner.run(
              `
                RETURN EXISTS {MATCH (:WhiteLabelBoard {domain: $domain, route: $route})} AS existing
              `,
              {
                domain: createWhiteLabelBoardDto.domain,
                route: createWhiteLabelBoardDto.route,
              },
            )
          : await this.neogma.queryRunner.run(
              `
                RETURN EXISTS {MATCH (:WhiteLabelBoard {route: $route})} AS existing
              `,
              { route: createWhiteLabelBoardDto.route },
            );
      const existing = check.records[0].get("existing") as boolean;
      if (existing) {
        throw new BadRequestException({
          success: false,
          message: "This white label board route is already taken",
        });
      }

      const source: OrgListResult | OrganizationEcosystemWithOrgs | null =
        createWhiteLabelBoardDto.sourceType === "organization"
          ? ((await this.organizationsService.getOrgDetailsBySlug(
              createWhiteLabelBoardDto.sourceSlug,
              undefined,
            )) ?? null)
          : data(
              await this.ecosystemsService.findOne(
                orgId,
                createWhiteLabelBoardDto.sourceSlug,
              ),
            );

      if (!source) {
        throw new BadRequestException({
          success: false,
          message: "Source not found",
        });
      }
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})
          MERGE (org)-[:HAS_WHITE_LABEL_BOARD]->(wlb:WhiteLabelBoard {route: $route})
          ON CREATE SET
            wlb.id = randomUUID(),
            wlb.name = $name,
            wlb.domain = $domain,
            wlb.visibility = $visibility,
            wlb.createdTimestamp = timestamp(),
            wlb.updatedTimestamp = timestamp()

          WITH wlb
          MATCH (source: Organization|OrganizationEcosystem {normalizedName: $sourceSlug})
          MERGE (wlb)-[r:HAS_SOURCE]->(source)
          ON CREATE SET
            r.type = $sourceType
          ON MATCH SET
            r.type = $sourceType
          RETURN wlb { .* } as wlb
        `,
        {
          orgId,
          ...createWhiteLabelBoardDto,
        },
      );
      const wlb = result.records[0].get("wlb");
      if (wlb) {
        return {
          success: true,
          message: "Created white label board successfully",
          data: new WhiteLabelBoardWithSource({
            ...wlb,
            domain: notStringOrNull(wlb.domain),
            createdTimestamp: nonZeroOrNull(wlb.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(wlb.updatedTimestamp),
            sourceType: createWhiteLabelBoardDto.sourceType,
            org:
              createWhiteLabelBoardDto.sourceType === "organization"
                ? toShortOrgWithSummary(source as OrgListResult)
                : null,
            ecosystem:
              createWhiteLabelBoardDto.sourceType === "ecosystem"
                ? (source as OrganizationEcosystemWithOrgs)
                : null,
          }),
        };
      } else {
        throw new BadRequestException({
          success: false,
          message: "Failed to create white label board for org",
        });
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "white-label-boards.service",
        });
        scope.setExtra("input", createWhiteLabelBoardDto);
        Sentry.captureException(error);
      });
      this.logger.error(`WhiteLabelBoardsService::create ${error.message}`);
      if (error instanceof BadRequestException) {
        throw new BadRequestException({
          success: false,
          message: error.message,
        });
      } else {
        return {
          success: false,
          message:
            "Failed to create white label board for org for unexpected reason",
        };
      }
    }
  }

  async findAll(
    orgId: string,
    isEcosystemManager: boolean,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_WHITE_LABEL_BOARD]->(wlb:WhiteLabelBoard)
          WHERE CASE WHEN $isEcosystemManager THEN true ELSE wlb.sourceType = 'organization' END
          MATCH (wlb)-[r:HAS_SOURCE]->(source)
          RETURN wlb {
            .*,
            sourceType: r.type,
            sourceId: CASE WHEN r.type = 'organization' THEN source.normalizedName ELSE source.id END
          } as wlb
        `,
        { orgId, isEcosystemManager },
      );
      return {
        success: true,
        message: "Retrieved all white label boards successfully",
        data: await Promise.all(
          result.records?.map(async record => {
            const wlb = record.get("wlb");
            const sourceType = wlb.sourceType;
            const sourceId = wlb.sourceId;

            let org: ShortOrgWithSummary | undefined = undefined;
            let ecosystem: OrganizationEcosystemWithOrgs | undefined =
              undefined;

            if (sourceType === "organization") {
              const source =
                await this.organizationsService.getOrgDetailsBySlug(
                  sourceId,
                  undefined,
                );
              org = toShortOrgWithSummary(source as OrgListResult);
            } else if (sourceType === "ecosystem") {
              ecosystem = data(
                await this.ecosystemsService.findOne(orgId, sourceId),
              );
            }

            return new WhiteLabelBoardWithSource({
              ...wlb,
              domain: notStringOrNull(wlb.domain),
              createdTimestamp: nonZeroOrNull(wlb.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(wlb.updatedTimestamp),
              sourceType,
              org: sourceType === "organization" ? org : null,
              ecosystem: sourceType === "ecosystem" ? ecosystem : null,
            });
          }) ?? [],
        ),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "white-label-boards.service",
        });
        scope.setExtra("input", orgId);
        Sentry.captureException(error);
      });
      this.logger.error(`WhiteLabelBoardsService::findAll ${error.message}`);
      return {
        success: false,
        message: "Failed to retrieve white label boards",
      };
    }
  }

  async findOrgIdByWhiteLabelBoard(
    routeOrDomain: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (wlb:WhiteLabelBoard)
          WHERE wlb.route = $routeOrDomain OR wlb.domain = $routeOrDomain
          MATCH (org:Organization)-[:HAS_WHITE_LABEL_BOARD]->(wlb)
          RETURN org.orgId as orgId
        `,
        { routeOrDomain },
      );
      return {
        success: true,
        message: "Retrieved white label board owner orgId successfully",
        data: result.records[0].get("orgId"),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "white-label-boards.service",
        });
        scope.setExtra("input", routeOrDomain);
        Sentry.captureException(error);
      });
      this.logger.error(
        `WhiteLabelBoardsService::findOrgIdByWhiteLabelBoard ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve white label board owner orgId",
      };
    }
  }

  async findOne(
    orgId: string,
    routeOrDomain: string,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (:Organization {orgId: $orgId})-[:HAS_WHITE_LABEL_BOARD]->(wlb:WhiteLabelBoard)
          WHERE wlb.route = $routeOrDomain OR wlb.domain = $routeOrDomain
          MATCH (wlb)-[r:HAS_SOURCE]->(source)
          RETURN wlb {
            .*,
            sourceType: r.type,
            sourceId: CASE WHEN r.type = 'organization' THEN source.normalizedName ELSE source.id END
          } as wlb
        `,
        { orgId, routeOrDomain },
      );
      const wlb = result.records[0]?.get("wlb");
      if (wlb) {
        const sourceType = wlb.sourceType;
        const sourceId = wlb.sourceId;

        let org: ShortOrgWithSummary | null = null;
        let ecosystem: OrganizationEcosystemWithOrgs | null = null;

        if (sourceType === "organization") {
          const orgDetails =
            await this.organizationsService.getOrgDetailsBySlug(
              sourceId,
              undefined,
            );
          if (!orgDetails) {
            throw new BadRequestException({
              success: false,
              message: "Source organization not found",
            });
          }
          org = toShortOrgWithSummary(orgDetails);
        } else if (sourceType === "ecosystem") {
          ecosystem = data(
            await this.ecosystemsService.findOne(orgId, sourceId),
          );
          if (!ecosystem) {
            throw new BadRequestException({
              success: false,
              message: "Source ecosystem not found",
            });
          }
        }

        return {
          success: true,
          message: "Retrieved white label board successfully",
          data: new WhiteLabelBoardWithSource({
            ...wlb,
            domain: notStringOrNull(wlb.domain),
            createdTimestamp: nonZeroOrNull(wlb.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(wlb.updatedTimestamp),
            org: sourceType === "organization" ? org : null,
            ecosystem: sourceType === "ecosystem" ? ecosystem : null,
          }),
        };
      } else {
        return {
          success: false,
          message: "White label board not found",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "white-label-boards.service",
        });
        scope.setExtra("input", routeOrDomain);
        Sentry.captureException(error);
      });
      this.logger.error(`WhiteLabelBoardsService::findOne ${error.message}`);
      return {
        success: false,
        message: "Failed to retrieve white label board",
      };
    }
  }

  async findOnePublic(
    routeOrDomain: string,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (wlb:WhiteLabelBoard)
          WHERE (wlb.route = $routeOrDomain OR wlb.domain = $routeOrDomain)
          AND wlb.visibility = 'public'
          MATCH (wlb)-[r:HAS_SOURCE]->(source)
          RETURN wlb {
            .*,
            sourceType: r.type,
            sourceId: CASE WHEN r.type = 'organization' THEN source.normalizedName ELSE source.id END
          } as wlb
        `,
        { routeOrDomain },
      );
      const wlb = result.records[0]?.get("wlb");
      if (wlb) {
        const sourceType = wlb.sourceType;
        const sourceId = wlb.sourceId;

        let org: ShortOrgWithSummary | null = null;
        let ecosystem: OrganizationEcosystemWithOrgs | null = null;

        if (sourceType === "organization") {
          const orgDetails =
            await this.organizationsService.getOrgDetailsBySlug(
              sourceId,
              undefined,
            );
          if (!orgDetails) {
            throw new BadRequestException({
              success: false,
              message: "Source organization not found",
            });
          }
          org = toShortOrgWithSummary(orgDetails);
        } else if (sourceType === "ecosystem") {
          const owner = await this.findOrgIdByWhiteLabelBoard(routeOrDomain);
          if (!owner.success) {
            throw new BadRequestException({
              success: false,
              message: "Source ecosystem not found",
            });
          }
          const orgId = data(owner);
          ecosystem = data(
            await this.ecosystemsService.findOne(orgId, sourceId),
          );
          if (!ecosystem) {
            throw new BadRequestException({
              success: false,
              message: "Source ecosystem not found",
            });
          }
        }

        return {
          success: true,
          message: "Retrieved public board successfully",
          data: new WhiteLabelBoardWithSource({
            ...wlb,
            domain: notStringOrNull(wlb.domain),
            createdTimestamp: nonZeroOrNull(wlb.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(wlb.updatedTimestamp),
            org: sourceType === "organization" ? org : null,
            ecosystem: sourceType === "ecosystem" ? ecosystem : null,
          }),
        };
      } else {
        return {
          success: false,
          message: "Public board not found",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "white-label-boards.service",
        });
        scope.setExtra("input", routeOrDomain);
        Sentry.captureException(error);
      });
      this.logger.error(
        `WhiteLabelBoardsService::findOnePublic ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve public board",
      };
    }
  }

  async update(
    orgId: string,
    routeOrDomain: string,
    updateWhiteLabelBoardDto: UpdateWhiteLabelBoardDto,
  ): Promise<ResponseWithOptionalData<WhiteLabelBoardWithSource>> {
    try {
      const check = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization WHERE org.orgId <> $orgId)-[:HAS_WHITE_LABEL_BOARD]-(wlb:WhiteLabelBoard WHERE wlb.route = $routeOrDomain OR wlb.domain = $routeOrDomain)
          RETURN COUNT(wlb) > 0 AS existing
        `,
        {
          routeOrDomain,
          orgId,
        },
      );

      const existing = check.records[0].get("existing") as boolean;
      if (existing) {
        throw new BadRequestException({
          success: false,
          message: "This route is already taken",
        });
      }

      const source: OrgListResult | OrganizationEcosystemWithOrgs | null =
        updateWhiteLabelBoardDto.sourceType === "organization"
          ? ((await this.organizationsService.getOrgDetailsBySlug(
              updateWhiteLabelBoardDto.sourceSlug,
              undefined,
            )) ?? null)
          : data(
              await this.ecosystemsService.findOne(
                orgId,
                updateWhiteLabelBoardDto.sourceSlug,
              ),
            );

      if (!source) {
        throw new BadRequestException({
          success: false,
          message: "Source not found",
        });
      }

      const result = await this.neogma.queryRunner.run(
        `
          MATCH (wlb:WhiteLabelBoard)
          WHERE wlb.route = $routeOrDomain OR wlb.domain = $routeOrDomain
          SET wlb.name = $name,
            wlb.route = $route,
            wlb.domain = $domain,
            wlb.visibility = $visibility,
            wlb.updatedTimestamp = timestamp()

          WITH wlb
          MATCH (source: Organization|OrganizationEcosystem {normalizedName: $sourceSlug})
          MERGE (wlb)-[r:HAS_SOURCE]->(source)
          ON CREATE SET
            r.type = $sourceType
          ON MATCH SET
            r.type = $sourceType
          RETURN wlb { .* } as wlb
        `,
        {
          routeOrDomain,
          ...updateWhiteLabelBoardDto,
        },
      );
      const wlb = result.records[0].get("wlb");
      if (wlb) {
        return {
          success: true,
          message: "Updated white label board successfully",
          data: new WhiteLabelBoardWithSource({
            ...wlb,
            domain: notStringOrNull(wlb.domain),
            createdTimestamp: nonZeroOrNull(wlb.createdTimestamp),
            updatedTimestamp: nonZeroOrNull(wlb.updatedTimestamp),
            sourceType: updateWhiteLabelBoardDto.sourceType,
            org:
              updateWhiteLabelBoardDto.sourceType === "organization"
                ? toShortOrgWithSummary(source as OrgListResult)
                : null,
            ecosystem:
              updateWhiteLabelBoardDto.sourceType === "ecosystem"
                ? (source as OrganizationEcosystemWithOrgs)
                : null,
          }),
        };
      } else {
        return {
          success: false,
          message: "Failed to update white label board",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "ecosystems.service",
        });
        scope.setExtra("input", updateWhiteLabelBoardDto);
        Sentry.captureException(error);
      });
      this.logger.error(`WhiteLabelBoardsService::update ${error.message}`);
      return {
        success: false,
        message: "Failed to update white label board",
      };
    }
  }

  async remove(
    orgId: string,
    routeOrDomain: string,
  ): Promise<ResponseWithNoData> {
    const wlb = data(await this.findOne(orgId, routeOrDomain));
    if (wlb) {
      try {
        await this.neogma.queryRunner.run(
          `
            MATCH (wlb:WhiteLabelBoard)
            WHERE wlb.route = $routeOrDomain OR wlb.domain = $routeOrDomain
            DETACH DELETE wlb
          `,
          { routeOrDomain },
        );
        return {
          success: true,
          message: "Deleted white label board successfully",
        };
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "white-label-boards.service",
          });
          scope.setExtra("input", routeOrDomain);
          Sentry.captureException(error);
        });
        this.logger.error(`WhiteLabelBoardsService::remove ${error.message}`);
        return {
          success: false,
          message: "Failed to delete white label board",
        };
      }
    } else {
      return {
        success: false,
        message: "White label board not found",
      };
    }
  }
}
