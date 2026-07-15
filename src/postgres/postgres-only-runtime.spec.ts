import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const legacyGraphEngine = ["neo", "4j"].join("");
const legacyGraphOrm = ["neo", "gma"].join("");
const FORBIDDEN_PACKAGES = [
  `${legacyGraphEngine}-driver`,
  legacyGraphOrm,
  `nestjs-${legacyGraphOrm}`,
  "@langchain/community",
  "langchain",
];

const productionTypeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
      ? [path]
      : [];
  });

describe("PostgreSQL-only middleware runtime", () => {
  it("does not declare legacy graph database dependencies", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const packageName of FORBIDDEN_PACKAGES) {
      expect(dependencies).not.toHaveProperty(packageName);
    }
  });

  it("contains no legacy graph runtime imports or configuration", () => {
    const source = productionTypeScriptFiles(join(process.cwd(), "src"))
      .map(path => readFileSync(path, "utf8"))
      .join("\n");
    const envExample = readFileSync(
      join(process.cwd(), ".env.example"),
      "utf8",
    );

    const forbiddenRuntime = new RegExp(
      [
        `${legacyGraphEngine}-driver`,
        `nestjs-${legacyGraphOrm}`,
        `\\b${legacyGraphOrm}\\b`,
        `${legacyGraphEngine}VectorStore`,
        "queryRunner",
        `${legacyGraphEngine.toUpperCase()}_`,
      ].join("|"),
      "i",
    );
    expect(source).not.toMatch(forbiddenRuntime);
    expect(envExample).not.toContain(`${legacyGraphEngine.toUpperCase()}_`);
  });
});
