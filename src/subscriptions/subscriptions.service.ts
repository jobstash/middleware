import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { MailService } from "src/mail/mail.service";
import { PaymentsService } from "src/payments/payments.service";
import {
  data,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { NewSubscriptionInput } from "./new-subscription.input";
import {
  EXTRA_SEATS_PRICING,
  JOBSTASH_BUNDLE_PRICING,
  STASH_ALERT_PRICE,
  VERI_BUNDLE_PRICING,
} from "src/shared/constants/pricing";
import { PricingType } from "src/payments/dto/create-charge.dto";
import {
  Metadata,
  SubscriptionMetadata,
} from "src/payments/dto/webhook-data.dto";
import { UserService } from "src/user/user.service";
import { randomToken } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { JOBSTASH_QUOTA, VERI_ADDONS } from "src/shared/constants/quota";
import { Subscription } from "src/shared/interfaces/org";
import { SubscriptionEntity } from "src/shared/entities/subscription.entity";
import { addMonths } from "date-fns";
import { capitalize } from "lodash";

@Injectable()
export class SubscriptionsService {
  private readonly logger = new CustomLogger(SubscriptionsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async initiateSubscription(input: {
    wallet: string;
    email: string;
    dto: NewSubscriptionInput;
    action: "new" | "upgrade" | "downgrade" | "renew";
  }): Promise<ResponseWithOptionalData<string>> {
    try {
      const { wallet, email, dto, action } = input;
      const total = [
        dto.jobstash ? JOBSTASH_BUNDLE_PRICING[dto.jobstash] : 0,
        dto.veri ? VERI_BUNDLE_PRICING[dto.veri] : 0,
        dto.stashAlert ? STASH_ALERT_PRICE : 0,
      ].reduce((a, b) => a + b, 0);

      const extraSeatCost = dto.extraSeats
        ? EXTRA_SEATS_PRICING[dto.jobstash] * dto.extraSeats
        : 0;

      const description = [
        dto.jobstash
          ? `Jobstash ${capitalize(dto.jobstash)} Bundle: $${JOBSTASH_BUNDLE_PRICING[dto.jobstash]}`
          : null,
        dto.veri
          ? `Veri ${capitalize(dto.veri)} Addon: $${VERI_BUNDLE_PRICING[dto.veri]}`
          : null,
        dto.stashAlert ? `StashAlert: $${STASH_ALERT_PRICE}` : null,
        dto.extraSeats && dto.jobstash !== "starter"
          ? `${dto.extraSeats} Extra Seats @ ${EXTRA_SEATS_PRICING[dto.jobstash]}/seat: $${EXTRA_SEATS_PRICING[dto.jobstash] * dto.extraSeats}`
          : null,
      ]
        .filter(Boolean)
        .join(" + ");

      const amount = total + extraSeatCost;

      if (amount > 0) {
        const paymentLink = await this.paymentsService.createCharge({
          name: `JobStash.xyz`,
          description,
          local_price: {
            amount: amount.toString(),
            currency: "USD",
          },
          pricing_type:
            this.configService.get("ENVIRONMENT") === "production"
              ? PricingType.FIXED_PRICE
              : PricingType.NO_PRICE,
          metadata: {
            calldata: JSON.stringify({
              ...dto,
              extraSeats: dto.jobstash === "starter" ? 0 : dto.extraSeats,
              wallet,
              amount,
            }),
            action:
              action === "new"
                ? "new-subscription"
                : action === "renew"
                  ? "subscription-renewal"
                  : action === "upgrade"
                    ? "subscription-upgrade"
                    : "subscription-downgrade",
          },
          redirect_url: "https://jobstash.xyz/subscriptions/new?success=true",
          cancel_url: "https://jobstash.xyz/subscriptions/new?cancelled=true",
        });

        if (paymentLink) {
          await this.neogma.queryRunner.run(
            `
          MERGE (payment: PendingPayment {link: $link})
          ON CREATE SET
            payment.id = randomUUID(),
            payment.reference = $reference,
            payment.type = "subscription",
            payment.amount = $amount,
            payment.currency = "USD",
            payment.action = $action,
            payment.link = $link,
            payment.createdTimestamp = timestamp()

          WITH payment
          MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
          MERGE (user)-[:HAS_PENDING_PAYMENT]->(payment)<-[:HAS_PENDING_PAYMENT]-(org)
        `,
            {
              wallet,
              reference: paymentLink.id,
              link: paymentLink.url,
              amount,
              action,
              orgId: dto.orgId,
            },
          );

          try {
            await this.mailService.sendEmail({
              from: this.configService.getOrThrow<string>("EMAIL"),
              to: email,
              subject: `Payment Initiated`,
              html: `
          <h2>Payment Initiated</h2>
          <p>Your payment has been initiated. Click the link below to make your payment.</p>
          <p><a href="${paymentLink.url}">Make Payment</a></p>
        `,
            });
          } catch (err) {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "email-send",
                source: "subscriptions.service",
              });
              Sentry.captureException(err);
            });
            this.logger.error(
              `SubscriptionsService::initiateSubscriptionPayment ${err.message}`,
            );
          }

          return {
            success: true,
            message: "Subscription initiated successfully",
            data: paymentLink.url,
          };
        } else {
          return {
            success: false,
            message: "Subscription initiation failed",
          };
        }
      } else {
        return this.createNewSubscription(
          {
            ...dto,
            extraSeats: dto.jobstash === "starter" ? 0 : dto.extraSeats,
            amount,
            wallet,
          },
          "new-subscription",
        );
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

  async createNewSubscription(
    dto: SubscriptionMetadata,
    action: Metadata["action"],
  ): Promise<ResponseWithNoData> {
    try {
      const result = await this.neogma
        .getTransaction(null, async tx => {
          if (dto.amount > 0 && action === "new-subscription") {
            const pendingPayment = (
              await tx.run(
                `
              MATCH (user:User {wallet: $wallet})-[:HAS_PENDING_PAYMENT]->(payment:PendingPayment)<-[:HAS_PENDING_PAYMENT]-(org:Organization {orgId: $orgId})
              RETURN payment { .* } as payment
            `,
                { wallet: dto.wallet, orgId: dto.orgId },
              )
            ).records[0]?.get("payment");

            if (pendingPayment) {
              const internalRefCode = randomToken(16);
              const externalRefCode = pendingPayment.reference;
              const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
              const veriAddons = VERI_ADDONS[dto.veri];

              const timestamp = new Date();
              const payload = {
                ...dto,
                quota: {
                  seats: dto.extraSeats + 1,
                  veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
                  stashPool: quotaInfo.stashPool,
                  atsIntegration: quotaInfo.atsIntegration,
                  boostedVacancyMultiplier: quotaInfo.boostedVacancyMultiplier,
                  stashAlert: dto.stashAlert,
                },
                action,
                duration: "monthly",
                internalRefCode,
                externalRefCode,
                timestamp: timestamp.getTime(),
                expiryTimestamp: addMonths(timestamp, 1).getTime(),
              };

              const subscription = (
                await tx.run(
                  `
              CREATE (subscription:OrgSubscription {id: randomUUID()})
              SET subscription.tier = $jobstash
              SET subscription.veri = $veri
              SET subscription.stashAlert = $stashAlert
              SET subscription.extraSeats = $extraSeats
              SET subscription.status = "active"
              SET subscription.duration = $duration
              SET subscription.createdTimestamp = $timestamp
              SET subscription.expiryTimestamp = $expiryTimestamp
              RETURN subscription
            `,
                  payload,
                )
              ).records[0].get("subscription");

              const payment = (
                await tx.run(
                  `
              CREATE (payment:Payment {id: randomUUID()})
              SET payment.amount = $amount
              SET payment.currency = "USD"
              SET payment.status = "confirmed"
              SET payment.type = "subscription"
              SET payment.action = $action
              SET payment.internalRefCode = $internalRefCode
              SET payment.externalRefCode = $externalRefCode
              SET payment.timestamp = $timestamp
              SET payment.expiryTimestamp = $expiryTimestamp
              RETURN payment
            `,
                  payload,
                )
              ).records[0].get("payment");

              const quota = (
                await tx.run(
                  `
              CREATE (quota:Quota {id: randomUUID()})
              SET quota += $quota
              SET quota.createdTimestamp = $timestamp
              RETURN quota
            `,
                  payload,
                )
              ).records[0].get("quota");

              await tx.run(
                `
              MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId}), (subscription:OrgSubscription {id: $subscriptionId}), (payment:Payment {id: $paymentId}), (quota:Quota {id: $quotaId})
              MERGE (org)-[:HAS_SUBSCRIPTION]->(subscription)-[:HAS_PAYMENT]->(payment)<-[:MADE_SUBSCRIPTION_PAYMENT]-(user)
              
              WITH subscription, quota
              MERGE (subscription)-[:HAS_QUOTA]->(quota)
            `,
                {
                  ...payload,
                  subscriptionId: subscription.properties.id,
                  paymentId: payment.properties.id,
                  quotaId: quota.properties.id,
                },
              );

              await tx.run(
                `
                MATCH (user:User {wallet: $wallet})-[:HAS_PENDING_PAYMENT]->(payment:PendingPayment)<-[:HAS_PENDING_PAYMENT]-(org:Organization {orgId: $orgId})
                DETACH DELETE payment
              `,
                { wallet: dto.wallet, orgId: dto.orgId },
              );

              return true;
            } else {
              this.logger.warn("No pending payment found");
              Sentry.withScope(scope => {
                scope.setTags({
                  action: "business-logic",
                  source: "subscriptions.service",
                });
                scope.setExtra("input", {
                  wallet: dto.wallet,
                  orgId: dto.orgId,
                  action: action,
                  ...dto,
                });
                Sentry.captureMessage(
                  "Attempted confirmation of missing pending payment",
                );
              });
              return false;
            }
          } else {
            const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
            const veriAddons = VERI_ADDONS[dto.veri];

            const timestamp = new Date();
            const payload = {
              ...dto,
              quota: {
                seats: dto.extraSeats + 1,
                veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
                stashPool: quotaInfo.stashPool,
                atsIntegration: quotaInfo.atsIntegration,
                boostedVacancyMultiplier: quotaInfo.boostedVacancyMultiplier,
                stashAlert: dto.stashAlert,
              },
              action,
              duration: "monthly",
              timestamp: timestamp.getTime(),
              expiryTimestamp: addMonths(timestamp, 1).getTime(),
            };

            const subscription = (
              await tx.run(
                `
              CREATE (subscription:OrgSubscription {id: randomUUID()})
              SET subscription.tier = $jobstash
              SET subscription.veri = $veri
              SET subscription.stashAlert = $stashAlert
              SET subscription.extraSeats = $extraSeats
              SET subscription.status = "active"
              SET subscription.duration = $duration
              SET subscription.createdTimestamp = $timestamp
              SET subscription.expiryTimestamp = $expiryTimestamp
              RETURN subscription
            `,
                payload,
              )
            ).records[0].get("subscription");

            const quota = (
              await tx.run(
                `
              CREATE (quota:Quota {id: randomUUID()})
              SET quota += $quota
              SET quota.createdTimestamp = $timestamp
              RETURN quota
            `,
                payload,
              )
            ).records[0].get("quota");

            await tx.run(
              `
              MATCH (org:Organization {orgId: $orgId}), (subscription:OrgSubscription {id: $subscriptionId}), (quota:Quota {id: $quotaId})
              MERGE (org)-[:HAS_SUBSCRIPTION]->(subscription)
              
              WITH subscription, quota
              MERGE (subscription)-[:HAS_QUOTA]->(quota)
            `,
              {
                ...payload,
                subscriptionId: subscription.properties.id,
                quotaId: quota.properties.id,
              },
            );
          }
        })
        .catch(x => {
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
        const subscription = data(await this.getSubscriptionInfo(dto.orgId));
        return this.userService.addOrgUser(dto.orgId, dto.wallet, subscription);
      } else {
        return {
          success: false,
          message: "Error creating new subscription",
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

  async getSubscriptionInfo(
    orgId: string,
  ): Promise<ResponseWithOptionalData<Subscription>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
          RETURN subscription {
            .*,
            quota: [
              (subscription)-[:HAS_QUOTA]->(quota:Quota) | quota { .* }
            ][0]
          } as subscription
        `,
        { orgId },
      );
      const subscription = result.records[0]?.get("subscription");
      if (subscription) {
        return {
          success: true,
          message: "Retrieved subscription info successfully",
          data: new SubscriptionEntity(subscription).getProperties(),
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
}
