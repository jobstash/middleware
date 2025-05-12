import { Inject, Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { CustomLogger } from "src/shared/utils/custom-logger";
import {
  data,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import {
  JobPromotionMetadata,
  SubscriptionMetadata,
} from "src/stripe/dto/webhook-data.dto";
import { JobsService } from "src/jobs/jobs.service";
import { NewSubscriptionInput } from "src/subscriptions/new-subscription.input";
import { BUNDLE_LOOKUP_KEYS, LOOKUP_KEYS } from "src/shared/constants";

@Injectable()
export class StripeService {
  private readonly logger = new CustomLogger(StripeService.name);

  constructor(
    @Inject("STRIPE_CLIENT")
    private readonly stripe: Stripe,
    @Inject("DOMAIN")
    private readonly domain: string,
    private readonly jobsService: JobsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async createCustomer(
    email: string,
  ): Promise<ResponseWithOptionalData<Stripe.Customer>> {
    try {
      const customer = await this.stripe.customers.create({ email });
      return {
        success: true,
        message: "Customer created successfully",
        data: customer,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::createCustomer Failed to create customer ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to create customer",
      };
    }
  }

  async getCustomerByEmail(
    email: string,
  ): Promise<
    ResponseWithOptionalData<
      Stripe.Customer | Stripe.DeletedCustomer | undefined
    >
  > {
    try {
      const customers = await this.stripe.customers.list({
        email,
        limit: 1,
      });
      console.log(customers);
      return {
        success: true,
        message: "Customer retrieved successfully",
        data: customers.data[0],
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::getCustomerByEmail Failed to get customer ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to get customer",
      };
    }
  }

  async getCustomerById(
    id: string,
  ): Promise<
    ResponseWithOptionalData<
      Stripe.Customer | Stripe.DeletedCustomer | undefined
    >
  > {
    try {
      const customer = await this.stripe.customers.retrieve(id);
      return {
        success: true,
        message: "Customer retrieved successfully",
        data: customer,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::getCustomerByEmail Failed to get customer ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to get customer",
      };
    }
  }

  async createCheckoutSession(
    lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
    mode: "subscription" | "payment" = "subscription",
    customerId?: string,
    metadata?: Record<string, string>,
  ): Promise<
    ResponseWithOptionalData<{ id: string; url: string; total: number }>
  > {
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode,
        line_items: lineItems,
        billing_address_collection: "required",
        customer: customerId,
        success_url: `${this.domain}/payment/confirmation`,
        cancel_url: `${this.domain}`,
        allow_promotion_codes: true,
        metadata,
      });
      return {
        success: true,
        message: "Checkout session created successfully",
        data: {
          id: session.id,
          url: session.url,
          total: session.amount_total,
        },
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        scope.setExtra("input", { lineItems, customerId });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::createCheckoutSession Failed to create checkout session ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to create checkout session",
      };
    }
  }

  async createCustomerPortalSession(
    sessionId: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: sessionId,
        return_url: `${this.domain}`,
      });
      return {
        success: true,
        message: "Customer portal session created successfully",
        data: session.url,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        scope.setExtra("input", sessionId);
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::createCustomerPortalSession Failed to create customer portal session ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to create customer portal session",
      };
    }
  }

  async getProductPrices(): Promise<Stripe.Price[]> {
    try {
      const prices = await this.stripe.prices.list({
        active: true,
        currency: "usd",
        expand: ["data.tiers"],
        limit: 100,
      });
      return prices.data;
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::getProductPrices Failed to get product prices ${error.message}`,
      );
      return [];
    }
  }

  async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const metadata = (session.metadata || {}) as Record<string, string>;
    const action = metadata.action;

    try {
      switch (action) {
        case "job-promotion":
          this.logger.log(`Handling job promotion webhook event`);
          const shortUUID = (
            JSON.parse(metadata.calldata) as unknown as JobPromotionMetadata
          ).shortUUID;
          await this.jobsService.handleJobPromotion(shortUUID);
          break;
        case "new-subscription":
          await this.subscriptionsService.createNewSubscription(
            JSON.parse(metadata.calldata) as unknown as SubscriptionMetadata,
            session.subscription as string,
          );
          break;

        case "subscription-renewal":
          await this.subscriptionsService.renewSubscription(
            JSON.parse(metadata.calldata) as unknown as SubscriptionMetadata,
          );
          break;

        case "subscription-change":
          await this.subscriptionsService.changeSubscription(
            JSON.parse(metadata.calldata) as unknown as SubscriptionMetadata,
          );
          break;

        default:
          this.logger.warn(`Unknown checkout session action: ${action}`);
      }
    } catch (err) {
      this.logger.error(
        `Error handling checkout.session.completed – ${err.message}`,
      );
      throw err;
    }
  }

  async handleStripeSubscriptionUpdated(
    sub: Stripe.Subscription,
  ): Promise<void> {
    this.logger.log(`Stripe subscription updated: ${sub.id}`);

    if (sub.cancel_at_period_end || sub.status === "canceled") {
      await this.handleStripeSubscriptionDeleted(sub);
    }
  }

  async handleStripeSubscriptionDeleted(
    sub: Stripe.Subscription,
  ): Promise<void> {
    const metadata = (sub.metadata || {}) as Record<string, string>;

    try {
      await this.subscriptionsService.cancelSubscription(
        metadata.wallet,
        metadata.orgId,
      );
    } catch (err) {
      this.logger.error(
        `Error handling subscription deletion – ${err.message}`,
      );
    }
  }

  async calculateAmount(
    lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
  ): Promise<number> {
    const prices = await this.getProductPrices();
    return lineItems.reduce((acc, item) => {
      const price = prices.find(x => x.id === item.price);
      if (price.billing_scheme === "per_unit") {
        return acc + price.unit_amount * item.quantity;
      } else {
        let subtotal = 0;
        let quantity = item.quantity;
        for (const tier of price.tiers) {
          const tierLimit = tier.up_to === null ? Infinity : tier.up_to;
          if (quantity > tierLimit) {
            subtotal += tier.unit_amount * tierLimit;
            quantity -= tierLimit;
          } else {
            subtotal += tier.unit_amount * quantity;
            quantity = 0;
          }
        }
        return acc + subtotal;
      }
    }, 0);
  }

  async cancelSubscription(orgId: string): Promise<ResponseWithNoData> {
    try {
      const { externalId } = data(
        await this.subscriptionsService.getSubscriptionInfo(orgId),
      );
      if (externalId) {
        await this.stripe.subscriptions.update(externalId, {
          cancel_at_period_end: true,
        });
      }
      return {
        success: true,
        message: "Subscription cancelled successfully",
      };
    } catch (err) {
      this.logger.error(`Error cancelling subscription – ${err.message}`);
      return {
        success: false,
        message: "Error cancelling subscription",
      };
    }
  }

  async initiateNewSubscription(input: {
    wallet: string;
    email: string;
    dto: NewSubscriptionInput;
  }): Promise<ResponseWithOptionalData<string>> {
    try {
      const { wallet, dto } = input;
      const lookupKeys = [
        dto.jobstash ? BUNDLE_LOOKUP_KEYS.JOBSTASH[dto.jobstash] : null,
        dto.veri ? BUNDLE_LOOKUP_KEYS.VERI[dto.veri] : null,
        dto.stashAlert ? LOOKUP_KEYS.STASH_ALERT_PRICE : null,
      ].filter(Boolean);
      const prices = await this.getProductPrices().then(x =>
        x.filter(x => lookupKeys.includes(x.lookup_key)),
      );
      const lineItems = prices.map(x => {
        if (x.lookup_key.includes("jobstash")) {
          return {
            price: x.id,
            quantity: dto.jobstash === "starter" ? 0 : 1 + dto.extraSeats,
          };
        } else {
          return {
            price: x.id,
            quantity: 1,
          };
        }
      });

      const amount = await this.calculateAmount(lineItems);

      if (dto.jobstash !== "starter") {
        this.logger.log("Creating customer");
        const customer = data(await this.createCustomer(input.email));
        const { id, url, total } = data(
          await this.createCheckoutSession(
            lineItems,
            "subscription",
            customer.id,
            {
              calldata: JSON.stringify({
                ...dto,
                wallet,
                amount,
              }),
              action: "new-subscription",
            },
          ),
        );

        if (id && url && total) {
          this.logger.log("Creating pending payment");
          await this.subscriptionsService.createPendingPayment(
            wallet,
            dto.orgId,
            amount,
            "new-subscription",
            id,
            url,
          );

          this.logger.log("Subscription initiated successfully");
          return {
            success: true,
            message: "Subscription initiated successfully",
            data: url,
          };
        } else {
          this.logger.log("Error creating new subscription");
          return {
            success: false,
            message: "Subscription initiation failed",
          };
        }
      } else {
        this.logger.log("Creating new subscription");
        return this.subscriptionsService.createNewSubscription({
          jobstash: "starter",
          veri: null,
          stashAlert: false,
          orgId: dto.orgId,
          extraSeats: 0,
          amount,
          wallet,
        });
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::initiateSubscription ${err.message}`,
      );
      return {
        success: false,
        message: `Error initiating subscription`,
      };
    }
  }

  async initiateSubscriptionRenewal(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const {
        tier: jobstash,
        veri,
        stashAlert,
        extraSeats,
      } = data(await this.subscriptionsService.getSubscriptionInfo(orgId));

      if (jobstash === "starter") {
        return {
          success: false,
          message:
            "You can't renew your free trial. Please upgrade to a premium plan to keep using JobStash.xyz.",
        };
      } else {
        const email = await this.subscriptionsService.getSubscriptionOwnerEmail(
          wallet,
          orgId,
        );

        const lookupKeys = [
          jobstash ? BUNDLE_LOOKUP_KEYS.JOBSTASH[jobstash] : null,
          veri ? BUNDLE_LOOKUP_KEYS.VERI[veri] : null,
          stashAlert ? LOOKUP_KEYS.STASH_ALERT_PRICE : null,
        ].filter(Boolean);
        const prices = await this.getProductPrices().then(x =>
          x.filter(x => lookupKeys.includes(x.lookup_key)),
        );
        const lineItems = prices.map(x => {
          if (x.lookup_key.includes("jobstash")) {
            return {
              price: x.id,
              quantity: 1 + extraSeats,
            };
          } else {
            return {
              price: x.id,
              quantity: 1,
            };
          }
        });

        const amount = await this.calculateAmount(lineItems);

        const customer = data(await this.getCustomerByEmail(email));
        const { id, url, total } = data(
          await this.createCheckoutSession(
            lineItems,
            "subscription",
            customer?.id,
            {
              calldata: JSON.stringify({
                orgId,
                jobstash,
                veri,
                stashAlert,
                extraSeats,
                wallet,
                amount,
              }),
              action: "new-subscription",
            },
          ),
        );

        if (id && url && total) {
          await this.subscriptionsService.createPendingPayment(
            wallet,
            orgId,
            amount,
            "subscription-renewal",
            id,
            url,
          );
          return {
            success: true,
            message: "Subscription renewal initiated successfully",
            data: url,
          };
        } else {
          return {
            success: false,
            message: "Subscription renewal initiation failed",
          };
        }
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::initiateSubscriptionRenewal ${err.message}`,
      );
      return {
        success: false,
        message: `Error renewing subscription`,
      };
    }
  }

  async initiateSubscriptionChange(
    wallet: string,
    orgId: string,
    dto: NewSubscriptionInput,
  ): Promise<ResponseWithOptionalData<string>> {
    try {
      const {
        tier: jobstash,
        veri,
        stashAlert,
        extraSeats,
      } = data(await this.subscriptionsService.getSubscriptionInfo(orgId));

      const {
        jobstash: newJobstash,
        veri: newVeri,
        stashAlert: newStashAlert,
        extraSeats: newExtraSeats,
      } = dto;

      if (
        jobstash === newJobstash &&
        veri === newVeri &&
        stashAlert === newStashAlert &&
        extraSeats === newExtraSeats
      ) {
        return {
          success: false,
          message: "Subscription plan change not required",
        };
      }

      if (newJobstash === "starter") {
        return {
          success: false,
          message:
            "You can't change your plan to a free trial. Please select a premium plan to change to.",
        };
      } else {
        const email = await this.subscriptionsService.getSubscriptionOwnerEmail(
          wallet,
          orgId,
        );

        const lookupKeys = [
          newJobstash ? BUNDLE_LOOKUP_KEYS.JOBSTASH[newJobstash] : null,
          newVeri ? BUNDLE_LOOKUP_KEYS.VERI[newVeri] : null,
          newStashAlert ? LOOKUP_KEYS.STASH_ALERT_PRICE : null,
        ].filter(Boolean);
        const prices = await this.getProductPrices().then(x =>
          x.filter(x => lookupKeys.includes(x.lookup_key)),
        );
        const lineItems = prices.map(x => {
          if (x.lookup_key.includes("jobstash")) {
            return {
              price: x.id,
              quantity: 1 + newExtraSeats,
            };
          } else {
            return {
              price: x.id,
              quantity: 1,
            };
          }
        });

        const amount = await this.calculateAmount(lineItems);

        const result = await this.getCustomerByEmail(email);

        const customer = data(result);
        console.log(customer);
        if (!customer) {
          return {
            success: false,
            message: "Customer not found",
          };
        }

        const paymentLink = data(
          await this.createCheckoutSession(
            lineItems,
            "subscription",
            customer?.id,
            {
              calldata: JSON.stringify({
                orgId,
                jobstash: newJobstash,
                veri: newVeri,
                stashAlert: newStashAlert,
                extraSeats: newExtraSeats,
                wallet,
                amount,
              }),
              action: "subscription-change",
            },
          ),
        );

        if (paymentLink) {
          await this.subscriptionsService.createPendingPayment(
            wallet,
            orgId,
            amount,
            "subscription-change",
            paymentLink.id,
            paymentLink.url,
          );
          return {
            success: true,
            message: "Subscription change initiated successfully",
            data: paymentLink.url,
          };
        } else {
          return {
            success: false,
            message: "Subscription change initiation failed",
          };
        }
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::initiateSubscriptionChange ${err.message}`,
      );
      return {
        success: false,
        message: `Error changing subscription`,
      };
    }
  }

  async initiateJobPromotionPayment(
    uuid: string,
    ecosystem: string,
  ): Promise<ResponseWithOptionalData<{ id: string; url: string }>> {
    try {
      const jobDetails = await this.jobsService.getJobDetailsByUuid(
        uuid,
        ecosystem,
      );
      if (!jobDetails) {
        return {
          success: false,
          message: "Job not found",
        };
      }

      const lineItem = await this.getProductPrices().then(x => {
        const item = x.find(
          x => x.lookup_key === LOOKUP_KEYS.JOB_PROMOTION_PRICE,
        );
        return {
          price: item.id,
          quantity: 1,
        };
      });

      const charge = data(
        await this.createCheckoutSession([lineItem], "payment", undefined, {
          calldata: JSON.stringify({
            shortUUID: uuid,
          }),
          action: "job-promotion",
        }),
      );

      if (charge) {
        return {
          success: true,
          message: "Job promotion payment url generated successfully",
          data: {
            id: charge.id,
            url: charge.url,
          },
        };
      } else {
        return {
          success: false,
          message: "Job promotion payment url generation failed",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "jobs.service",
        });
        scope.setExtra("input", { uuid, ecosystem });
        Sentry.captureException(err);
      });
      this.logger.error(
        `JobsService::getJobPromotionPaymentUrl ${err.message}`,
      );
      return {
        success: false,
        message: "Error generating job promotion payment url",
      };
    }
  }
}
