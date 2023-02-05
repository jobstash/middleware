import { Injectable } from "@nestjs/common";
import { ResponseEntity } from "src/shared/types";

@Injectable()
export class AppService {
  healthCheck(): ResponseEntity {
    return { success: true, message: "Server is healthy and up!" };
  }
}
