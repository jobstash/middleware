import { Logger, LogLevel } from "@nestjs/common";
import { CustomLogger } from "./custom-logger";

class InspectableLogger extends CustomLogger {
  static levels(): LogLevel[] | undefined {
    return Logger.logLevels;
  }

  static restoreLevels(levels: LogLevel[] | undefined): void {
    Logger.logLevels = levels;
  }
}

describe("CustomLogger environment levels", () => {
  it.each<[string | undefined, LogLevel[]]>([
    ["test", []],
    ["development", ["debug", "error", "log", "verbose", "warn"]],
    ["production", ["error", "warn", "log"]],
    [undefined, ["error", "warn", "log"]],
  ])("retains the level set for %s", (environment, expected) => {
    const previousEnvironment = process.env.ENV;
    const previousLevels = InspectableLogger.levels();
    try {
      if (environment === undefined) delete process.env.ENV;
      else process.env.ENV = environment;
      new CustomLogger("quality-contract");
      expect(InspectableLogger.levels()).toEqual(expected);
    } finally {
      if (previousEnvironment === undefined) delete process.env.ENV;
      else process.env.ENV = previousEnvironment;
      InspectableLogger.restoreLevels(previousLevels);
    }
  });
});
