import { Controller, Get, Header, Res } from "@nestjs/common";
import { Response } from "express";
import { NO_CACHE } from "src/shared/constants/cache-control";
import { HealthService, ServiceHealth } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  @Header("Cache-Control", NO_CACHE)
  live(): ServiceHealth {
    return this.health.live();
  }

  @Get("ready")
  @Header("Cache-Control", NO_CACHE)
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ServiceHealth> {
    const health = await this.health.ready();
    if (health.status !== "ready") response.status(503);
    return health;
  }
}
