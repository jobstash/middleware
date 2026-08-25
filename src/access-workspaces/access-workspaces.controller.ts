import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
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
  AgencyBountyOpportunities,
  AgencyBountySummary,
  AgencyBountyCompany,
  AgencyBountyJob,
} from "./access-workspaces.dto";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";
import { AccessWorkspacesService } from "./access-workspaces.service";

type SuccessResponse<T = unknown> = {
  success: true;
  message: string;
  data: T;
};

const success = <T>(message: string, data: T): SuccessResponse<T> => ({
  success: true as const,
  message,
  data,
});

@Controller("access-workspaces")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@ApiExtraModels(
  AgencyBountyOpportunities,
  AgencyBountySummary,
  AgencyBountyCompany,
  AgencyBountyJob,
)
export class AccessWorkspacesController {
  constructor(private readonly workspaces: AccessWorkspacesService) {}

  @Post()
  async create(
    @Session() session: SessionObject,
    @Body() input: CreateAccessWorkspaceInput,
  ): Promise<SuccessResponse> {
    return success(
      "Workspace created successfully",
      await this.workspaces.create(
        session.address!,
        input.primaryProfileId,
        input.domain,
      ),
    );
  }

  @Get()
  @Header("Cache-Control", "no-cache, private, no-store, must-revalidate")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  async list(@Session() session: SessionObject): Promise<SuccessResponse> {
    return success(
      "Workspaces retrieved successfully",
      await this.workspaces.list(session.address!),
    );
  }

  @Get(":workspaceId")
  async get(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
  ): Promise<SuccessResponse> {
    return success(
      "Workspace retrieved successfully",
      await this.workspaces.get(workspaceId, session.address!),
    );
  }

  @Get(":workspaceId/bounty-opportunities")
  @Header("Cache-Control", "no-cache, private, no-store, must-revalidate")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @ApiOkResponse({
    description:
      "Returns placement-bounty companies and current jobs to an entitled Agency workspace member",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(AgencyBountyOpportunities),
    }),
  })
  async listBountyOpportunities(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
    @Query("limit") rawLimit = "50",
  ): Promise<SuccessResponse> {
    return success(
      "Bounty opportunities retrieved successfully",
      await this.workspaces.listBountyOpportunities(
        workspaceId,
        session.address!,
        Number(rawLimit),
      ),
    );
  }

  @Put(":workspaceId/members")
  async putMember(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
    @Body() input: PutAccessWorkspaceMemberInput,
  ): Promise<SuccessResponse> {
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
  ): Promise<SuccessResponse> {
    await this.workspaces.removeMember(workspaceId, session.address!, userId);
    return success("Workspace member removed successfully", null);
  }

  @Post(":workspaceId/domain-transfer")
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async transferDomain(
    @Session() session: SessionObject,
    @Param("workspaceId") workspaceId: string,
    @Body() input: TransferAccessWorkspaceDomainInput,
  ): Promise<SuccessResponse> {
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
@UseGuards(PBACGuard, ThrottlerGuard)
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
  ): Promise<SuccessResponse> {
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
  ): Promise<SuccessResponse> {
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
