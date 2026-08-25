import { forwardRef, Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "src/auth/auth.module";
import {
  AccessWorkspacesController,
  InspectController,
} from "./access-workspaces.controller";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AccessWorkspacesService } from "./access-workspaces.service";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AccessWorkspacesController, InspectController],
  providers: [AccessWorkspacesRepository, AccessWorkspacesService],
  exports: [AccessWorkspacesService],
})
export class AccessWorkspacesModule {}
