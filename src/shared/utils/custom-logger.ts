import { Logger, LoggerService } from "@nestjs/common";

export class CustomLogger extends Logger implements LoggerService {
  constructor(name: string) {
    super(name);
    Logger.logLevels =
      process.env.ENV == "test"
        ? []
        : process.env.ENV == "development"
          ? ["debug", "error", "log", "verbose", "warn"]
          : ["error", "warn", "log"];
  }
}
