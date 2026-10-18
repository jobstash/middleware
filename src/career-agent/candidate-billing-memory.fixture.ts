import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { CandidateStripeBinding } from "./stripe-candidate-subscription";

type MemorySubscription = CandidateStripeBinding & {
  status: string; checkout_url: string; billing_provider: string; created_at: number;
  provider_event_at: string | null; reconciled_at: number | null; reconcile_attempt_at: number | null;
};
/** Tiny SQL-boundary fixture, not a production database or entitlement override. */
export class CandidateBillingMemoryFixture {
  readonly subscriptions = new Map<string, MemorySubscription>();
  readonly events = new Map<string, { id: string }>();
  private readonly mutations = new Map<string, { input_hash: string; response: unknown }>();
  private queue = Promise.resolve();
  readonly database: PostgresService;
  constructor() {
    // Only the repository's query/transaction surface is used in synthetic tests.
    this.database = { query: this.query.bind(this), transaction: this.transaction.bind(this) } as unknown as PostgresService;
  }
  private async transaction<T>(work: (db: EntityManager) => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const snapshot = structuredClone({ subscriptions: this.subscriptions, events: this.events, mutations: this.mutations });
    try {
      // A real SQL transaction is exercised separately by career.repository.integration.spec.ts.
      const manager = this.database as unknown as EntityManager;
      return await work(manager);
    } catch (error) {
      for (const [target, saved] of [[this.subscriptions, snapshot.subscriptions], [this.events, snapshot.events], [this.mutations, snapshot.mutations]] as const) {
        target.clear();
        // Each pair has matching map shapes; the tuple union loses that relation.
        const destination = target as Map<string, unknown>;
        for (const [key, value] of saved) destination.set(key, value);
      }
      throw error;
    } finally { release(); }
  }
  private async query(sql: string, parameters: unknown[] = []): Promise<unknown[]> {
    const text = sql.replace(/\s+/g, " ").trim();
    const [id, second, third, fourth, fifth, sixth, seventh] = parameters;
    if (text.startsWith("SELECT id::text FROM graph_nodes")) {
      return id === "alice" ? [{ id: "1" }] : id === "bob" ? [{ id: "2" }] : [];
    }
    if (text.startsWith("SELECT input_hash,response FROM candidate_mutations")) {
      const mutation = this.mutations.get(`${id}:${second}`); return mutation ? [structuredClone(mutation)] : [];
    }
    if (text.startsWith("INSERT INTO candidate_mutations")) {
      this.mutations.set(`${id}:${second}`, { input_hash: String(third), response: JSON.parse(String(fourth)) }); return [];
    }
    if (text.startsWith("SELECT EXISTS(SELECT 1 FROM candidate_subscriptions")) {
      return [{ active: [...this.subscriptions.values()].some(row => row.user_node_id === String(id) && row.status === "active" &&
        row.paid_until && new Date(row.paid_until).getTime() > Date.now()) }];
    }
    if (text.startsWith("INSERT INTO candidate_subscriptions")) {
      this.subscriptions.set(String(id), {
        charge_id: String(id), user_node_id: String(second), checkout_url: String(third), interval: fourth === "year" ? "year" : "month",
        checkout_request_id: String(fifth), stripe_customer_id: String(sixth), stripe_price_id: String(seventh),
        stripe_subscription_id: null, status: "pending", paid_until: null, provider_state: null, provider_event_at: null,
        billing_provider: "stripe", created_at: Date.now() + this.subscriptions.size, reconciled_at: null, reconcile_attempt_at: null,
      }); return [];
    }
    if (text.startsWith("WITH updated AS (UPDATE candidate_subscriptions SET status=$2")) {
      const row = this.subscriptions.get(String(id));
      if (!row) return [];
      row.status = String(second); row.paid_until = third ? String(third) : null;
      row.provider_state = JSON.parse(String(fourth)); row.stripe_subscription_id ??= fifth ? String(fifth) : null;
      row.provider_event_at = sixth ? String(sixth) : row.provider_event_at;
      row.reconciled_at = Date.now(); row.reconcile_attempt_at = Date.now(); return [structuredClone(row)];
    }
    if (text.startsWith("UPDATE candidate_subscriptions SET reconcile_attempt_at")) {
      const row = this.subscriptions.get(String(id)); if (row) row.reconcile_attempt_at = Date.now(); return [];
    }
    if (text.startsWith("INSERT INTO candidate_payment_events")) {
      if (this.events.has(String(id))) return [];
      const event = { id: String(id) }; this.events.set(event.id, event); return [event];
    }
    if (text.startsWith("SELECT") && text.includes("FROM candidate_subscriptions")) {
      let rows = [...this.subscriptions.values()];
      if (text.includes("(($1::text")) {
        rows = rows.filter(row => row.charge_id === id || (second && row.stripe_subscription_id === second) ||
          (third && row.checkout_request_id === third && row.user_node_id === fourth));
      } else if (text.includes("WHERE charge_id=$1")) rows = rows.filter(row => row.charge_id === id);
      else if (text.includes("user_node_id=$1")) rows = rows.filter(row => row.user_node_id === String(id));
      if (text.includes("billing_provider='stripe'")) rows = rows.filter(row => row.billing_provider === "stripe");
      if (text.includes("billing_provider='legacy'")) rows = rows.filter(row => row.billing_provider === "legacy");
      if (text.includes("AND status='active' AND paid_until>now()")) rows = rows.filter(row => row.status === "active" && row.paid_until && new Date(row.paid_until).getTime() > Date.now());
      if (text.includes("COALESCE(provider_state->>'terminal'")) rows = rows.filter(row => !row.provider_state?.terminal);
      if (text.includes("interval '15 minutes'")) rows = rows.filter(row => (row.reconcile_attempt_at ?? row.reconciled_at ?? 0) < Date.now() - 900000);
      rows.sort((a, b) => {
        if (text.includes("ORDER BY (status='active'")) {
          const activeA = a.status === "active" && a.paid_until && new Date(a.paid_until).getTime() > Date.now() ? 1 : 0;
          const activeB = b.status === "active" && b.paid_until && new Date(b.paid_until).getTime() > Date.now() ? 1 : 0;
          if (activeA !== activeB) return activeB - activeA;
        }
        return b.created_at - a.created_at;
      });
      return structuredClone(text.includes("LIMIT 1") && !text.includes("LIMIT 100") ? rows.slice(0, 1) : rows);
    }
    throw new Error(`Unimplemented synthetic billing SQL: ${text}`);
  }
}
