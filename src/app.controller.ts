import { Controller, Get, Header } from "@nestjs/common";
import { AppService } from "./app.service";
import { Response, ResponseWithNoData } from "src/shared/types";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
  NO_CACHE,
} from "./shared/constants/cache-control";
import { ConfigService } from "@nestjs/config";

@Controller("app")
@ApiExtraModels(Response, ResponseWithNoData)
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get("health")
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
  @Header("Expires", CACHE_EXPIRY(CACHE_DURATION))
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
  @Header("Cache-Control", CACHE_CONTROL_HEADER(CACHE_DURATION))
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
