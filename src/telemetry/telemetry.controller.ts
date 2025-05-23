import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { CACHE_DURATION, CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { ResponseWithOptionalData, SessionObject } from "src/shared/interfaces";
import { GetJobStatsInput } from "./dto/get-job-stats.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { UserService } from "src/user/user.service";

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
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
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
}
