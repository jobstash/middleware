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
import { Permissions } from "src/shared/decorators";
import { ResponseWithOptionalData } from "src/shared/interfaces";
import { GetJobStatsInput } from "./dto/get-job-stats.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";

@Controller("telemetry")
export class TelemetryController {
  private logger = new CustomLogger(TelemetryController.name);
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get("job/views")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  async getJobViewCount(
    @Query(new ValidationPipe({ transform: true }))
    params: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    this.logger.log(`/telemetry/job/views ${JSON.stringify(params)}`);
    return this.telemetryService.getJobViewCount(params);
  }

  @Get("job/applies")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  async getJobApplyCount(
    @Query(new ValidationPipe({ transform: true }))
    params: GetJobStatsInput,
  ): Promise<ResponseWithOptionalData<number>> {
    this.logger.log(`/telemetry/job/applies ${JSON.stringify(params)}`);
    return this.telemetryService.getJobApplyCount(params);
  }
}
