import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailService } from "src/mail/mail.service";
import {
  SubscriptionRepository,
  SubscriptionServiceChange,
  SubscriptionServiceWrite,
} from "src/postgres/subscription.repository";
import {
  data,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import {
  EXTRA_SEATS_PRICING,
  JOBSTASH_BUNDLE_PRICING,
  STASH_ALERT_PRICE,
  VERI_BUNDLE_PRICING,
} from "src/shared/constants/pricing";
import { SubscriptionMetadata } from "src/stripe/dto/webhook-data.dto";
import { UserService } from "src/user/user.service";
import {
  emailBuilder,
  nonZeroOrNull,
  notStringOrNull,
  randomToken,
  text,
} from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { JOBSTASH_QUOTA, VERI_ADDONS } from "src/shared/constants/quota";
import {
  MeteredService,
  Payment,
  Subscription,
  SubscriptionMember,
} from "src/shared/interfaces/org";
import { SubscriptionEntity } from "src/shared/entities/subscription.entity";
import { addMonths, getDayOfYear } from "date-fns";
import { now } from "lodash";
import { ProfileService } from "src/auth/profile/profile.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  CheckWalletPermissions,
  LOOKUP_KEYS,
  METERED_SERVICE_LOOKUP_KEYS,
} from "src/shared/constants";
import Stripe from "stripe";
import { StripeService } from "src/stripe/stripe.service";

@Injectable()
export class SubscriptionsService {
  private readonly logger = new CustomLogger(SubscriptionsService.name);
  private readonly from: string;
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
  ) {
    this.from = this.configService.getOrThrow<string>("EMAIL");
  }

  async getSubscriptionOwnerEmail(
    wallet: string,
    orgId: string,
  ): Promise<string | undefined> {
    return data(await this.profileService.getUserVerifications(wallet)).find(
      org => org.id === orgId && org.credential === "email" && org.isOwner,
    )?.account;
  }

  async recordMeteredServiceUsage(
    orgId: string,
    wallet: string,
    amount: number,
    service: MeteredService,
    stripeService: StripeService,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log(
        `Attempting to record ${amount} metered service usage for ${wallet} for ${orgId} on ${service}`,
      );
      const subscription = data(await this.getSubscriptionInfoByOrgId(orgId));
      const isOrgMember = await this.userService.isOrgMember(wallet, orgId);
      if (isOrgMember) {
        if (subscription.isActive() && subscription.canAccessService(service)) {
          const quota = subscription.getOldestActiveUnfilledQuota(service);
          if (quota?.id) {
            const recorded = await this.subscriptions.recordQuotaUsage({
              subscriptionId: subscription.id,
              quotaId: quota.id,
              wallet,
              amount,
              service,
            });
            if (!recorded) {
              return {
                success: false,
                message: "Subscription quota was not found",
              };
            }
            this.logger.log(`Successfully recorded metered service usage`);
            return {
              success: true,
              message: `Successfully recorded metered service usage`,
            };
          } else {
            const isPaygAble = METERED_SERVICE_LOOKUP_KEYS[service];
            if (isPaygAble) {
              return stripeService.recordMeteredServiceUsage(
                subscription.externalId,
                service,
                amount,
              );
            } else {
              this.logger.log(
                `Account has exhausted all available quota for ${service}`,
              );
              return {
                success: false,
                message: `Account has exhausted all available quota for ${service}`,
              };
            }
          }
        } else {
          this.logger.log(
            `Cannot record metered service usage for expired or inactive subscription`,
          );
          return {
            success: false,
            message: `Cannot record metered service usage for expired or inactive subscription`,
          };
        }
      } else {
        this.logger.log(`Non org member cannot record metered service usage`);
        return {
          success: false,
          message: `Non org member cannot record metered service usage`,
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::recordMeteredServiceUsage ${err.message}`,
      );
      return {
        success: false,
        message: `Error recording metered service usage`,
      };
    }
  }

  async createPendingPayment(
    wallet: string,
    orgId: string,
    amount: number,
    action: string,
    reference: string,
    link: string,
  ): Promise<ResponseWithNoData> {
    try {
      const created = await this.subscriptions.createPendingPayment({
        wallet,
        reference,
        link,
        amount,
        action,
        orgId,
      });
      return {
        success: created,
        message: created
          ? "Pending payment created successfully"
          : "User or organization not found",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::createPendingPayment ${err.message}`,
      );
      return {
        success: false,
        message: "Error creating pending payment",
      };
    }
  }

  async createNewSubscription(
    dto: SubscriptionMetadata,
    stripeSubscriptionId?: string,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log("Fetching org owner email");
      const ownerEmail = data(
        await this.profileService.getUserVerifications(dto.wallet),
      ).find(org => org.id === dto.orgId)?.account;
      const timestamp = new Date();
      this.logger.log("Creating new subscription");
      const pendingPayment = await this.subscriptions.getPendingPayment(
        dto.wallet,
        dto.orgId,
      );
      if (dto.jobstash === "starter" || (pendingPayment && dto.amount > 0)) {
        const result = await this.persistNewSubscription(
          dto,
          stripeSubscriptionId,
          pendingPayment,
          timestamp.getTime(),
        ).catch(x => {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "subscriptions.service",
            });
            Sentry.captureException(x);
          });
          this.logger.error(`SubscriptionsService::createNewSubscription ${x}`);
          return false;
        });
        if (result) {
          this.logger.log("Created new subscription successfully");
          this.logger.log("Sending confirmation email to owner");
          const subscription = data(
            await this.getSubscriptionInfoByOrgId(dto.orgId),
          );
          if (dto.jobstash === "starter") {
            try {
              await this.mailService.sendEmail(
                emailBuilder({
                  from: this.from,
                  to: ownerEmail,
                  subject: "Your JobStash Free Trial Has Started",
                  previewText:
                    "Activate Your Paid Plan to Continue Premium Access!",
                  title: "Hey there,",
                  bodySections: [
                    text(
                      "Your free trial of JobStash has officially begun! 🎉 For the next 30 days, you’ll have full access to selected premium features, giving you everything you need to make the most of your experience.",
                    ),
                    text(
                      "Take your time to explore all the benefits, and remember, your trial lasts for 30 days. To continue enjoying premium access after your trial ends, simply activate your paid plan before your trial expires.",
                    ),
                    text(
                      `Need help or have questions? Join our help channel <a href="https://t.me/+24r67MsBXT00ODE8">here</a> – we're here to assist you!`,
                    ),
                    text("Thanks for using JobStash.xyz!"),
                  ],
                }),
              );
            } catch (err) {
              Sentry.withScope(scope => {
                scope.setTags({
                  action: "email-send",
                  source: "subscriptions.service",
                });
                Sentry.captureException(err);
              });
              this.logger.error(
                `SubscriptionsService::createNewSubscription ${err.message}`,
              );
            }
          } else {
            try {
              await this.mailService.sendEmail(
                emailBuilder({
                  from: this.from,
                  to: ownerEmail,
                  subject:
                    "JobStash Payment Confirmed – Your Add-Ons Are Undergoing Activation!",
                  title: "Hey,",
                  bodySections: [
                    text(
                      "You did it! Your payment has been successfully processed, and your add-ons are now under review and getting ready to be activated. The process is underway, and your upgraded experience with JobStash is just around the corner! 💡",
                    ),
                    text(
                      `Our small, dedicated team is working hard to get your add-ons reviewed and activated within the next <span style="font-weight:bold;">24-48 hours</span>. Once everything is live, we’ll send you a confirmation so you can start exploring your new features.`,
                    ),
                    text(
                      `Got questions or need support? We’ve got your back! Just reach out to us via <a href="https://t.me/+24r67MsBXT00ODE8">Telegram</a>. We’re always here to help.`,
                    ),
                    text(
                      "Thanks for being part of the JobStash community – we’re excited to have you on board!",
                    ),
                  ],
                }),
              );
            } catch (err) {
              Sentry.withScope(scope => {
                scope.setTags({
                  action: "email-send",
                  source: "subscriptions.service",
                });
                Sentry.captureException(err);
              });
              this.logger.error(
                `SubscriptionsService::createNewSubscription ${err.message}`,
              );
            }
          }
          this.logger.log("Adding owner to org");
          return this.userService.addOrgUser(
            dto.orgId,
            dto.wallet,
            subscription,
          );
        } else {
          this.logger.log("Error creating new subscription");
          return {
            success: false,
            message: "Error creating new subscription",
          };
        }
      } else {
        this.logger.warn("Skipping confirmation of missing pending payment");
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            wallet: dto.wallet,
            orgId: dto.orgId,
            action: "new-subscription",
            ...dto,
          });
          Sentry.captureMessage(
            "Attempted confirmation of missing pending payment",
          );
        });
        return {
          success: false,
          message: "Payment not found",
        };
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
        `SubscriptionsService::createNewSubscription ${err.message}`,
      );
      return {
        success: false,
        message: `Error creating new subscription`,
      };
    }
  }

  private async persistNewSubscription(
    dto: SubscriptionMetadata,
    stripeSubscriptionId: string | undefined,
    pendingPayment:
      | { nodeId: string; properties: Record<string, unknown> }
      | undefined,
    timestamp: number,
  ): Promise<boolean> {
    const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
    const veriAddons = VERI_ADDONS[dto.veri] ?? 0;
    const expiryTimestamp = addMonths(timestamp, 1).getTime();
    const serviceTimestamps = { createdTimestamp: timestamp, expiryTimestamp };
    const services: SubscriptionServiceWrite[] = [
      {
        label: "JobstashBundle",
        properties: {
          name: dto.jobstash,
          stashPool: quotaInfo.stashPool,
          atsIntegration: quotaInfo.atsIntegration,
          ...serviceTimestamps,
        },
      },
      {
        label: "VeriAddon",
        properties: { name: dto.veri, ...serviceTimestamps },
      },
      {
        label: "JobPromotions",
        properties: {
          value: quotaInfo.jobPromotions,
          ...serviceTimestamps,
        },
      },
      {
        label: "StashAlert",
        properties: { active: dto.stashAlert, ...serviceTimestamps },
      },
      {
        label: "ExtraSeats",
        properties: { value: dto.extraSeats, ...serviceTimestamps },
      },
    ];
    const paid = dto.amount > 0;
    if (paid && !pendingPayment) return false;
    return this.subscriptions.createSubscription({
      wallet: dto.wallet,
      orgId: dto.orgId,
      externalId: paid ? stripeSubscriptionId : null,
      duration: "monthly",
      createdTimestamp: timestamp,
      expiryTimestamp,
      services,
      quota: {
        veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
        jobPromotions: quotaInfo.jobPromotions,
        createdTimestamp: timestamp,
        expiryTimestamp: addMonths(timestamp, 2).getTime(),
      },
      payment: paid
        ? {
            amount: dto.amount,
            action: "new-subscription",
            internalRefCode: randomToken(16),
            externalRefCode: String(pendingPayment.properties.reference),
            createdTimestamp: timestamp,
            expiryTimestamp,
          }
        : undefined,
      pendingPaymentNodeId: paid ? pendingPayment.nodeId : undefined,
    });
  }

  async getSubscriptionInfoByOrgId(
    orgId: string,
  ): Promise<ResponseWithOptionalData<Subscription>> {
    try {
      const subscription =
        await this.subscriptions.getSubscriptionByOrgId(orgId);
      if (subscription) {
        return {
          success: true,
          message: "Retrieved subscription info successfully",
          data: new SubscriptionEntity(
            subscription as unknown as Subscription,
          ).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Subscription not found",
        };
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
        `SubscriptionsService::getSubscriptionInfo ${err.message}`,
      );
      return {
        success: false,
        message: `Error retrieving subscription info`,
      };
    }
  }

  async getOrgSubscriptionMembers(
    orgId: string,
  ): Promise<ResponseWithOptionalData<SubscriptionMember[]>> {
    try {
      const subscriptionMembers = (
        await this.subscriptions.getSubscriptionMembers(orgId)
      ).map(subscriptionMember => {
        const member = subscriptionMember as unknown as SubscriptionMember;
        return new SubscriptionMember({
          ...member,
          name: notStringOrNull(member.name),
          dateJoined: nonZeroOrNull(member.dateJoined),
        });
      });
      return {
        success: true,
        message: "Retrieved subscription members successfully",
        data: subscriptionMembers,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::getOrgSubscriptionMembers ${err.message}`,
      );
      return {
        success: false,
        message: `Error retrieving subscription members`,
      };
    }
  }

  async getSubscriptionInfoByExternalId(
    externalId: string,
  ): Promise<ResponseWithOptionalData<Subscription>> {
    try {
      const subscription =
        await this.subscriptions.getSubscriptionByExternalId(externalId);
      if (subscription) {
        return {
          success: true,
          message: "Retrieved subscription info successfully",
          data: new SubscriptionEntity(
            subscription as unknown as Subscription,
          ).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Subscription not found",
        };
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
        `SubscriptionsService::getSubscriptionInfo ${err.message}`,
      );
      return {
        success: false,
        message: `Error retrieving subscription info`,
      };
    }
  }

  async getSubscriptionOwnerInfoByExternalId(
    externalId: string,
  ): Promise<ResponseWithOptionalData<{ orgId: string; wallet: string }>> {
    try {
      const info = await this.subscriptions.getOwnerByExternalId(externalId);
      if (info) {
        return {
          success: true,
          message: "Retrieved subscription owner info successfully",
          data: info,
        };
      } else {
        return {
          success: false,
          message: "Subscription not found",
        };
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
        `SubscriptionsService::getSubscriptionOwnerInfoByExternalId ${err.message}`,
      );
      return {
        success: false,
        message: `Error retrieving subscription owner info`,
      };
    }
  }

  async getSubscriptionOwnerInfoByOrgId(
    orgId: string,
  ): Promise<ResponseWithOptionalData<{ orgId: string; wallet: string }>> {
    try {
      const info = await this.subscriptions.getOwnerByOrgId(orgId);
      if (info) {
        return {
          success: true,
          message: "Retrieved subscription owner info successfully",
          data: info,
        };
      } else {
        return {
          success: false,
          message: "Subscription not found",
        };
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
        `SubscriptionsService::getSubscriptionOwnerInfoByOrgId ${err.message}`,
      );
      return {
        success: false,
        message: `Error retrieving subscription owner info`,
      };
    }
  }

  async renewSubscription(
    externalId: string,
    amount: number,
    invoiceId: string,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log("Renewing subscription");
      const existingSubscription = data(
        await this.getSubscriptionInfoByExternalId(externalId),
      );
      if (!existingSubscription) {
        this.logger.log("Subscription not found");
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            externalId,
            invoiceId,
            action: "subscription-renewal",
          });
          Sentry.captureMessage("Attempted renewal of missing subscription");
        });
        return {
          success: false,
          message: "Subscription not found",
        };
      }

      const ownerInfo = data(
        await this.getSubscriptionOwnerInfoByExternalId(externalId),
      );

      if (!ownerInfo) {
        this.logger.log("Subscription owner not found");
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            externalId,
            invoiceId,
            action: "subscription-renewal",
          });
          Sentry.captureMessage("Attempted renewal of missing subscription");
        });
        return {
          success: false,
          message: "Subscription owner not found",
        };
      }

      const result = await this.persistSubscriptionRenewal(
        existingSubscription,
        ownerInfo,
        amount,
        invoiceId,
      );
      if (result) {
        this.logger.log("Renewed subscription successfully");
        this.logger.log("Sending confirmation email to owner");
      } else {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            ...ownerInfo,
            externalId,
            invoiceId,
            amount,
            action: "subscription-renewal",
          });
          Sentry.captureMessage(
            "Failed or incomplete subscription renewal transaction detected",
          );
        });
      }
      return {
        success: result,
        message: result
          ? "Subscription renewed successfully"
          : "Error renewing subscription",
      };
    } catch (err) {
      this.logger.error(
        `SubscriptionsService::renewSubscription ${err.message}`,
      );
      Sentry.withScope(scope => {
        scope.setTags({
          action: "business-logic",
          source: "subscriptions.service",
        });
        scope.setExtra("input", {
          externalId,
          invoiceId,
          amount,
          action: "subscription-renewal",
        });
        Sentry.captureException(err);
      });
      return {
        success: false,
        message: "Error renewing subscription",
      };
    }
  }

  async changeSubscriptionPaygState(
    subscriptionId: string,
    paygState: boolean,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log("Changing subscription payg state");
      const updated = await this.subscriptions.setPaygState(
        subscriptionId,
        paygState,
      );
      if (!updated) {
        this.logger.log("Subscription not found");
        return {
          success: false,
          message: "Subscription not found",
        };
      }
      return {
        success: true,
        message: "Subscription payg state changed successfully",
      };
    } catch (err) {
      this.logger.error(
        `SubscriptionsService::changeSubscriptionPaygState ${err.message}`,
      );
      Sentry.withScope(scope => {
        scope.setTags({
          action: "business-logic",
          source: "subscriptions.service",
        });
        scope.setExtra("input", {
          subscriptionId,
          paygState,
          action: "subscription-update",
        });
        Sentry.captureException(err);
      });
      return {
        success: false,
        message: "Error changing subscription payg state",
      };
    }
  }

  private async persistSubscriptionRenewal(
    subscription: Subscription,
    owner: { orgId: string; wallet: string },
    amount: number,
    invoiceId: string,
  ): Promise<boolean> {
    const timestamp = now();
    const expiryTimestamp = addMonths(
      subscription.expiryTimestamp,
      1,
    ).getTime();
    const quotaInfo = JOBSTASH_QUOTA[subscription.tier];
    const veriAddons = VERI_ADDONS[subscription.veri] ?? 0;
    return this.subscriptions.renewSubscription({
      subscriptionId: subscription.id,
      wallet: owner.wallet,
      orgId: owner.orgId,
      expiryTimestamp,
      payment: {
        amount,
        action: "subscription-renewal",
        internalRefCode: randomToken(16),
        externalRefCode: invoiceId,
        createdTimestamp: timestamp,
        expiryTimestamp,
      },
      quota: {
        veri: subscription.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
        jobPromotions: quotaInfo.jobPromotions,
        createdTimestamp: timestamp,
        expiryTimestamp: addMonths(timestamp, 2).getTime(),
      },
    });
  }

  async changeSubscription(
    dto: Omit<SubscriptionMetadata, "orgId" | "wallet"> & {
      orgId?: string;
      wallet?: string;
    },
    invoiceId: string,
    subscription: Stripe.Subscription,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log("Changing subscription");
      const subscriptionId = subscription.id;
      const ownerInfo = dto.orgId
        ? data(await this.getSubscriptionOwnerInfoByOrgId(dto.orgId))
        : data(await this.getSubscriptionOwnerInfoByExternalId(subscriptionId));

      if (!ownerInfo) {
        this.logger.log("Subscription owner not found");
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            subscriptionId,
            invoiceId,
            ...dto,
            action: "subscription-change",
          });
          Sentry.captureMessage("Attempted change of missing subscription");
        });
        return {
          success: false,
          message: "Subscription owner not found",
        };
      }

      const existingSubscription = data(
        dto.orgId
          ? await this.getSubscriptionInfoByOrgId(dto.orgId)
          : await this.getSubscriptionInfoByExternalId(subscriptionId),
      );
      if (!existingSubscription) {
        this.logger.log("Subscription not found");
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            subscriptionId,
            invoiceId,
            ...dto,
            action: "subscription-change",
          });
          Sentry.captureMessage("Attempted change of missing subscription");
        });
        return {
          success: false,
          message: "Subscription not found",
        };
      }

      const result = await this.persistSubscriptionChange(
        dto,
        invoiceId,
        subscription,
        existingSubscription,
        ownerInfo,
      );
      if (result) {
        this.logger.log("Changed subscription successfully");
        this.logger.log("Sending confirmation email to owner");
      } else {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "business-logic",
            source: "subscriptions.service",
          });
          scope.setExtra("input", {
            action: "subscription-change",
            ...ownerInfo,
            ...dto,
            invoiceId,
            subscriptionId,
          });
          Sentry.captureMessage("Attempted change of missing subscription");
        });
      }
      return {
        success: result,
        message: result
          ? "Subscription changed successfully"
          : "Error changing subscription",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::changeSubscription ${err.message}`,
      );
      return {
        success: false,
        message: "Error changing subscription",
      };
    }
  }

  private async persistSubscriptionChange(
    dto: Omit<SubscriptionMetadata, "orgId" | "wallet"> & {
      orgId?: string;
      wallet?: string;
    },
    invoiceId: string,
    stripeSubscription: Stripe.Subscription,
    existing: Subscription,
    owner: { orgId: string; wallet: string },
  ): Promise<boolean> {
    const timestamp = now();
    const jobstashItem = stripeSubscription.items.data.find(item =>
      item.price.lookup_key?.startsWith("jobstash_"),
    );
    const veriItem = stripeSubscription.items.data.find(item =>
      item.price.lookup_key?.startsWith("veri_"),
    );
    const stashAlertItem = stripeSubscription.items.data.find(
      item => item.price.lookup_key === LOOKUP_KEYS.STASH_ALERT_PRICE,
    );
    const cycleStart =
      (jobstashItem?.current_period_start ?? timestamp / 1000) * 1000;
    const cycleEnd =
      (jobstashItem?.current_period_end ??
        addMonths(timestamp, 1).getTime() / 1000) * 1000;
    const veriCycleStart =
      (veriItem?.current_period_start ?? cycleStart / 1000) * 1000;
    const stashAlertCycleStart =
      (stashAlertItem?.current_period_start ?? cycleStart / 1000) * 1000;
    const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
    const veriAddons = VERI_ADDONS[dto.veri] ?? 0;
    const changes: SubscriptionServiceChange[] = [];
    const direction = (
      current: number,
      target: number,
    ): "upgrade" | "downgrade" | undefined =>
      current < target ? "upgrade" : current > target ? "downgrade" : undefined;

    const jobstashDirection = direction(
      JOBSTASH_BUNDLE_PRICING[existing.tier],
      JOBSTASH_BUNDLE_PRICING[dto.jobstash],
    );
    if (jobstashDirection) {
      changes.push(
        {
          label: "JobstashBundle",
          direction: jobstashDirection,
          cycleStart,
          cycleEnd,
          properties: {
            name: dto.jobstash,
            stashPool: quotaInfo.stashPool,
            atsIntegration: quotaInfo.atsIntegration,
          },
        },
        {
          label: "JobPromotions",
          direction: jobstashDirection,
          cycleStart,
          cycleEnd,
          properties: { value: quotaInfo.jobPromotions },
        },
      );
    }

    const veriDirection = direction(
      existing.veri ? VERI_BUNDLE_PRICING[existing.veri] : 0,
      VERI_BUNDLE_PRICING[dto.veri] ?? 0,
    );
    if (veriDirection) {
      changes.push({
        label: "VeriAddon",
        direction: veriDirection,
        cycleStart: veriCycleStart,
        cycleEnd,
        properties: { name: dto.veri },
      });
    }

    const stashAlertDirection = direction(
      existing.stashAlert ? STASH_ALERT_PRICE : 0,
      dto.stashAlert ? STASH_ALERT_PRICE : 0,
    );
    if (stashAlertDirection) {
      changes.push({
        label: "StashAlert",
        direction: stashAlertDirection,
        cycleStart: stashAlertCycleStart,
        cycleEnd,
        properties: { active: dto.stashAlert },
      });
    }

    const seatsDirection = direction(
      existing.extraSeats * EXTRA_SEATS_PRICING[existing.tier],
      dto.extraSeats * EXTRA_SEATS_PRICING[dto.jobstash],
    );
    if (seatsDirection) {
      changes.push({
        label: "ExtraSeats",
        direction: seatsDirection,
        cycleStart,
        cycleEnd,
        properties: { value: dto.extraSeats },
      });
    }

    return this.subscriptions.changeSubscription({
      subscriptionId: existing.id,
      externalId: stripeSubscription.id,
      wallet: owner.wallet,
      changedTimestamp: timestamp,
      changes,
      payment: {
        amount: dto.amount,
        action: "subscription-change",
        internalRefCode: randomToken(16),
        externalRefCode: invoiceId,
        createdTimestamp: timestamp,
        expiryTimestamp: cycleEnd,
      },
      quota: {
        veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
        jobPromotions: quotaInfo.jobPromotions,
        createdTimestamp: veriCycleStart,
        expiryTimestamp: addMonths(veriCycleStart, 2).getTime(),
      },
    });
  }

  async cancelSubscription(externalId: string): Promise<ResponseWithNoData> {
    try {
      const cancelled = await this.subscriptions.cancelSubscription(externalId);
      return {
        success: cancelled,
        message: cancelled
          ? "Subscription cancelled successfully"
          : "Subscription not found",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::cancelSubscription ${err.message}`,
      );
      return {
        success: false,
        message: "Error cancelling subscription",
      };
    }
  }

  async resetSubscriptionState(orgId: string): Promise<ResponseWithNoData> {
    try {
      const sub = data(await this.getSubscriptionInfoByOrgId(orgId));
      if (sub) {
        const wallets =
          (await this.subscriptions.resetSubscriptionState(orgId)) ?? [];
        if (wallets.length > 0) {
          this.logger.log(`Resetting subscription state for ${orgId}`);
          for (const wallet of wallets) {
            const currentPerms =
              await this.userService.getUserPermissions(wallet);
            const permsToDrop: string[] = [
              CheckWalletPermissions.ORG_MEMBER,
              CheckWalletPermissions.ORG_OWNER,
            ];
            await this.userService.syncUserPermissions(
              wallet,
              currentPerms
                .filter(x => !permsToDrop.includes(x.name))
                .map(x => x.name),
            );
          }
          return {
            success: true,
            message: "Subscription state reset successfully",
          };
        } else {
          this.logger.log(`No users found for ${orgId}`);
          return {
            success: true,
            message: "Subscription state reset successfully",
          };
        }
      } else {
        this.logger.log(`No subscription found for ${orgId}`);
        return {
          success: true,
          message: "Org subscription not found",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `SubscriptionsService::resetSubscriptionState ${err.message}`,
      );
      return {
        success: false,
        message: "Error resetting subscription state",
      };
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    timeZone: "Europe/Berlin",
  })
  async sendSubscriptionRenewalEmails(): Promise<void> {
    if (this.configService.get<string>("ENVIRONMENT") === "production") {
      const subscriptions = await this.subscriptions.getRenewalSubscriptions();
      for (const job of subscriptions) {
        const ownerEmail = await this.getSubscriptionOwnerEmail(
          job.ownerWallet,
          job.orgId,
        );

        if (ownerEmail) {
          const subscription = new SubscriptionEntity(
            job.subscription as unknown as Subscription,
          ).getProperties();
          const expiresToday =
            getDayOfYear(now()) === getDayOfYear(subscription.expiryTimestamp);
          //TODO: change these to official copy from @Laura
          if (subscription.status === "active" && expiresToday) {
            if (subscription.tier === "starter") {
              await this.mailService.sendEmail(
                emailBuilder({
                  from: this.from,
                  to: ownerEmail,
                  subject:
                    "Your JobStash Trial is Ending – Upgrade to Keep Access to Premium Features!",
                  previewText:
                    "Your JobStash trial is coming to an end soon, and we don’t want you to lose access to the premium features you’ve been enjoying! ",
                  title: "Hey there,",
                  bodySections: [
                    text(
                      "Your JobStash trial is coming to an end soon, and we don’t want you to lose access to the premium features you’ve been enjoying! ",
                    ),
                    text(
                      "Upgrading to a paid plan will keep you connected to all the exclusive tools that help you get the most out of JobStash.",
                    ),
                    text(
                      "If you have any questions, feel free to reach out to us at support@jobstash.xyz.",
                    ),
                    text("Thanks for using JobStash.xyz!"),
                  ],
                }),
              );
            }
          } else {
            this.logger.log(
              `Subscription for ${job.orgId} is due to expire in less than 5 days`,
            );
          }
        } else {
          this.logger.warn(`Owner email not found for ${job.orgId}`);
          Sentry.withScope(scope => {
            scope.setTags({
              action: "business-logic",
              source: "subscriptions.service",
            });
            scope.setExtra("input", {
              ownerEmail,
              orgId: job.orgId,
              action: "subscription-renewal-reminder",
            });
            Sentry.captureMessage(`Owner email not found for ${job.orgId}`);
          });
        }
      }
    } else {
      this.logger.warn("Not in production environment");
    }
  }

  async getOrgPayments(
    orgId: string,
  ): Promise<ResponseWithOptionalData<Payment[]>> {
    try {
      const payments = await this.subscriptions.getPayments(orgId);

      return {
        success: true,
        message: "Payments retrieved successfully",
        data: payments.map(
          payment => new Payment(payment as unknown as Payment),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "subscriptions.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SubscriptionsService::getOrgPayments ${err.message}`);
      return {
        success: false,
        message: "Error retrieving organization payments",
      };
    }
  }
}
