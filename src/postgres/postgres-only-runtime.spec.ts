import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_PACKAGES = [
  "neo4j-driver",
  "neogma",
  "nestjs-neogma",
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

  it("contains no Neo4j runtime imports, configuration, or query runners", () => {
    const source = productionTypeScriptFiles(join(process.cwd(), "src"))
      .map(path => readFileSync(path, "utf8"))
      .join("\n");
    const envExample = readFileSync(
      join(process.cwd(), ".env.example"),
      "utf8",
    );

    expect(source).not.toMatch(
      /neo4j-driver|nestjs-neogma|\bneogma\b|Neo4jVectorStore|queryRunner|NEO4J_/,
    );
    expect(envExample).not.toContain("NEO4J_");
  });
});
