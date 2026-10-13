import { forwardRef, Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "src/auth/auth.module";
import { MailModule } from "src/mail/mail.module";
import {
  AgencyAlertsController,
  AgencyAlertUnsubscribeController,
} from "./agency-alerts.controller";
import { AgencyAlertsRepository } from "./agency-alerts.repository";
import { AgencyAlertsService } from "./agency-alerts.service";
import { AgencyAlertsAdminController } from "./agency-alerts-admin.controller";
import { AgencyAlertsAdminService } from "./agency-alerts-admin.service";
import {
  AccessWorkspacesController,
  InspectController,
} from "./access-workspaces.controller";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AccessWorkspacesService } from "./access-workspaces.service";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MailModule,
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
  ],
  controllers: [
    AccessWorkspacesController,
    InspectController,
    AgencyAlertsController,
    AgencyAlertUnsubscribeController,
    AgencyAlertsAdminController,
  ],
  providers: [
    AccessWorkspacesRepository,
    AccessWorkspacesService,
    AgencyAlertsRepository,
    AgencyAlertsService,
    AgencyAlertsAdminService,
  ],
  exports: [AccessWorkspacesService],
})
export class AccessWorkspacesModule {}
