import {
  assertFixtureEnvironment,
  resetPostgresFixture,
} from "../../test/postgres-reset";
import { PostgresService } from "./postgres.service";

const integration =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;
const resetSql = "TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE";

integration("final-schema fixture reset receipt integrity", () => {
  let postgres: PostgresService;
  beforeAll(async () => {
    postgres = new PostgresService({
      url: assertFixtureEnvironment().href,
      maxConnections: 1,
      statementTimeoutMs: 10000,
      applicationName: "middleware-fixture-reset-proof",
    });
    await postgres.onModuleInit();
  });
  afterAll(async () => postgres?.onModuleDestroy());

  const triggers = (): Promise<Record<string, unknown>[]> =>
    postgres.query(`
    SELECT table_class.relname, trigger.tgname, trigger.tgenabled,
      pg_get_triggerdef(trigger.oid) AS definition
    FROM pg_trigger trigger JOIN pg_class table_class ON table_class.oid=trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid=table_class.relnamespace
    WHERE namespace.nspname='public' AND NOT trigger.tgisinternal
    ORDER BY table_class.relname,trigger.tgname`);

  async function seedReceipt(): Promise<void> {
    await postgres.transaction(async manager => {
      await manager.query(
        "INSERT INTO search_projection_transactions(transaction_id) VALUES(txid_current())",
      );
      await manager.query(
        "INSERT INTO github_anchor_projection_receipts(transaction_id) VALUES(txid_current())",
      );
    });
  }

  it("clears migration-280 receipts in the same reset and restores every trigger", async () => {
    const before = await triggers();
    await seedReceipt();
    await resetPostgresFixture(postgres, resetSql);
    expect(await triggers()).toEqual(before);
    expect(
      await postgres.query("SELECT * FROM github_anchor_projection_receipts"),
    ).toEqual([]);
    expect(
      await postgres.query("SELECT * FROM search_projection_transactions"),
    ).toEqual([]);
    await expect(postgres.query(resetSql)).rejects.toThrow(
      "TRUNCATE bypasses search dependency invalidation",
    );
  });

  it("rolls back receipt deletion and every dropped guard when an unknown guard fails", async () => {
    await seedReceipt();
    const receipts = await postgres.query(
      "SELECT * FROM github_anchor_projection_receipts ORDER BY transaction_id",
    );
    const pending = await postgres.query(
      "SELECT * FROM search_projection_transactions ORDER BY transaction_id",
    );
    await postgres.query(`CREATE FUNCTION fixture_reset_induced_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture reset induced failure'; END $$`);
    try {
      await postgres.query(`CREATE TRIGGER fixture_reset_unknown_guard AFTER TRUNCATE ON search_projection_transactions
        FOR EACH STATEMENT EXECUTE FUNCTION fixture_reset_induced_failure()`);
      const before = await triggers();
      await expect(resetPostgresFixture(postgres, resetSql)).rejects.toThrow(
        "fixture reset induced failure",
      );
      expect(await triggers()).toEqual(before);
      expect(
        await postgres.query(
          "SELECT * FROM github_anchor_projection_receipts ORDER BY transaction_id",
        ),
      ).toEqual(receipts);
      expect(
        await postgres.query(
          "SELECT * FROM search_projection_transactions ORDER BY transaction_id",
        ),
      ).toEqual(pending);
      await expect(postgres.query(resetSql)).rejects.toThrow(
        "TRUNCATE bypasses search dependency invalidation",
      );
    } finally {
      await postgres.query(
        "DROP TRIGGER IF EXISTS fixture_reset_unknown_guard ON search_projection_transactions",
      );
      await postgres.query("DROP FUNCTION fixture_reset_induced_failure()");
    }
    await resetPostgresFixture(postgres, resetSql);
  });
});
