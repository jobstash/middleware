import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { ResponseEntity } from "./shared/entities/response.entity";

@Controller("app")
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  healthCheck(): ResponseEntity {
    return this.appService.healthCheck();
  }
}
