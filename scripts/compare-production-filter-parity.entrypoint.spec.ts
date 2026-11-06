import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";

it("owns startup failure without network, report writes, or sensitive error output", async () => {
  const entry = join(__dirname, "compare-production-filter-parity.ts");
  const source = ts.transpileModule(readFileSync(entry, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const module = { exports: {} };
  const write = jest.fn(() => {
    throw new Error("Report writes forbidden in this fixture");
  });
  const requireFixture = Object.assign(
    (name: string): unknown => {
      if (name === "dotenv/config") return {};
      if (name === "node:fs") return { writeFileSync: write };
      if (name === "./filter-parity-matrix")
        return jest.requireActual("./filter-parity-matrix");
      if (name === "./filter-parity-comparison")
        return jest.requireActual("./filter-parity-comparison");
      throw new Error(`Unexpected fixture import: ${name}`);
    },
    { main: module },
  );
  const processFixture: { env: Record<string, string>; exitCode?: number } = {
    env: {
      PARITY_PRODUCTION_URL: "https://production.fixture.invalid",
      PARITY_LOCAL_URL: "http://127.0.0.1:1",
      SWAGGER_USER: "synthetic",
      SWAGGER_PASSWORD: "synthetic-private-marker",
    },
  };
  const failure = new Error("synthetic-private-marker provider detail");
  const fetch = jest.fn().mockRejectedValue(failure);
  const error = jest.fn();
  runInNewContext(source, {
    require: requireFixture,
    module,
    exports: module.exports,
    process: processFixture,
    Buffer,
    AbortSignal,
    fetch,
    console: { error, log: jest.fn() },
  });
  await nextTurn();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(write).not.toHaveBeenCalled();
  expect(processFixture.exitCode).toBe(1);
  expect(error).toHaveBeenCalledWith("Filter parity comparison failed");
  expect(JSON.stringify(error.mock.calls)).not.toContain(
    "synthetic-private-marker",
  );
});
