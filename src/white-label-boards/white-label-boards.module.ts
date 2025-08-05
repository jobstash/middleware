import { forwardRef, Module } from "@nestjs/common";
import { WhiteLabelBoardsService } from "./white-label-boards.service";
import { WhiteLabelBoardsController } from "./white-label-boards.controller";
import { OrganizationsModule } from "src/organizations/organizations.module";
import { EcosystemsModule } from "src/ecosystems/ecosystems.module";
import { AuthModule } from "src/auth/auth.module";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { UserModule } from "src/user/user.module";
import { JobsModule } from "src/jobs/jobs.module";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => SubscriptionsModule),
    OrganizationsModule,
    EcosystemsModule,
    JobsModule,
  ],
  controllers: [WhiteLabelBoardsController],
  providers: [WhiteLabelBoardsService],
  exports: [WhiteLabelBoardsService],
})
export class WhiteLabelBoardsModule {}
