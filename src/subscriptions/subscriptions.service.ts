import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { MailService } from "src/mail/mail.service";
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
    @InjectConnection()
    private neogma: Neogma,
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
            await this.neogma.queryRunner.run(
              `
                MATCH (user:User {wallet: $wallet}), (subscription:OrgSubscription {id: $subscriptionId, status: "active"})-[:HAS_QUOTA]->(quota:Quota {id: $quotaId})
                MERGE (user)-[:USED_QUOTA]->(quotaUsage:QuotaUsage {id: randomUUID(), service: $service, amount: $amount, createdTimestamp: timestamp()})<-[:HAS_USAGE]-(quota)
              `,
              {
                subscriptionId: subscription.id,
                quotaId: quota.id,
                wallet,
                amount,
                service,
              },
            );
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
          reference,
          link,
          amount,
          action,
          orgId: orgId,
        },
      );
      return {
        success: true,
        message: "Pending payment created successfully",
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
      const pendingPayment = (
        await this.neogma.queryRunner.run(
          `
              MATCH (user:User {wallet: $wallet})-[:HAS_PENDING_PAYMENT]->(payment:PendingPayment)<-[:HAS_PENDING_PAYMENT]-(org:Organization {orgId: $orgId})
              RETURN payment { .* } as payment
            `,
          { wallet: dto.wallet, orgId: dto.orgId },
        )
      ).records[0]?.get("payment");
      if (dto.jobstash === "starter" || (pendingPayment && dto.amount > 0)) {
        const result = await this.neogma
          .getTransaction(null, async tx => {
            if (dto.amount > 0) {
              const internalRefCode = randomToken(16);
              const externalRefCode = pendingPayment.reference;
              const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
              const veriAddons = VERI_ADDONS[dto.veri];

              const payload = {
                ...dto,
                quota: {
                  veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
                  jobPromotions: quotaInfo.jobPromotions,
                  createdTimestamp: timestamp.getTime(),
                  expiryTimestamp: addMonths(timestamp, 2).getTime(),
                },
                externalId: stripeSubscriptionId,
                stashPool: quotaInfo.stashPool,
                atsIntegration: quotaInfo.atsIntegration,
                stashAlert: dto.stashAlert,
                action: "new-subscription",
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
                    SET subscription.externalId = $externalId
                    SET subscription.status = "active"
                    SET subscription.veriPayg = false
                    SET subscription.duration = $duration
                    SET subscription.createdTimestamp = $timestamp
                    SET subscription.expiryTimestamp = $expiryTimestamp
                    RETURN subscription
                  `,
                  payload,
                )
              ).records[0].get("subscription");

              await tx.run(
                `
                  CREATE (tier:JobstashBundle {id: randomUUID()})
                  SET tier.name = $jobstash
                  SET tier.stashPool = $stashPool
                  SET tier.atsIntegration = $atsIntegration
                  SET tier.createdTimestamp = $createdTimestamp
                  SET tier.expiryTimestamp = $expiryTimestamp

                  WITH tier
                  MATCH (subscription:OrgSubscription {id: $subscriptionId})
                  MERGE (subscription)-[:HAS_SERVICE]->(tier)
                `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                  CREATE (veri:VeriAddon {id: randomUUID()})
                  SET veri.name = $veri
                  SET veri.createdTimestamp = $timestamp
                  SET veri.expiryTimestamp = $expiryTimestamp

                  WITH veri
                  MATCH (subscription:OrgSubscription {id: $subscriptionId})
                  MERGE (subscription)-[:HAS_SERVICE]->(veri)
                `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                  CREATE (jobPromotions:JobPromotions {id: randomUUID()})
                  SET jobPromotions.value = $quota.jobPromotions
                  SET jobPromotions.createdTimestamp = $timestamp
                  SET jobPromotions.expiryTimestamp = $expiryTimestamp

                  WITH jobPromotions
                  MATCH (subscription:OrgSubscription {id: $subscriptionId})
                  MERGE (subscription)-[:HAS_SERVICE]->(jobPromotions)
                `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                  CREATE (stashAlert:StashAlert {id: randomUUID()})
                  SET stashAlert.active = $stashAlert
                  SET stashAlert.createdTimestamp = $timestamp
                  SET stashAlert.expiryTimestamp = $expiryTimestamp

                  WITH stashAlert
                  MATCH (subscription:OrgSubscription {id: $subscriptionId})
                  MERGE (subscription)-[:HAS_SERVICE]->(stashAlert)
                `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                  CREATE (extraSeats:ExtraSeats {id: randomUUID()})
                  SET extraSeats.value = $extraSeats
                  SET extraSeats.createdTimestamp = $timestamp
                  SET extraSeats.expiryTimestamp = $expiryTimestamp

                  WITH extraSeats
                  MATCH (subscription:OrgSubscription {id: $subscriptionId})
                  MERGE (subscription)-[:HAS_SERVICE]->(extraSeats)
                `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

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
                    SET payment.createdTimestamp = $timestamp
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
              const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
              const veriAddons = VERI_ADDONS[dto.veri];

              const timestamp = new Date();
              const payload = {
                ...dto,
                stashPool: quotaInfo.stashPool,
                atsIntegration: quotaInfo.atsIntegration,
                quota: {
                  veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
                  jobPromotions: quotaInfo.jobPromotions,
                  createdTimestamp: timestamp.getTime(),
                  expiryTimestamp: addMonths(timestamp, 2).getTime(),
                },
                action: "new-subscription",
                duration: "monthly",
                timestamp: timestamp.getTime(),
                expiryTimestamp: addMonths(timestamp, 1).getTime(),
              };

              const subscription = (
                await tx.run(
                  `
                  CREATE (subscription:OrgSubscription {id: randomUUID()})
                  SET subscription.status = "active"
                  SET subscription.duration = $duration
                  SET subscription.createdTimestamp = $timestamp
                  SET subscription.expiryTimestamp = $expiryTimestamp
                  RETURN subscription
                `,
                  payload,
                )
              ).records[0].get("subscription");

              await tx.run(
                `
                CREATE (tier:JobstashBundle {id: randomUUID()})
                SET tier.name = $jobstash
                SET tier.stashPool = $stashPool
                SET tier.atsIntegration = $atsIntegration
                SET tier.createdTimestamp = $createdTimestamp
                SET tier.expiryTimestamp = $expiryTimestamp

                WITH tier
                MATCH (subscription:OrgSubscription {id: $subscriptionId})
                MERGE (subscription)-[:HAS_SERVICE]->(tier)
              `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                CREATE (veri:VeriAddon {id: randomUUID()})
                SET veri.name = $veri
                SET veri.createdTimestamp = $timestamp
                SET veri.expiryTimestamp = $expiryTimestamp

                WITH veri
                MATCH (subscription:OrgSubscription {id: $subscriptionId})
                MERGE (subscription)-[:HAS_SERVICE]->(veri)
              `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                CREATE (jobPromotions:JobPromotions {id: randomUUID()})
                SET jobPromotions.value = $quota.jobPromotions
                SET jobPromotions.createdTimestamp = $timestamp
                SET jobPromotions.expiryTimestamp = $expiryTimestamp

                WITH jobPromotions
                MATCH (subscription:OrgSubscription {id: $subscriptionId})
                MERGE (subscription)-[:HAS_SERVICE]->(jobPromotions)
              `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                CREATE (stashAlert:StashAlert {id: randomUUID()})
                SET stashAlert.active = $stashAlert
                SET stashAlert.createdTimestamp = $timestamp
                SET stashAlert.expiryTimestamp = $expiryTimestamp

                WITH stashAlert
                MATCH (subscription:OrgSubscription {id: $subscriptionId})
                MERGE (subscription)-[:HAS_SERVICE]->(stashAlert)
              `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              await tx.run(
                `
                CREATE (extraSeats:ExtraSeats {id: randomUUID()})
                SET extraSeats.value = $extraSeats
                SET extraSeats.createdTimestamp = $timestamp
                SET extraSeats.expiryTimestamp = $expiryTimestamp

                WITH extraSeats
                MATCH (subscription:OrgSubscription {id: $subscriptionId})
                MERGE (subscription)-[:HAS_SERVICE]->(extraSeats)
              `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: subscription.properties.id,
                },
              );

              const quota = (
                await tx.run(
                  `
                  CREATE (quota:Quota {id: randomUUID()})
                  SET quota += $quota
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
              return true;
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
            this.logger.error(
              `SubscriptionsService::createNewSubscription ${x}`,
            );
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

  async getSubscriptionInfoByOrgId(
    orgId: string,
  ): Promise<ResponseWithOptionalData<Subscription>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
          RETURN subscription {
            .*,
            tier: [
              (subscription)-[:HAS_SERVICE]->(tier:JobstashBundle)
              WHERE tier.createdTimestamp < timestamp() AND tier.expiryTimestamp > timestamp()
              | tier.name
            ][0],
            stashPool: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.stashPool
            ][0],
            atsIntegration: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.atsIntegration
            ][0],
            jobPromotions: [
              (subscription)-[:HAS_SERVICE]->(jobPromotions:JobPromotions)
              WHERE jobPromotions.createdTimestamp < timestamp() AND jobPromotions.expiryTimestamp > timestamp()
              | jobPromotions.value
            ][0],
            veri: [
              (subscription)-[:HAS_SERVICE]->(veri:VeriAddon)
              WHERE veri.createdTimestamp < timestamp() AND veri.expiryTimestamp > timestamp()
              | veri.name
            ][0],
            stashAlert: [
              (subscription)-[:HAS_SERVICE]->(stashAlert:StashAlert)
              WHERE stashAlert.createdTimestamp < timestamp() AND stashAlert.expiryTimestamp > timestamp()
              | stashAlert.active
            ][0],
            extraSeats: [
              (subscription)-[:HAS_SERVICE]->(extraSeats:ExtraSeats)
              WHERE extraSeats.createdTimestamp < timestamp() AND extraSeats.expiryTimestamp > timestamp()
              | extraSeats.value
            ][0],
            quota: [
              (subscription)-[:HAS_QUOTA]->(quota:Quota) | quota {
                .*,
                usage: [
                  (quota)-[:HAS_USAGE]->(usage:QuotaUsage) | usage { .* }
                ]
              }
            ]
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

  async getOrgSubscriptionMembers(
    orgId: string,
  ): Promise<ResponseWithOptionalData<SubscriptionMember[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
          MATCH (org)-[:HAS_USER_SEAT]->(userSeat:OrgUserSeat)<-[:OCCUPIES]-(user:User)
          MATCH (user)-[r:VERIFIED_FOR_ORG]->(org)
          RETURN {
            id: userSeat.id,
            wallet: user.wallet,
            credential: r.credential,
            account: r.account,
            name: user.name,
            role: userSeat.seatType,
            dateJoined: userSeat.createdTimestamp
          } as subscriptionMember
        `,
        { orgId },
      );
      const subscriptionMembers = result.records.map(record => {
        const subscriptionMember = record.get("subscriptionMember");
        return new SubscriptionMember({
          ...subscriptionMember,
          name: notStringOrNull(subscriptionMember.name),
          dateJoined: nonZeroOrNull(subscriptionMember.dateJoined),
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (subscription:OrgSubscription {externalId: $externalId})
          RETURN subscription {
            .*,
            tier: [
              (subscription)-[:HAS_SERVICE]->(tier:JobstashBundle)
              WHERE tier.createdTimestamp < timestamp() AND tier.expiryTimestamp > timestamp()
              | tier.name
            ][0],
            stashPool: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.stashPool
            ][0],
            atsIntegration: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.atsIntegration
            ][0],
            jobPromotions: [
              (subscription)-[:HAS_SERVICE]->(jobPromotions:JobPromotions)
              WHERE jobPromotions.createdTimestamp < timestamp() AND jobPromotions.expiryTimestamp > timestamp()
              | jobPromotions.value
            ][0],
            veri: [
              (subscription)-[:HAS_SERVICE]->(veri:VeriAddon)
              WHERE veri.createdTimestamp < timestamp() AND veri.expiryTimestamp > timestamp()
              | veri.name
            ][0],
            stashAlert: [
              (subscription)-[:HAS_SERVICE]->(stashAlert:StashAlert)
              WHERE stashAlert.createdTimestamp < timestamp() AND stashAlert.expiryTimestamp > timestamp()
              | stashAlert.active
            ][0],
            extraSeats: [
              (subscription)-[:HAS_SERVICE]->(extraSeats:ExtraSeats)
              WHERE extraSeats.createdTimestamp < timestamp() AND extraSeats.expiryTimestamp > timestamp()
              | extraSeats.value
            ][0],
            quota: [
              (subscription)-[:HAS_QUOTA]->(quota:Quota) | quota {
                .*,
                usage: [
                  (quota)-[:HAS_USAGE]->(usage:QuotaUsage) | usage { .* }
                ]
              }
            ]
          } as subscription
        `,
        { externalId },
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

  async getSubscriptionOwnerInfoByExternalId(
    externalId: string,
  ): Promise<ResponseWithOptionalData<{ orgId: string; wallet: string }>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (subscription:OrgSubscription {externalId: $externalId})<-[:HAS_SUBSCRIPTION]-(org:Organization)-[:HAS_USER_SEAT]->(userSeat:OrgUserSeat { seatType: "owner" })<-[:OCCUPIES]-(user:User)
          RETURN {
            orgId: org.orgId,
            wallet: user.wallet
          } as info
        `,
        { externalId },
      );
      const info = result.records[0]?.get("info");
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})-[:HAS_USER_SEAT]->(userSeat:OrgUserSeat { seatType: "owner" })<-[:OCCUPIES]-(user:User)
          RETURN {
            orgId: org.orgId,
            wallet: user.wallet
          } as info
        `,
        { orgId },
      );
      const info = result.records[0]?.get("info");
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

      const result = await this.neogma.getTransaction(null, async tx => {
        const internalRefCode = randomToken(16);
        const timestamp = new Date();
        const externalRefCode = invoiceId;
        const quotaInfo = JOBSTASH_QUOTA[existingSubscription.tier];
        const veriAddons = VERI_ADDONS[existingSubscription.veri];

        const quotaPayload = {
          veri: existingSubscription.veri
            ? quotaInfo.veri + veriAddons
            : quotaInfo.veri,
          createdTimestamp: timestamp.getTime(),
          expiryTimestamp: addMonths(timestamp, 2).getTime(),
        };

        const payload = {
          wallet: ownerInfo.wallet,
          orgId: ownerInfo.orgId,
          jobstash: existingSubscription.tier,
          veri: existingSubscription.veri,
          stashAlert: existingSubscription.stashAlert,
          extraSeats: existingSubscription.extraSeats,
          amount,
          subscriptionId: existingSubscription.id,
          quota: quotaPayload,
          action: "subscription-renewal",
          duration: "monthly",
          internalRefCode,
          externalRefCode,
          timestamp: timestamp.getTime(),
          expiryTimestamp: addMonths(
            existingSubscription.expiryTimestamp,
            1,
          ).getTime(),
        };

        await tx.run(
          `
            MATCH (subscription:OrgSubscription {id: $subscriptionId})
            SET subscription.status = "active"
            SET subscription.expiryTimestamp = $expiryTimestamp

            WITH subscription
            MATCH (subscription)-[:HAS_SERVICE]->(tier:JobstashBundle)
            SET tier.expiryTimestamp = $expiryTimestamp

            WITH subscription
            MATCH (subscription)-[:HAS_SERVICE]->(veri:VeriAddon)
            SET veri.expiryTimestamp = $expiryTimestamp

            WITH subscription
            MATCH (subscription)-[:HAS_SERVICE]->(jobPromotions:JobPromotions)
            SET jobPromotions.expiryTimestamp = $expiryTimestamp

            WITH subscription
            MATCH (subscription)-[:HAS_SERVICE]->(stashAlert:StashAlert)
            SET stashAlert.expiryTimestamp = $expiryTimestamp

            WITH subscription
            MATCH (subscription)-[:HAS_SERVICE]->(extraSeats:ExtraSeats)
            SET extraSeats.expiryTimestamp = $expiryTimestamp

            RETURN subscription
          `,
          payload,
        );

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
              SET payment.createdTimestamp = $timestamp
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
            subscriptionId: existingSubscription.id,
            paymentId: payment.properties.id,
            quotaId: quota.properties.id,
          },
        );

        return true;
      });
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (subscription:OrgSubscription {externalId: $subscriptionId})
          SET subscription.veriPayg = $paygState
          RETURN subscription
        `,
        { subscriptionId, paygState },
      );
      if (result.records.length === 0) {
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

      const result = await this.neogma.getTransaction(null, async tx => {
        const internalRefCode = randomToken(16);
        const externalRefCode = invoiceId;
        const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
        const veriAddons = VERI_ADDONS[dto.veri];

        const timestamp = now();

        const veriCycleStart =
          subscription.items.data.find(x =>
            x.price.lookup_key.startsWith("veri_"),
          )?.current_period_start * 1000;

        const stashAlertCycleStart =
          subscription.items.data.find(
            x => x.price.lookup_key === LOOKUP_KEYS.STASH_ALERT_PRICE,
          )?.current_period_start * 1000;

        const cycleStart =
          subscription.items.data.find(x =>
            x.price.lookup_key.startsWith("jobstash_"),
          )?.current_period_start * 1000;

        const cycleEnd =
          subscription.items.data.find(x =>
            x.price.lookup_key.startsWith("jobstash_"),
          )?.current_period_end * 1000;

        const payload = {
          ...dto,
          ...ownerInfo,
          quota: {
            veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
            jobPromotions: quotaInfo.jobPromotions,
            createdTimestamp: veriCycleStart,
            expiryTimestamp: addMonths(veriCycleStart, 2).getTime(),
          },
          externalId: subscriptionId,
          stashPool: quotaInfo.stashPool,
          atsIntegration: quotaInfo.atsIntegration,
          stashAlert: dto.stashAlert,
          action: "subscription-change",
          duration: "monthly",
          internalRefCode,
          externalRefCode,
          timestamp,
          expiryTimestamp: cycleEnd,
        };

        await tx.run(
          `
            MATCH (subscription:OrgSubscription {id: $subscriptionId})
            SET subscription.status = "active"
          `,
          {
            subscriptionId: existingSubscription.id,
          },
        );

        if (
          JOBSTASH_BUNDLE_PRICING[existingSubscription.tier] <
          JOBSTASH_BUNDLE_PRICING[dto.jobstash]
        ) {
          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:JobstashBundle)
              SET tier.expiryTimestamp = $timestamp

              WITH subscription
              CREATE (tier:JobstashBundle {id: randomUUID()})
              SET tier.name = $jobstash
              SET tier.stashPool = $stashPool
              SET tier.atsIntegration = $atsIntegration
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              createdTimestamp: cycleStart,
              subscriptionId: existingSubscription.id,
            },
          );

          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(jobPromotions:JobPromotions)
              SET jobPromotions.expiryTimestamp = $expiryTimestamp

              WITH subscription
              CREATE (jobPromotions:JobPromotions {id: randomUUID()})
              SET jobPromotions.value = $quota.jobPromotions
              SET jobPromotions.createdTimestamp = $createdTimestamp
              SET jobPromotions.expiryTimestamp = $expiryTimestamp

              WITH subscription, jobPromotions
              MERGE (subscription)-[:HAS_SERVICE]->(jobPromotions)
            `,
            {
              ...payload,
              createdTimestamp: cycleStart,
              subscriptionId: existingSubscription.id,
            },
          );
        } else if (
          JOBSTASH_BUNDLE_PRICING[existingSubscription.tier] >
          JOBSTASH_BUNDLE_PRICING[dto.jobstash]
        ) {
          const existingTier = (
            await tx.run(
              `
                MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:JobstashBundle)
                RETURN tier
              `,
              {
                subscriptionId: existingSubscription.id,
              },
            )
          ).records[0].get("tier");

          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})
              CREATE (tier:JobstashBundle {id: randomUUID()})
              SET tier.name = $jobstash
              SET tier.stashPool = $stashPool
              SET tier.atsIntegration = $atsIntegration
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              subscriptionId: existingSubscription.id,
              createdTimestamp: existingTier.properties.expiryTimestamp,
              expiryTimestamp: addMonths(
                existingTier.properties.expiryTimestamp,
                1,
              ).getTime(),
            },
          );

          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})
              CREATE (jobPromotions:JobPromotions {id: randomUUID()})
              SET jobPromotions.value = $quota.jobPromotions
              SET jobPromotions.createdTimestamp = $createdTimestamp
              SET jobPromotions.expiryTimestamp = $expiryTimestamp

              WITH subscription, jobPromotions
              MERGE (subscription)-[:HAS_SERVICE]->(jobPromotions)
            `,
            {
              ...payload,
              subscriptionId: existingSubscription.id,
              createdTimestamp: existingTier.properties.expiryTimestamp,
              expiryTimestamp: addMonths(
                existingTier.properties.expiryTimestamp,
                1,
              ).getTime(),
            },
          );
        }

        if (
          (existingSubscription.veri
            ? VERI_BUNDLE_PRICING[existingSubscription.veri]
            : 0) < VERI_BUNDLE_PRICING[dto.veri]
        ) {
          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:VeriAddon)
              SET tier.expiryTimestamp = $timestamp

              WITH subscription
              CREATE (tier:VeriAddon {id: randomUUID()})
              SET tier.name = $veri
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              createdTimestamp: veriCycleStart,
              subscriptionId: existingSubscription.id,
            },
          );
        } else if (
          (existingSubscription.veri
            ? VERI_BUNDLE_PRICING[existingSubscription.veri]
            : 0) > VERI_BUNDLE_PRICING[dto.veri]
        ) {
          const existingTier = (
            await tx.run(
              `
                MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:VeriAddon)
                RETURN tier
              `,
              {
                subscriptionId: existingSubscription.id,
              },
            )
          ).records[0].get("tier");

          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})
              CREATE (tier:VeriAddon {id: randomUUID()})
              SET tier.name = $veri
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              subscriptionId: existingSubscription.id,
              createdTimestamp: existingTier.properties.expiryTimestamp,
              expiryTimestamp: addMonths(
                existingTier.properties.expiryTimestamp,
                1,
              ).getTime(),
            },
          );
        }

        if (
          (existingSubscription.stashAlert ? STASH_ALERT_PRICE : 0) <
          (dto.stashAlert ? STASH_ALERT_PRICE : 0)
        ) {
          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:StashAlert)
              SET tier.expiryTimestamp = $timestamp

              WITH subscription
              CREATE (tier:StashAlert {id: randomUUID()})
              SET tier.active = $stashAlert
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              createdTimestamp: stashAlertCycleStart,
              subscriptionId: existingSubscription.id,
            },
          );
        } else if (
          (existingSubscription.stashAlert ? STASH_ALERT_PRICE : 0) >
          (dto.stashAlert ? STASH_ALERT_PRICE : 0)
        ) {
          const existingTier = (
            await tx.run(
              `
                MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:StashAlert)
                RETURN tier
              `,
              {
                subscriptionId: existingSubscription.id,
              },
            )
          ).records[0].get("tier");

          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})
              CREATE (tier:StashAlert {id: randomUUID()})
              SET tier.active = $stashAlert
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              subscriptionId: existingSubscription.id,
              createdTimestamp: existingTier.properties.expiryTimestamp,
              expiryTimestamp: addMonths(
                existingTier.properties.expiryTimestamp,
                1,
              ).getTime(),
            },
          );
        }

        if (
          existingSubscription.extraSeats *
            EXTRA_SEATS_PRICING[existingSubscription.tier] <
          dto.extraSeats * EXTRA_SEATS_PRICING[dto.jobstash]
        ) {
          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:ExtraSeats)
              SET tier.expiryTimestamp = $timestamp

              WITH subscription
              CREATE (tier:ExtraSeats {id: randomUUID()})
              SET tier.value = $extraSeats
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              createdTimestamp: cycleStart,
              subscriptionId: existingSubscription.id,
            },
          );
        } else if (
          existingSubscription.extraSeats *
            EXTRA_SEATS_PRICING[existingSubscription.tier] >
          dto.extraSeats * EXTRA_SEATS_PRICING[dto.jobstash]
        ) {
          const existingTier = (
            await tx.run(
              `
                MATCH (subscription:OrgSubscription {id: $subscriptionId})-[:HAS_SERVICE]->(tier:ExtraSeats)
                RETURN tier
              `,
              {
                subscriptionId: existingSubscription.id,
              },
            )
          ).records[0].get("tier");

          await tx.run(
            `
              MATCH (subscription:OrgSubscription {id: $subscriptionId})
              CREATE (tier:ExtraSeats {id: randomUUID()})
              SET tier.value = $extraSeats
              SET tier.createdTimestamp = $createdTimestamp
              SET tier.expiryTimestamp = $expiryTimestamp

              WITH subscription, tier
              MERGE (subscription)-[:HAS_SERVICE]->(tier)
            `,
            {
              ...payload,
              subscriptionId: existingSubscription.id,
              createdTimestamp: existingTier.properties.expiryTimestamp,
              expiryTimestamp: addMonths(
                existingTier.properties.expiryTimestamp,
                1,
              ).getTime(),
            },
          );
        }

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
              SET payment.createdTimestamp = $timestamp
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
              RETURN quota
            `,
            payload,
          )
        ).records[0].get("quota");

        await tx.run(
          `
            MATCH (user:User {wallet: $wallet}), (subscription:OrgSubscription {id: $subscriptionId}), (payment:Payment {id: $paymentId}), (quota:Quota {id: $quotaId})
            MERGE (subscription)-[:HAS_PAYMENT]->(payment)<-[:MADE_SUBSCRIPTION_PAYMENT]-(user)

            WITH subscription, quota
            MERGE (subscription)-[:HAS_QUOTA]->(quota)
          `,
          {
            ...payload,
            subscriptionId: existingSubscription.id,
            paymentId: payment.properties.id,
            quotaId: quota.properties.id,
          },
        );
        return true;
      });
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

  async cancelSubscription(externalId: string): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            MATCH (subscription:OrgSubscription {externalId: $externalId})
            SET subscription.status = "inactive"
          `,
        { externalId },
      );
      return {
        success: true,
        message: "Subscription cancelled successfully",
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
        const users = await this.neogma.queryRunner.run(
          `
          MATCH (org:Organization {orgId: $orgId})
          OPTIONAL MATCH (org)-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)-[:HAS_QUOTA|HAS_PAYMENT|HAS_SERVICE]->(node)
          OPTIONAL MATCH (org)-[:HAS_USER_SEAT]->(userSeat:OrgUserSeat)<-[:OCCUPIES]-(user:User)-[:HAS_PENDING_PAYMENT|MADE_SUBSCRIPTION_PAYMENT|USED_QUOTA]->(node1)
          DETACH DELETE subscription, node, userSeat, node1
          RETURN user { .* } as user
        `,
          { orgId },
        );
        if (users.records.length > 0) {
          this.logger.log(`Resetting subscription state for ${orgId}`);
          for (const userRecord of users.records) {
            const user = userRecord.get("user");
            const currentPerms = await this.userService.getUserPermissions(
              user.wallet,
            );
            const permsToDrop: string[] = [
              CheckWalletPermissions.ORG_MEMBER,
              CheckWalletPermissions.ORG_OWNER,
            ];
            await this.userService.syncUserPermissions(
              user.wallet,
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization)-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
          MATCH (org)-[:HAS_USER_SEAT]->(userSeat:OrgUserSeat { seatType: "owner" })<-[:OCCUPIES]-(user:User)
          RETURN subscription {
            .*,
            tier: [
              (subscription)-[:HAS_SERVICE]->(tier:JobstashBundle)
              WHERE tier.createdTimestamp < timestamp() AND tier.expiryTimestamp > timestamp()
              | tier.name
            ][0],
            stashPool: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.stashPool
            ][0],
            atsIntegration: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.atsIntegration
            ][0],
            jobPromotions: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.jobPromotions
            ][0],
            veri: [
              (subscription)-[:HAS_SERVICE]->(veri:VeriAddon)
              WHERE veri.createdTimestamp < timestamp() AND veri.expiryTimestamp > timestamp()
              | veri.name
            ][0],
            stashAlert: [
              (subscription)-[:HAS_SERVICE]->(stashAlert:StashAlert)
              WHERE stashAlert.createdTimestamp < timestamp() AND stashAlert.expiryTimestamp > timestamp()
              | stashAlert.active
            ][0],
            extraSeats: [
              (subscription)-[:HAS_SERVICE]->(extraSeats:ExtraSeats)
              WHERE extraSeats.createdTimestamp < timestamp() AND extraSeats.expiryTimestamp > timestamp()
              | extraSeats.value
            ][0],
            quota: [
              (subscription)-[:HAS_QUOTA]->(quota:Quota) | quota {
                .*,
                usage: [
                  (quota)-[:HAS_USAGE]->(usage:QuotaUsage) | usage { .* }
                ]
              }
            ]
          } as subscription, user.wallet as ownerWallet, org.orgId as orgId
        `,
      );
      const subscriptions = result.records.map(x => ({
        subscription: x.get("subscription"),
        ownerWallet: x.get("ownerWallet"),
        orgId: x.get("orgId"),
      }));
      for (const job of subscriptions) {
        const ownerEmail = await this.getSubscriptionOwnerEmail(
          job.ownerWallet,
          job.orgId,
        );

        if (ownerEmail) {
          const subscription = new SubscriptionEntity(
            job.subscription,
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
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
        MATCH (subscription)-[:HAS_PAYMENT]->(payment:Payment)
        RETURN payment { .* } as payment
        ORDER BY payment.createdTimestamp DESC
        `,
        { orgId },
      );

      const payments = result.records.map(record => record.get("payment"));

      return {
        success: true,
        message: "Payments retrieved successfully",
        data: payments.map(payment => new Payment(payment)),
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
