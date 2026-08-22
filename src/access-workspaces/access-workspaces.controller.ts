import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import {
  CreateAccessWorkspaceInput,
  InspectProfileInput,
  PutAccessWorkspaceMemberInput,
  RevealInspectProfileInput,
  TransferAccessWorkspaceDomainInput,
} from "./access-workspaces.dto";
import { AccessWorkspacesService } from "./access-workspaces.service";

const success = <T>(message: string, data: T) => ({
  success: true as const,
  message,
  data,
});

@Controller("access-workspaces")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class AccessWorkspacesController {
  constructor(private readonly workspaces: AccessWorkspacesService) {}

  @Post()
  async create(
    @Session() session: SessionObject,
    @Body() input: CreateAccessWorkspaceInput,
  ) {
    return success(
      "Workspace created successfully",
      await this.workspaces.create(
        session.address!,
        input.primaryProfileId,
        input.domain,
      ),
    );
  }

  @Get(":workspaceId")
  async get(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
  ) {
    return success(
      "Workspace retrieved successfully",
      await this.workspaces.get(workspaceId, session.address!),
    );
  }

  @Put(":workspaceId/members")
  async putMember(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
    @Body() input: PutAccessWorkspaceMemberInput,
  ) {
    await this.workspaces.putMember(
      workspaceId,
      session.address!,
      input.userId,
      input.role,
    );
    return success("Workspace member updated successfully", null);
  }

  @Delete(":workspaceId/members/:userId")
  async removeMember(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
  ) {
    await this.workspaces.removeMember(workspaceId, session.address!, userId);
    return success("Workspace member removed successfully", null);
  }

  @Post(":workspaceId/domain-transfer")
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async transferDomain(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
    @Body() input: TransferAccessWorkspaceDomainInput,
  ) {
    return success(
      "Workspace domain transferred successfully",
      await this.workspaces.transferDomain(
        workspaceId,
        session.address!,
        input.domain,
        input.reason,
        input.superadminBypass,
      ),
    );
  }
}

@Controller("inspect")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class InspectController {
  constructor(private readonly workspaces: AccessWorkspacesService) {}

  @Post("profiles/:slug")
  @Header("Cache-Control", "no-cache, private, no-store, must-revalidate")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async inspect(
    @Session() session: SessionObject,
    @Param("slug") slug: string,
    @Body() input: InspectProfileInput,
  ) {
    return success(
      "Profile inspected successfully",
      await this.workspaces.inspect(input.workspaceId, session.address!, slug),
    );
  }

  @Post("profiles/:slug/reveal")
  @Header("Cache-Control", "no-cache, private, no-store, must-revalidate")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async reveal(
    @Session() session: SessionObject,
    @Param("slug") slug: string,
    @Body() input: RevealInspectProfileInput,
  ) {
    return success(
      "Profile fields revealed successfully",
      await this.workspaces.reveal(
        input.workspaceId,
        session.address!,
        slug,
        input.fields,
      ),
    );
  }
}
