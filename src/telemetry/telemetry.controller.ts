import {
  Controller,
  Get,
  Query,
  UseGuards,
  // UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  // CACHE_DURATION_1_HOUR,
  CheckWalletPermissions,
} from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import {
  ResponseWithOptionalData,
  SessionObject,
  DashboardJobStats,
  DashboardTalentStats,
} from "src/shared/interfaces";
import { GetJobStatsInput } from "./dto/get-job-stats.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
// import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { UserService } from "src/user/user.service";
import { GetDashboardJobStatsInput } from "./dto/get-dashboard-job-stats.input";

@Controller("telemetry")
export class TelemetryController {
  private logger = new CustomLogger(TelemetryController.name);
  constructor(
    private readonly userService: UserService,
    private readonly telemetryService: TelemetryService,
  ) {}

  @Get("job/views")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getJobViewCount(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    this.logger.log(`/telemetry/job/views ${JSON.stringify(params)}`);
    if (!(await this.userService.isOrgMember(address, params.orgId))) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }
    return this.telemetryService.getJobViewCount(params);
  }

  @Get("job/applies")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getJobApplyCount(
    @Session() { address }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    this.logger.log(`/telemetry/job/applies ${JSON.stringify(params)}`);
    if (!(await this.userService.isOrgMember(address, params.orgId))) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }
    return this.telemetryService.getJobApplyCount(params);
  }

  @Get("dashboard/stats/jobs")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getDashboardStats(
    @Session() { address, permissions }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: GetDashboardJobStatsInput,
  ): Promise<ResponseWithOptionalData<DashboardJobStats>> {
    this.logger.log(`/telemetry/dashboard/stats/jobs`);
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);

    if (
      (params.type === "ecosystem" &&
        !permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)) ||
      (params.type === "organization" && params.id !== orgId)
    ) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }

    return this.telemetryService.getDashboardJobStats({
      type: params.type,
      id: params.id,
    });
  }

  @Get("dashboard/stats/jobs/series")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getDashboardJobStatsSeries(
    @Session() { address, permissions }: SessionObject,
    @Query(new ValidationPipe({ transform: true }))
    params: GetDashboardJobStatsInput,
  ): Promise<
    ResponseWithOptionalData<
      {
        organization: string;
        stats: { month: string; count: number }[];
      }[]
    >
  > {
    this.logger.log(`/telemetry/dashboard/stats/jobs`);
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);

    if (
      (params.type === "ecosystem" &&
        !permissions.includes(CheckWalletPermissions.ECOSYSTEM_MANAGER)) ||
      (params.type === "organization" && params.id !== orgId)
    ) {
      return {
        success: false,
        message: "You are not authorized to access this resource",
      };
    }

    return this.telemetryService.getDashboardJobStatsSeries({
      type: params.type,
      id: params.id,
    });
  }

  @Get("dashboard/stats/talent")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  // @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION_1_HOUR))
  async getDashboardTalentStats(): Promise<
    ResponseWithOptionalData<DashboardTalentStats>
  > {
    this.logger.log(`/telemetry/dashboard/stats/talent`);

    return this.telemetryService.getDashboardTalentStats();
  }
}
