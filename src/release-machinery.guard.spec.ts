import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("removed release machinery", () => {
  it("keeps package, lockfile, workflow, and runtime release-free", () => {
    const root = join(__dirname, "..");
    const forbidden = [
      ["semantic", "release"].join("-"),
      ["SENTRY", "RELEASE"].join("_"),
      ["action", "release"].join("-"),
    ];
    const text = [
      "package.json",
      "yarn.lock",
      "README.md",
      ".github/workflows/ci.yml",
      "src/app.module.ts",
      "src/health/health.service.ts",
    ]
      .map(file => readFileSync(join(root, file), "utf8"))
      .join("\n");

    for (const marker of forbidden) expect(text).not.toContain(marker);
    expect(existsSync(join(root, ".releaserc"))).toBe(false);
  });
});
