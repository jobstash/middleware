import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { ThrottlerGuard } from "@nestjs/throttler";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import {
  AgencyAlertsAdminService,
  AlertPartnerWorkspace,
} from "./agency-alerts-admin.service";
import { AlertResponse } from "./agency-alerts.types";

class ProvisionAlertPartnerInput {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  primaryProfileId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownerUserId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(253)
  domain: string;
}

class ApproveAlertPartnerInput {
  @IsBoolean()
  enabled: boolean;
}

class AlertPartnerUserInput {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  userId: string;
}

class AlertPartnerMemberInput extends AlertPartnerUserInput {
  @IsIn(["admin", "analyst", "viewer"])
  role: "admin" | "analyst" | "viewer";
}

const success = <T>(data: T): AlertResponse<T> => ({
  success: true,
  message: "Alert partner workspace retrieved successfully",
  data,
});
const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller("agency-alerts/admin/workspaces")
@UseGuards(PBACGuard, ThrottlerGuard)
@Permissions(CheckWalletPermissions.SUPER_ADMIN)
export class AgencyAlertsAdminController {
  constructor(private readonly partners: AgencyAlertsAdminService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(): Promise<
    AlertResponse<{ workspaces: AlertPartnerWorkspace[] }>
  > {
    return success(await this.partners.list());
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  async provision(
    @Session() session: SessionObject,
    @Body(validation) input: ProvisionAlertPartnerInput,
  ): Promise<AlertResponse<AlertPartnerWorkspace>> {
    return success(await this.partners.provision(session.address!, input));
  }

  @Post(":workspaceId/approval")
  @Header("Cache-Control", "private, no-store")
  async approve(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(validation) input: ApproveAlertPartnerInput,
  ): Promise<AlertResponse<AlertPartnerWorkspace>> {
    return success(
      await this.partners.approve(workspaceId, session.address!, input.enabled),
    );
  }

  @Post(":workspaceId/members")
  @Header("Cache-Control", "private, no-store")
  async putMember(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(validation) input: AlertPartnerMemberInput,
  ): Promise<AlertResponse<AlertPartnerWorkspace>> {
    return success(
      await this.partners.putMember(
        workspaceId,
        session.address!,
        input.userId,
        input.role,
      ),
    );
  }

  @Post(":workspaceId/remove-member")
  @Header("Cache-Control", "private, no-store")
  async removeMember(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(validation) input: AlertPartnerUserInput,
  ): Promise<AlertResponse<AlertPartnerWorkspace>> {
    return success(await this.partners.removeMember(workspaceId, input.userId));
  }
}
