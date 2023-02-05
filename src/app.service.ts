import { Injectable } from "@nestjs/common";
import { ResponseEntity } from "./shared/entities/response.entity";

@Injectable()
export class AppService {
  healthCheck(): ResponseEntity {
    return { success: true, message: "Server is healthy and up!" };
  }
}
