import { Injectable } from "@nestjs/common";
import { ResponseWithNoData } from "src/shared/types";

@Injectable()
export class AppService {
  healthCheck(): ResponseWithNoData {
    return { success: true, message: "Server is healthy and up!" };
  }
}
