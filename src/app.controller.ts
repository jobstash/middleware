import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { ResponseEntity } from "src/shared/types";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";

@Controller("app")
@ApiExtraModels(ResponseEntity)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  @ApiOkResponse({
    description: "Returns the health status of the server",
    schema: { $ref: getSchemaPath(ResponseEntity) },
  })
  healthCheck(): ResponseEntity {
    return this.appService.healthCheck();
  }
}
