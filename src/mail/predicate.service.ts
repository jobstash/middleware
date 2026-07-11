import { GraphRepository } from "src/postgres/graph.repository";

export class PredicateService {
  constructor(private readonly graph: GraphRepository) {}

  async isPaymentReminderNeeded(data: {
    paymentReference: string;
    orgId: string;
  }): Promise<boolean> {
    const { paymentReference, orgId } = data;
    return this.graph.hasRelationship({
      sourceLabel: "Organization",
      sourceWhere: { orgId },
      type: "HAS_PENDING_PAYMENT",
      targetLabel: "PendingPayment",
      targetWhere: { reference: paymentReference },
    });
  }

  getPredicates(): Record<string, (data: object) => Promise<boolean>> {
    return {
      isPaymentReminderNeeded: this.isPaymentReminderNeeded.bind(this),
    };
  }
}
