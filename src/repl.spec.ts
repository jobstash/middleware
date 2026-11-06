import { setImmediate as nextTurn } from "node:timers/promises";

const mockRepl = jest.fn();
jest.mock("@nestjs/core", () => ({ repl: mockRepl }));
jest.mock("./app.module", () => ({ AppModule: class {} }));
jest.mock("dotenv", () => ({ config: jest.fn() }));

describe("REPL startup rejection ownership", () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined;
    mockRepl.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  it("leaves successful startup unchanged", async () => {
    mockRepl.mockResolvedValue(undefined);
    jest.isolateModules(() => {
      jest.requireActual("./repl");
    });
    await nextTurn();
    expect(mockRepl).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("records failure without emitting initialization configuration", async () => {
    mockRepl.mockRejectedValue(new Error("synthetic private startup context"));
    jest.isolateModules(() => {
      jest.requireActual("./repl");
    });
    await nextTurn();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith("REPL bootstrap failed");
    expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain(
      "synthetic private startup context",
    );
  });
});
