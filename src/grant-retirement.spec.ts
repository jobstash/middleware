import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string): string =>
  readFileSync(join(__dirname, path), "utf8");

describe("retired grant product", () => {
  it("has no grant program search, metrics, or ingestion runtime", () => {
    for (const path of [
      "grants/grants.service.ts",
      "postgres/grant.repository.ts",
      "google-bigquery/google-bigquery.module.ts",
      "google-bigquery/google-bigquery.service.ts",
    ]) {
      expect(existsSync(join(__dirname, path))).toBe(false);
    }
    expect(source("../package.json")).not.toContain("@google-cloud/bigquery");

    const runtime = [
      source("app.module.ts"),
      source("postgres/postgres.module.ts"),
      source("postgres/search.repository.ts"),
      source("admin-ingestion/admin-ingestion.dto.ts"),
      source("shared/interfaces/search-result.interface.ts"),
    ].join("\n");
    for (const retired of [
      "GrantRepository",
      "GrantsService",
      "GoogleBigQueryModule",
      "grant_chunk_embeddings",
      "grant_indexing",
      "KarmaGapProgram",
    ]) {
      expect(runtime).not.toContain(retired);
    }
  });

  it("retains only the historical GrantFunding response shape", () => {
    const contract = source("shared/interfaces/grant.interface.ts");
    expect(contract).toContain("export class GrantFunding");
    expect(contract).toContain("amount: t.union([t.number, t.null])");
    expect(contract).toContain("programName: t.union([t.string, t.null])");
    expect(contract).not.toContain("GrantListResult");
    expect(contract).not.toContain("KarmaGap");
    expect(contract).not.toContain("src/grants/generated");

    const organizationContract = source(
      "shared/interfaces/organization-with-links.interface.ts",
    );
    const organizationUpdate = source(
      "organizations/dto/update-organization.input.ts",
    );
    const organizationRepository = source(
      "postgres/search-document.repository.ts",
    );
    expect(organizationContract).toContain(
      "grants: t.array(GrantFunding.GrantFundingType)",
    );
    expect(
      `${organizationContract}\n${organizationUpdate}\n${organizationRepository}`,
    ).not.toMatch(/grantSites|grant_sites|HAS_GRANTSITE|GrantSite/);
  });
});
