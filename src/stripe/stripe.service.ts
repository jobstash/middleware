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
import { NewSubscriptionInput } from "src/subscriptions/dto/new-subscription.input";
import {
  BUNDLE_LOOKUP_KEYS,
  LOOKUP_KEYS,
  METERED_SERVICE_LOOKUP_KEYS,
} from "src/shared/constants";
import {
  JOBSTASH_BUNDLE_PRICING,
  VERI_BUNDLE_PRICING,
} from "src/shared/constants/pricing";
import { MeteredService, QuotaUsage } from "src/shared/interfaces/org";
import { ChangeSubscriptionInput } from "src/subscriptions/dto/change-subscription.input";

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

  async createOrRetrieveCustomer(
    email: string,
  ): Promise<
    ResponseWithOptionalData<Stripe.Customer | Stripe.DeletedCustomer>
  > {
    try {
      const existingCustomer = data(await this.getCustomerByEmail(email));
      if (existingCustomer) {
        return {
          success: true,
          message: "Customer retrieved successfully",
          data: existingCustomer,
        };
      } else {
        const customer = await this.stripe.customers.create({ email });
        return {
          success: true,
          message: "Customer created successfully",
          data: customer,
        };
      }
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
      });
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

  async getCustomerBySubscriptionId(
    id: string,
  ): Promise<
    ResponseWithOptionalData<
      Stripe.Customer | Stripe.DeletedCustomer | undefined
    >
  > {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(id);
      const customer = await this.stripe.customers.retrieve(
        subscription.customer as string,
      );
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
    flag?: string,
  ): Promise<
    ResponseWithOptionalData<{ id: string; url: string; total: number }>
  > {
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode,
        line_items: lineItems,
        billing_address_collection: "required",
        customer: customerId,
        success_url:
          `${this.domain}/payment/confirmation` + (flag ? `?flag=${flag}` : ""),
        cancel_url: `${this.domain}`,
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

  async getMeteredServiceMeter(
    service: MeteredService,
  ): Promise<ResponseWithOptionalData<Stripe.Billing.Meter>> {
    try {
      const meters = await this.stripe.billing.meters.list({
        expand: ["data"],
        limit: 100,
      });
      const meter = meters.data.find(
        x => x.event_name === METERED_SERVICE_LOOKUP_KEYS[service].eventName,
      );
      return {
        success: true,
        message: "Successfully retrieved metered service meter",
        data: meter,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        scope.setExtra("input", { service });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::getMeteredServiceMeter Failed to retrieve metered service meter ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve metered service meter",
      };
    }
  }

  async getMeteredServiceUsage(
    externalId: string,
    service: MeteredService,
    epochStart: number,
    epochEnd: number,
    cursor?: string,
    limit?: number,
    valueGroupingWindow?: Stripe.Billing.MeterListEventSummariesParams.ValueGroupingWindow,
  ): Promise<ResponseWithOptionalData<QuotaUsage[]>> {
    try {
      const customer = data(await this.getCustomerBySubscriptionId(externalId));
      const meter = data(await this.getMeteredServiceMeter(service));
      if (customer) {
        const usage = await this.stripe.billing.meters.listEventSummaries(
          meter.id,
          {
            customer: customer.id,
            limit: limit ?? 100,
            start_time: epochStart,
            end_time: epochEnd,
            starting_after: cursor,
            value_grouping_window: valueGroupingWindow,
          },
        );
        return {
          success: true,
          message: "Successfully retrieved metered service usage",
          data: usage.data.map(x => ({
            id: x.id,
            service,
            amount: Number(x.aggregated_value),
            createdTimestamp: x.end_time,
          })),
        };
      } else {
        return {
          success: false,
          message:
            "Failed to retrieve metered service usage for missing customer",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        scope.setExtra("input", { externalId, service, epochStart, epochEnd });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::getMeteredServiceUsage Failed to retrieve metered service usage ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve metered service usage",
      };
    }
  }

  async recordMeteredServiceUsage(
    externalId: string,
    service: MeteredService,
    amount: number,
  ): Promise<ResponseWithNoData> {
    try {
      const customer = data(await this.getCustomerBySubscriptionId(externalId));
      if (customer) {
        const keys = METERED_SERVICE_LOOKUP_KEYS[service];
        await this.stripe.billing.meterEvents.create({
          event_name: keys.eventName,
          payload: {
            stripe_customer_id: customer.id,
            [keys.valueKey]: amount.toString(),
          },
        });
        return {
          success: true,
          message: "Successfully recorded metered service usage",
        };
      } else {
        return {
          success: false,
          message:
            "Failed to record metered service usage for missing customer",
        };
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        scope.setExtra("input", { externalId, service, amount });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::recordMeteredServiceUsage Failed to record metered service usage ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to record metered service usage",
      };
    }
  }

  async getCustomerInvoices(
    externalId: string,
  ): Promise<ResponseWithOptionalData<Stripe.Invoice[]>> {
    try {
      const customer = data(await this.getCustomerBySubscriptionId(externalId));
      if (!customer) {
        return {
          success: false,
          message: "Failed to retrieve customer invoices for missing customer",
        };
      }
      const invoices = await this.stripe.invoices.list({
        customer: customer.id,
        limit: 100,
        subscription: externalId,
      });
      return {
        success: true,
        message: "Successfully retrieved customer invoices",
        data: invoices.data,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "stripe-call",
          source: "stripe.service",
        });
        scope.setExtra("input", { externalId });
        Sentry.captureException(error);
      });
      this.logger.error(
        `StripeService::getCustomerInvoices Failed to retrieve customer invoices ${error.message}`,
      );
      return {
        success: false,
        message: "Failed to retrieve customer invoices",
      };
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
          this.logger.log("Handling new subscription webhook event");
          await this.subscriptionsService.createNewSubscription(
            JSON.parse(metadata.calldata) as unknown as SubscriptionMetadata,
            session.subscription as string,
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

  async handleInvoicePaymentSucceeded(
    event: Stripe.InvoicePaymentSucceededEvent,
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    if (
      !["subscription_cycle", "subscription_update"].includes(
        invoice.billing_reason,
      ) ||
      !invoice.parent
    )
      return;

    this.logger.log(`Handling invoice payment succeeded - ${event.id}`);

    const subscriptionId = invoice.parent.subscription_details
      .subscription as string;

    const existing = data(
      await this.subscriptionsService.getSubscriptionInfoByExternalId(
        subscriptionId,
      ),
    );

    if (!existing) {
      this.logger.warn(
        `Subscription ${subscriptionId} not found in DB when handling invoice.payment_succeeded`,
      );
      return;
    }

    const sub = (await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data"],
    })) as Stripe.Subscription;

    if (sub.metadata?.jobstash === "starter") return;

    this.logger.log(`Handling invoice payment succeeded: ${invoice.id}`);

    const prices = await this.getProductPrices();

    const itemLines = invoice.lines.data.map(z => ({
      lineItem: z,
      lookupKey: prices.find(p => p.id === z.pricing.price_details.price)
        ?.lookup_key,
    }));

    const jobstashLine = itemLines.find(l =>
      l.lookupKey?.startsWith("jobstash_"),
    );

    const extraSeatsLine = itemLines.find(
      l => l.lookupKey?.startsWith("jobstash_") && l.lineItem.quantity > 1,
    );

    if (!jobstashLine) {
      this.logger.warn(`Jobstash bundle not selected. Skipping`);
      return;
    }

    const newTier = jobstashLine.lookupKey.split("_")[1];
    const newExtraSeats = extraSeatsLine.lineItem.quantity ?? 0;

    const veriLine = itemLines.find(l => l.lookupKey?.startsWith("veri_"));
    const newVeri = veriLine ? veriLine.lookupKey.split("_")[1] : null;

    const newStashAlert =
      itemLines.find(l => l.lookupKey === LOOKUP_KEYS.STASH_ALERT_PRICE) !==
      undefined;

    const isPlanChange =
      existing.tier !== newTier ||
      (existing.veri ?? null) !== newVeri ||
      (existing.stashAlert ?? false) !== newStashAlert ||
      (existing.extraSeats ?? 0) !== newExtraSeats;

    if (isPlanChange) {
      this.logger.log(`Handling plan change for ${subscriptionId}`);
      const meta: Omit<SubscriptionMetadata, "orgId" | "wallet"> = {
        jobstash: newTier,
        veri: newVeri,
        stashAlert: newStashAlert,
        extraSeats: newExtraSeats,
        amount: invoice.amount_paid,
      };

      await this.subscriptionsService.changeSubscription(meta, invoice.id, sub);
    } else {
      this.logger.log(
        `Handling subscription renewal/reactivation for ${subscriptionId}`,
      );
      await this.subscriptionsService.renewSubscription(
        subscriptionId,
        invoice.amount_paid,
        invoice.id,
      );
    }
  }

  async handleStripeSubscriptionUpdated(
    evt: Stripe.CustomerSubscriptionUpdatedEvent,
  ): Promise<void> {
    try {
      const sub = evt.data.object as Stripe.Subscription;
      const externalId = sub.id;

      if (!evt.data.previous_attributes.items) {
        return;
      }

      this.logger.log(`Handling subscription updated - ${evt.id}`);

      const existing = data(
        await this.subscriptionsService.getSubscriptionInfoByExternalId(
          externalId,
        ),
      );

      if (!existing) {
        this.logger.warn(
          `Subscription ${externalId} not found in DB when handling subscription.updated`,
        );
        return;
      }

      const previousPayg = evt.data.previous_attributes.items.data.some(
        i => i.price.lookup_key === LOOKUP_KEYS.VERI_PAYG_PRICE,
      );

      const newPayg = sub.items.data.some(
        i => i.price.lookup_key === LOOKUP_KEYS.VERI_PAYG_PRICE,
      );

      if (previousPayg !== newPayg) {
        this.logger.log(`Handling payg opt in state change`);
        await this.subscriptionsService.changeSubscriptionPaygState(
          externalId,
          newPayg,
        );
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "stripe.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `StripeService::handleStripeSubscriptionUpdated ${err.message}`,
      );
    }
  }

  async handleStripeSubscriptionCanceled(
    evt: Stripe.CustomerSubscriptionDeletedEvent,
  ): Promise<void> {
    try {
      this.logger.log(`Handling subscription cancelled - ${evt.id}`);
      await this.subscriptionsService.cancelSubscription(evt.data.object.id);
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

  async cancelSubscription(externalId: string): Promise<ResponseWithNoData> {
    try {
      await this.stripe.subscriptions.update(externalId, {
        cancel_at_period_end: true,
      });
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

  async resumeSubscription(orgId: string): Promise<ResponseWithNoData> {
    try {
      const existing = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (!existing) {
        return { success: false, message: "Subscription not found" };
      }

      const { externalId } = existing;

      const sub = (await this.stripe.subscriptions.retrieve(externalId, {
        expand: ["latest_invoice.payment_intent"],
      })) as Stripe.Subscription;

      if (!sub) {
        return { success: false, message: "Subscription not found on Stripe" };
      }

      switch (sub.status) {
        case "canceled":
        case "incomplete":
        case "incomplete_expired":
          return {
            success: false,
            message:
              "This subscription is fully canceled or expired – please start a new checkout to reactivate.",
          };

        case "active":
        case "trialing": {
          if (sub.cancel_at_period_end) {
            await this.stripe.subscriptions.update(externalId, {
              cancel_at_period_end: false,
            });
            return {
              success: true,
              message: "Pending cancellation revoked.",
            };
          }
          if (sub.pause_collection) {
            await this.stripe.subscriptions.update(externalId, {
              pause_collection: null,
            });
            return {
              success: true,
              message: "Subscription un-paused successfully.",
            };
          }
          return { success: false, message: "Subscription is already active." };
        }

        case "paused":
          await this.stripe.subscriptions.update(externalId, {
            pause_collection: null,
          });
          return {
            success: true,
            message: "Subscription un-paused successfully.",
          };

        case "past_due":
        case "unpaid": {
          if (sub.latest_invoice) {
            try {
              await this.stripe.invoices.pay(sub.latest_invoice as string);
              return {
                success: true,
                message:
                  "Payment attempted. Subscription will reactivate once the charge succeeds.",
              };
            } catch {
              return {
                success: false,
                message:
                  "Outstanding invoice must be paid. Please update the payment method and retry.",
              };
            }
          }
          return {
            success: false,
            message:
              "Outstanding invoice must be paid. Please update the payment method.",
          };
        }

        default:
          return {
            success: false,
            message: `Cannot reactivate subscription while status is “${sub.status}”.`,
          };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({ action: "service-call", source: "stripe.service" });
        Sentry.captureException(err);
      });
      this.logger.error(`StripeService::resumeSubscription ${err.message}`);
      return { success: false, message: "Error resuming subscription" };
    }
  }

  async deleteSubscription(orgId: string): Promise<ResponseWithNoData> {
    try {
      const sub = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (sub?.externalId) {
        await this.stripe.subscriptions.cancel(sub.externalId);
      }
      return {
        success: true,
        message: "Subscription deleted successfully",
      };
    } catch (err) {
      this.logger.error(`Error deleting subscription – ${err.message}`);
      return {
        success: false,
        message: "Error deleting subscription",
      };
    }
  }

  async initiateNewSubscription(input: {
    wallet: string;
    email: string;
    dto: NewSubscriptionInput;
    flag?: string;
  }): Promise<ResponseWithOptionalData<string>> {
    try {
      const { wallet, dto, flag } = input;
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
        const customer = data(await this.createOrRetrieveCustomer(input.email));
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
            flag,
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
          source: "stripe.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`StripeService::initiateSubscription ${err.message}`);
      return {
        success: false,
        message: `Error initiating subscription`,
      };
    }
  }

  async initiateSubscriptionChange(
    wallet: string,
    orgId: string,
    dto: ChangeSubscriptionInput,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log("Initiating subscription change");
      const existing = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );

      if (!existing) {
        this.logger.log("Attempted to change non-existent subscription plan");
        return {
          success: false,
          message: "Subscription not found",
        };
      }

      if (dto.jobstash === "starter") {
        this.logger.log("Attempted to change to starter plan");
        return {
          success: false,
          message: "You cannot move from a paid plan to the free tier",
        };
      }

      const {
        tier: currentTier,
        veri: currentVeri,
        stashAlert: currentStash,
        extraSeats: currentSeats,
        veriPayg: currentPayg,
        externalId,
      } = existing;

      if (
        currentTier === dto.jobstash &&
        currentVeri === dto.veri &&
        currentStash === dto.stashAlert &&
        currentSeats === dto.extraSeats &&
        currentPayg === dto.paygOptIn
      ) {
        return { success: true, message: "No change required" };
      }

      const prices = await this.getProductPrices();
      const subscription = (await this.stripe.subscriptions.retrieve(
        externalId,
        { expand: ["items.data.price"] },
      )) as Stripe.Subscription;

      const priceId = (lk: string): string =>
        prices.find(p => p.lookup_key === lk)?.id;
      const itemsByKey = new Map(
        subscription.items.data.map(i => [i.price.lookup_key, i]),
      );

      const bundleKey = BUNDLE_LOOKUP_KEYS.JOBSTASH[dto.jobstash];
      const veriKey = dto.veri ? BUNDLE_LOOKUP_KEYS.VERI[dto.veri] : null;
      const stashKey = dto.stashAlert ? LOOKUP_KEYS.STASH_ALERT_PRICE : null;
      const paygKey = dto.paygOptIn ? LOOKUP_KEYS.VERI_PAYG_PRICE : null;

      const updateItems: Stripe.SubscriptionUpdateParams.Item[] = [];

      for (const [k, itm] of itemsByKey) {
        if (k?.startsWith("jobstash_") && k !== bundleKey)
          updateItems.push({ id: itm.id, deleted: true });
        if (
          k?.startsWith("veri_") &&
          k !== veriKey &&
          k !== LOOKUP_KEYS.VERI_PAYG_PRICE
        )
          updateItems.push({ id: itm.id, deleted: true });
      }

      if (itemsByKey.has(bundleKey)) {
        const itm = itemsByKey.get(bundleKey);
        updateItems.push({
          id: itm.id,
          price: priceId(bundleKey),
          quantity: 1 + dto.extraSeats,
        });
      } else {
        updateItems.push({
          price: priceId(bundleKey),
          quantity: 1 + dto.extraSeats,
        });
      }

      if (veriKey) {
        if (!itemsByKey.has(veriKey)) {
          updateItems.push({ price: priceId(veriKey), quantity: 1 });
        }
      }

      const stashExisting = itemsByKey.get(LOOKUP_KEYS.STASH_ALERT_PRICE);
      if (stashKey && !stashExisting) {
        updateItems.push({ price: priceId(stashKey), quantity: 1 });
      } else if (!stashKey && stashExisting) {
        updateItems.push({ id: stashExisting.id, deleted: true });
      }

      const paygExisting = itemsByKey.get(LOOKUP_KEYS.VERI_PAYG_PRICE);
      if (paygKey && !paygExisting) {
        updateItems.push({ price: priceId(paygKey) });
      } else if (!paygKey && paygExisting) {
        updateItems.push({ id: paygExisting.id, deleted: true });
      }

      const bundleUpgraded =
        JOBSTASH_BUNDLE_PRICING[dto.jobstash] >
        JOBSTASH_BUNDLE_PRICING[currentTier];

      const veriUpgraded =
        (dto.veri ? VERI_BUNDLE_PRICING[dto.veri] : 0) >
        (currentVeri ? VERI_BUNDLE_PRICING[currentVeri] : 0);

      const stashAlertActivated = !currentStash && dto.stashAlert;

      const isUpgrade = bundleUpgraded || veriUpgraded || stashAlertActivated;

      await this.stripe.subscriptions.update(externalId, {
        proration_behavior: isUpgrade ? "always_invoice" : "none",
        billing_cycle_anchor: isUpgrade ? "now" : "unchanged",
        items: updateItems,
      });

      return {
        success: true,
        message: "Subscription change initiated",
      };
    } catch (err) {
      Sentry.withScope(s => {
        s.setTags({ action: "subscription-change", source: "stripe.service" });
        s.setExtra("input", { wallet, orgId, dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `StripeService::initiateSubscriptionChange ${err.message}`,
      );
      return { success: false, message: "Failed to initiate plan change" };
    }
  }

  async initiateJobPromotionPayment(
    uuid: string,
    ecosystem: string,
    flag?: string,
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
        await this.createCheckoutSession(
          [lineItem],
          "payment",
          undefined,
          {
            calldata: JSON.stringify({
              shortUUID: uuid,
            }),
            action: "job-promotion",
          },
          flag,
        ),
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
