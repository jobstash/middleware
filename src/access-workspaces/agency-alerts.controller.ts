import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import { AgencyAlertsService } from "./agency-alerts.service";
import {
  AgencyAlertState,
  AlertOrganizationSearch,
  AlertResponse,
} from "./agency-alerts.types";

class FollowOrganizationInput {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  organizationId: string;
}

const success = <T>(data: T): AlertResponse<T> => ({
  success: true,
  message: "Alert preferences retrieved successfully",
  data,
});

@Controller("access-workspaces/:workspaceId/alerts")
@UseGuards(PBACGuard, ThrottlerGuard)
@Permissions(CheckWalletPermissions.USER)
export class AgencyAlertsController {
  constructor(private readonly alerts: AgencyAlertsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async state(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ): Promise<AlertResponse<AgencyAlertState>> {
    return success(await this.alerts.state(workspaceId, session.address!));
  }

  @Get("organizations")
  @Header("Cache-Control", "private, no-store")
  async search(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Query("q") query = "",
  ): Promise<AlertResponse<AlertOrganizationSearch>> {
    return success(
      await this.alerts.search(
        workspaceId,
        session.address!,
        typeof query === "string" ? query : "",
      ),
    );
  }

  @Post("follows")
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async follow(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: FollowOrganizationInput,
  ): Promise<AlertResponse<AgencyAlertState>> {
    return success(
      await this.alerts.follow(
        workspaceId,
        session.address!,
        body.organizationId,
      ),
    );
  }

  @Post("unfollow")
  @Header("Cache-Control", "private, no-store")
  async unfollow(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: FollowOrganizationInput,
  ): Promise<AlertResponse<AgencyAlertState>> {
    return success(
      await this.alerts.unfollow(
        workspaceId,
        session.address!,
        body.organizationId,
      ),
    );
  }

  @Post("unsubscribe")
  @Header("Cache-Control", "private, no-store")
  async unsubscribe(
    @Session() session: SessionObject,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ): Promise<AlertResponse<AgencyAlertState>> {
    return success(await this.alerts.unfollow(workspaceId, session.address!));
  }
}

@Controller("agency-alerts/unsubscribe")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AgencyAlertUnsubscribeController {
  constructor(private readonly alerts: AgencyAlertsService) {}

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  page(@Query("token") token = ""): string {
    return this.alerts.unsubscribePage(typeof token === "string" ? token : "");
  }

  @Post()
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async unsubscribe(@Query("token") token = ""): Promise<string> {
    await this.alerts.unsubscribe(typeof token === "string" ? token : "");
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Alerts stopped</title></head><body><main><h1>Your alerts are stopped</h1><p>You will no longer receive organization alerts for this workspace. You can choose organizations again in Alert.</p></main></body></html>';
  }
}
