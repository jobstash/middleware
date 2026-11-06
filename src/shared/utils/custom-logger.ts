import { Logger, LoggerService } from "@nestjs/common";

export class CustomLogger extends Logger implements LoggerService {
  constructor(name: string) {
    super(name);
    if (process.env.ENV == "test") {
      Logger.logLevels = [];
    } else if (process.env.ENV == "development") {
      Logger.logLevels = ["debug", "error", "log", "verbose", "warn"];
    } else {
      Logger.logLevels = ["error", "warn", "log"];
    }
  }
}
