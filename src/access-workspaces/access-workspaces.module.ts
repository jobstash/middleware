import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import {
  AccessWorkspacesController,
  InspectController,
} from "./access-workspaces.controller";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AccessWorkspacesService } from "./access-workspaces.service";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [AccessWorkspacesController, InspectController],
  providers: [AccessWorkspacesRepository, AccessWorkspacesService],
  exports: [AccessWorkspacesService],
})
export class AccessWorkspacesModule {}
