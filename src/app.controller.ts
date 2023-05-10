import { Controller, Get, Header } from "@nestjs/common";
import { AppService } from "./app.service";
import { Response, ResponseWithNoData } from "src/shared/types";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import {
  CACHE_CONTROL_HEADER,
  CACHE_DURATION,
  CACHE_EXPIRY,
} from "./shared/presets/cache-control";

@Controller("app")
@ApiExtraModels(Response, ResponseWithNoData)
export class AppController {
  constructor(private readonly appService: AppService) {}

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
}
