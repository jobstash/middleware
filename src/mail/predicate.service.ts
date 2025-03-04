import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";

export class PredicateService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async isPaymentReminderNeeded(data: {
    paymentReference: string;
    orgId: string;
  }): Promise<boolean> {
    const { paymentReference, orgId } = data;
    const payment = (
      await this.neogma.queryRunner.run(
        `
        MATCH (payment:PendingPayment {reference: $paymentReference})<-[:HAS_PENDING_PAYMENT]-(:Organization {orgId: $orgId})
        RETURN payment { .* } as payment
      `,
        { paymentReference, orgId },
      )
    ).records[0]?.get("payment");

    return !!payment;
  }

  getPredicates(): Record<string, (data: object) => Promise<boolean>> {
    return {
      isPaymentReminderNeeded: this.isPaymentReminderNeeded.bind(this),
    };
  }
}
