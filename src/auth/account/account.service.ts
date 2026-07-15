import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { MailService } from "src/mail/mail.service";
import { DelegateAccessRepository } from "src/postgres/delegate-access.repository";
import { DelegateAccessRequestEntity } from "src/shared/entities/delegate-access-request.entity";
import { button, emailBuilder, randomToken, text } from "src/shared/helpers";
import {
  data,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { DelegateAccessRequest } from "src/shared/interfaces/org";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "src/user/user.service";
import { ProfileService } from "../profile/profile.service";
import { AcceptDelegateAccessInput } from "./dto/accept-delegate-access.input";
import { DelegateAccessInput } from "./dto/delegate-access.input";
import { RevokeDelegateAccessInput } from "./dto/revoke-delegate-access.input";

@Injectable()
export class AccountService {
  private readonly logger = new CustomLogger(AccountService.name);

  constructor(
    private readonly delegateAccess: DelegateAccessRepository,
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
      const status = await this.delegateAccess.getStatus(fromOrgId, toOrgId);
      return status
        ? { success: true, message: "Delegate access found", data: status }
        : {
            success: false,
            message: "Delegate access not found",
            data: null,
          };
    } catch (error) {
      this.capture("getDelegateAccess", error);
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
      const requests = (await this.delegateAccess.getRequests(orgId)).map(
        request => new DelegateAccessRequestEntity(request).getProperties(),
      );
      return {
        success: true,
        message: "Retrieved delegate access requests",
        data: requests.map(request => ({
          ...request,
          authToken: request.status === "pending" ? request.authToken : null,
          link:
            request.status === "pending"
              ? `${this.configService.get("ORG_ADMIN_DOMAIN")}/delegate-access?fromOrgId=${request.fromOrgId}&toOrgId=${request.toOrgId}&authToken=${request.authToken}`
              : null,
        })),
      };
    } catch (error) {
      this.capture("getDelegateAccessRequests", error);
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
      const requestorEmail = data(
        await this.profileService.getUserVerifications(
          requestorAddress,
          false,
          false,
        ),
      ).find(
        verification =>
          verification.credential === "email" && verification.id === fromOrgId,
      )?.account;
      if (!requestorEmail) {
        return {
          success: false,
          message: "Requestor email not found",
          data: null,
        };
      }
      if (!(await this.delegateAccess.organizationExists(body.toOrgId))) {
        return {
          success: false,
          message: "Grantor organization not found",
          data: null,
        };
      }

      const authToken = randomToken();
      const created = await this.delegateAccess.request({
        fromOrganizationId: fromOrgId,
        toOrganizationId: body.toOrgId,
        requestorAddress,
        authToken,
        expiryDurationMs: 7 * 24 * 60 * 60 * 1000,
      });
      if (!created) {
        return {
          success: false,
          message: "Delegate access request not created",
          data: null,
        };
      }

      const delegateAccessLink = `${this.configService.get(
        "ORG_ADMIN_DOMAIN",
      )}/delegate-access?fromOrgId=${fromOrgId}&toOrgId=${body.toOrgId}&authToken=${authToken}`;
      const targetOwner = data(
        await this.userService.findOrgOwnerProfileByOrgId(body.toOrgId),
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
            verification.credential === "email" &&
            verification.id === body.toOrgId,
        )?.account;
        if (targetEmail) {
          try {
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.configService.get("EMAIL"),
                to: targetEmail,
                subject: "Delegate Access Request",
                previewText: `You have received a delegate access request from ${requestorEmail}.`,
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
              }),
            );
          } catch (error) {
            this.capture("requestDelegateAccess::sendEmail", error);
          }
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
      this.capture("requestDelegateAccess", error);
      return {
        success: false,
        message: "Error requesting delegate access",
        data: null,
      };
    }
  }

  async acceptDelegateAccessRequest(
    grantorAddress: string,
    input: AcceptDelegateAccessInput,
  ): Promise<ResponseWithNoData> {
    try {
      if (!(await this.delegateAccess.organizationExists(input.toOrgId))) {
        return { success: false, message: "Grantee organization not found" };
      }
      const accepted = await this.delegateAccess.accept({
        fromOrganizationId: input.fromOrgId,
        toOrganizationId: input.toOrgId,
        grantorAddress,
        authToken: input.authToken,
      });
      return accepted
        ? {
            success: true,
            message: "Delegate access request accepted",
          }
        : {
            success: false,
            message: "Delegate access request not found or expired",
          };
    } catch (error) {
      this.capture("acceptDelegateAccessRequest", error);
      return {
        success: false,
        message: "Error accepting delegate access request",
      };
    }
  }

  async revokeDelegateAccess(
    actorAddress: string,
    input: RevokeDelegateAccessInput,
  ): Promise<ResponseWithNoData> {
    try {
      const revoked = await this.delegateAccess.revoke({
        fromOrganizationId: input.fromOrgId,
        toOrganizationId: input.toOrgId,
        actorAddress,
      });
      return revoked
        ? { success: true, message: "Delegate access revoked" }
        : {
            success: false,
            message: "Delegate access not found or not active",
          };
    } catch (error) {
      this.capture("revokeDelegateAccess", error);
      return {
        success: false,
        message: "Error revoking delegate access",
      };
    }
  }

  private capture(action: string, error: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "account.service" });
      Sentry.captureException(error);
    });
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`AccountService::${action} ${message}`);
  }
}
