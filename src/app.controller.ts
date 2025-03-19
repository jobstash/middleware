import { Controller, Get, Header, UseInterceptors } from "@nestjs/common";
import { AppService } from "./app.service";
import { Response, ResponseWithNoData } from "src/shared/types";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { CACHE_DURATION, NO_CACHE } from "./shared/constants/cache-control";
import { ConfigService } from "@nestjs/config";
import { CacheHeaderInterceptor } from "./shared/decorators/cache-interceptor.decorator";

@Controller("app")
@ApiExtraModels(Response, ResponseWithNoData)
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get("health")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns the health status of the server",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  healthCheck(): ResponseWithNoData {
    return this.appService.healthCheck();
  }

  @Get("diff")
  @Header("Cache-Control", NO_CACHE)
  @ApiOkResponse({
    description: "Returns the diff of the currently deployed code",
    schema: {
      $ref: getSchemaPath(String),
    },
  })
  diff(): string {
    return this.configService.get<string>("DIFF");
  }

  @Get("sitemap")
  @UseInterceptors(new CacheHeaderInterceptor(CACHE_DURATION))
  @ApiOkResponse({
    description: "Returns the sitemap of the currently deployed code",
    schema: {
      $ref: getSchemaPath(String),
    },
  })
  async sitemap(): Promise<string> {
    return this.appService.sitemap();
  }
}
