import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { MailService } from "src/mail/mail.service";
import { button, emailBuilder, randomToken, text } from "src/shared/helpers";
import {
  data,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ProfileService } from "../profile/profile.service";
import { AcceptDelegateAccessInput } from "./dto/accept-delegate-access.input";
import { DelegateAccessInput } from "./dto/delegate-access.input";
import { RevokeDelegateAccessInput } from "./dto/revoke-delegate-access.input";
import { UserService } from "src/user/user.service";
import { ConfigService } from "@nestjs/config";
import { DelegateAccessRequest } from "src/shared/interfaces/org";
import { DelegateAccessRequestEntity } from "src/shared/entities/delegate-access-request.entity";

@Injectable()
export class AccountService {
  private readonly logger = new CustomLogger(AccountService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly mailService: MailService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
  ) {}

  async getDelegateAccess(
    fromOrgId: string,
    toOrgId: string,
  ): Promise<ResponseWithOptionalData<"accepted" | "pending" | "revoked">> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (fromOrg:Organization {orgId: $fromOrgId})-[r:HAS_DELEGATE_ACCESS]->(toOrg:Organization {orgId: $toOrgId})
          RETURN r
        `,
        { fromOrgId, toOrgId },
      );

      if (result.records.length === 0) {
        return {
          success: false,
          message: "Delegate access not found",
          data: null,
        };
      }

      return {
        success: true,
        message: "Delegate access found",
        data: result.records[0].get("r").properties.status,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "account.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`AccountService::getDelegateAccess ${error.message}`);
      return {
        success: false,
        message: "Error getting delegate access",
        data: null,
      };
    }
  }

  async getDelegateAccessRequests(
    orgId: string,
  ): Promise<ResponseWithOptionalData<DelegateAccessRequest[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization)-[r:HAS_DELEGATE_ACCESS]->(toOrg:Organization)
          WHERE org.orgId = $orgId OR toOrg.orgId = $orgId
          RETURN r {
            .*,
            requestor: coalesce([(:User {wallet: r.requestorAddress})-[ru:VERIFIED_FOR_ORG {credential: "email"}]->(org) | ru.account][0], r.requestorAddress),
            grantor: coalesce([(:User {wallet: r.grantorAddress})-[ru:VERIFIED_FOR_ORG {credential: "email"}]->(toOrg) | ru.account][0], r.grantorAddress),
            revoker: coalesce([(:User {wallet: r.revokerAddress})-[ru:VERIFIED_FOR_ORG {credential: "email"}]->(toOrg) | ru.account][0], r.revokerAddress),
            fromOrgId: org.orgId,
            fromOrgName: org.name,
            fromOrgLogo: coalesce(org.logoUrl, [(org)-[:HAS_WEBSITE]->(website) | website.url][0]),
            toOrgId: toOrg.orgId,
            toOrgName: toOrg.name,
            authToken: r.authToken,
            toOrgLogo: coalesce(toOrg.logoUrl, [(toOrg)-[:HAS_WEBSITE]->(website) | website.url][0])
          }
          ORDER BY r.createdTimestamp DESC
        `,
        { orgId },
      );
      const requests = result.records.map(record => {
        return new DelegateAccessRequestEntity(record.get("r")).getProperties();
      });
      return {
        success: true,
        message: "Retrieved delegate access requests",
        data: requests.map(x => ({
          ...x,
          authToken: x.status === "pending" ? x.authToken : null,
          link:
            x.status === "pending"
              ? `${this.configService.get("ORG_ADMIN_DOMAIN")}/delegate-access?fromOrgId=${x.fromOrgId}&toOrgId=${x.toOrgId}&authToken=${x.authToken}`
              : null,
        })),
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "account.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `AccountService::getDelegateAccessRequests ${error.message}`,
      );
      return {
        success: false,
        message: "Error getting delegate access requests",
        data: null,
      };
    }
  }

  async requestDelegateAccess(
    requestorAddress: string,
    fromOrgId: string,
    body: DelegateAccessInput,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const { toOrgId } = body;

      const requestorEmail = data(
        await this.profileService.getUserVerifications(
          requestorAddress,
          false,
          false,
        ),
      ).find(
        verification =>
          verification.credential === "email" && verification.id === fromOrgId,
      ).account;

      if (!requestorEmail) {
        return {
          success: false,
          message: "Requestor email not found",
          data: null,
        };
      }

      const toOrg = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $toOrgId})
          RETURN org
        `,
        { toOrgId },
      );

      if (!toOrg) {
        return {
          success: false,
          message: "Grantor organization not found",
          data: null,
        };
      }

      const authToken = randomToken();
      const expiryDurationMs = 7 * 24 * 60 * 60 * 1000; // one week

      const result = await this.neogma.queryRunner.run(
        `
          MATCH (fromOrg:Organization {orgId: $fromOrgId}),(toOrg:Organization {orgId: $toOrgId})
          MERGE (fromOrg)-[r:HAS_DELEGATE_ACCESS]->(toOrg)
          ON CREATE SET r.id = randomUUID(), r.createdTimestamp = timestamp(), r.expiryTimestamp = timestamp() + $expiryDurationMs, r.requestorAddress = $requestorAddress, r.status = 'pending', r.authToken = $authToken
          RETURN r
        `,
        { fromOrgId, toOrgId, requestorAddress, authToken, expiryDurationMs },
      );

      if (result.records.length === 0) {
        return {
          success: false,
          message: "Delegate access request not created",
          data: null,
        };
      }

      const domain = this.configService.get("ORG_ADMIN_DOMAIN");

      const delegateAccessLink = `${domain}/delegate-access?fromOrgId=${fromOrgId}&toOrgId=${toOrgId}&authToken=${authToken}`;

      const targetOwner = data(
        await this.userService.findOrgOwnerProfileByOrgId(toOrgId),
      );

      if (targetOwner) {
        const targetEmail = data(
          await this.profileService.getUserVerifications(
            targetOwner.wallet,
            false,
            false,
          ),
        ).find(
          verification =>
            verification.credential === "email" && verification.id === toOrgId,
        ).account;

        try {
          const email = emailBuilder({
            from: this.configService.get("EMAIL"),
            to: targetEmail,
            subject: "Delegate Access Request",
            previewText: `You have received a delegate access request from ${requestorEmail}. Please click the link to accept the request: ${delegateAccessLink}`,
            title: "Hey there,",
            bodySections: [
              text(
                `You have received a delegate access request from ${requestorEmail}. Please click the link to accept the request:`,
              ),
              button("Accept Delegate Access", delegateAccessLink),
              text(
                "If you do not want to accept the request, please ignore this email.",
              ),
            ],
          });

          await this.mailService.sendEmail(email);
        } catch (error) {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "mail-send",
              source: "account.service",
            });
            Sentry.captureException(error);
          });
          this.logger.error(
            `AccountService::requestDelegateAccess::sendEmail ${error.message}`,
          );
        }
      }

      return {
        success: true,
        message: targetOwner
          ? "Delegate access request sent"
          : "Delegate access request created",
        data: delegateAccessLink,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "account.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`AccountService::delegateAccess ${error.message}`);
      return {
        success: false,
        message: "Error requesting delegate access",
        data: null,
      };
    }
  }

  async acceptDelegateAccessRequest(
    grantorAddress: string,
    data: AcceptDelegateAccessInput,
  ): Promise<ResponseWithNoData> {
    try {
      const { fromOrgId, toOrgId, authToken } = data;

      const toOrg = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $toOrgId})
          RETURN org
        `,
        { toOrgId },
      );

      if (!toOrg) {
        return {
          success: false,
          message: "Grantee organization not found",
        };
      }

      const result = await this.neogma.queryRunner.run(
        `
          MATCH (fromOrg:Organization {orgId: $fromOrgId})-[r:HAS_DELEGATE_ACCESS {authToken: $authToken, status: 'pending'}]->(toOrg:Organization {orgId: $toOrgId})
          WHERE r.expiryTimestamp > timestamp()
          SET r.updatedTimestamp = timestamp(), r.grantorAddress = $grantorAddress, r.status = 'accepted'
          REMOVE r.authToken
          RETURN r
        `,
        { toOrgId, fromOrgId, grantorAddress, authToken },
      );

      if (result.records.length === 0) {
        return {
          success: false,
          message: "Delegate access request not found or expired",
        };
      }

      return {
        success: true,
        message: "Delegate access request accepted",
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "account.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `AccountService::acceptDelegateAccessRequest ${error.message}`,
      );
      return {
        success: false,
        message: "Error accepting delegate access request",
      };
    }
  }

  async revokeDelegateAccess(
    actorAddress: string,
    body: RevokeDelegateAccessInput,
  ): Promise<ResponseWithNoData> {
    try {
      const { fromOrgId, toOrgId } = body;

      const result = await this.neogma.queryRunner.run(
        `
          MATCH (fromOrg:Organization {orgId: $fromOrgId})-[r:HAS_DELEGATE_ACCESS]->(toOrg:Organization {orgId: $toOrgId})
          WHERE r.status = 'accepted'
          SET r.status = 'revoked', r.updatedTimestamp = timestamp(), r.revokerAddress = $actorAddress
          RETURN r
        `,
        { fromOrgId, toOrgId, actorAddress },
      );

      if (result.records.length === 0) {
        return {
          success: false,
          message: "Delegate access not found or not active",
        };
      }

      return {
        success: true,
        message: "Delegate access revoked",
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "account.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `AccountService::revokeDelegateAccess ${error.message}`,
      );
      return {
        success: false,
        message: "Error revoking delegate access",
      };
    }
  }
}
