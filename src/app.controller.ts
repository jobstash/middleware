import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { Response, ResponseWithNoData } from "src/shared/types";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";

@Controller("app")
@ApiExtraModels(Response, ResponseWithNoData)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
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
