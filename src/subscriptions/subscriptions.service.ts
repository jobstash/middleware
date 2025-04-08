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
import { SubscriptionMetadata } from "src/payments/dto/webhook-data.dto";
import { UserService } from "src/user/user.service";
import { button, emailBuilder, randomToken, text } from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { JOBSTASH_QUOTA, VERI_ADDONS } from "src/shared/constants/quota";
import {
  MeteredService,
  Payment,
  Subscription,
} from "src/shared/interfaces/org";
import { SubscriptionEntity } from "src/shared/entities/subscription.entity";
import { addDays, addHours, addMonths, getDayOfYear } from "date-fns";
import { capitalize, now } from "lodash";
import { ProfileService } from "src/auth/profile/profile.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CheckWalletPermissions } from "src/shared/constants";

@Injectable()
export class SubscriptionsService {
  private readonly logger = new CustomLogger(SubscriptionsService.name);
  private readonly from: string;
  private readonly ORG_ADMIN_DOMAIN: string;
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly profileService: ProfileService,
    private readonly paymentsService: PaymentsService,
  ) {
    this.from = this.configService.getOrThrow<string>("EMAIL");
    this.ORG_ADMIN_DOMAIN =
      this.configService.getOrThrow<string>("ORG_ADMIN_DOMAIN");
  }

  async isPaymentReminderNeeded(
    paymentReference: string,
    orgId: string,
  ): Promise<boolean> {
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

  generatePaymentDetails(dto: {
    jobstash: string;
    veri: string;
    stashAlert: boolean;
    extraSeats: number;
  }): { description: string; amount: number } {
    const { jobstash, veri, stashAlert, extraSeats } = dto;
    const total = [
      jobstash ? JOBSTASH_BUNDLE_PRICING[jobstash] : 0,
      veri ? VERI_BUNDLE_PRICING[veri] : 0,
      stashAlert ? STASH_ALERT_PRICE : 0,
    ].reduce((a, b) => a + b, 0);

    const extraSeatCost = extraSeats
      ? EXTRA_SEATS_PRICING[jobstash] * extraSeats
      : 0;

    const description = [
      jobstash
        ? `Jobstash ${capitalize(jobstash)} Bundle: $${JOBSTASH_BUNDLE_PRICING[jobstash]}`
        : null,
      veri
        ? `Veri ${capitalize(veri)} Addon: $${VERI_BUNDLE_PRICING[veri]}`
        : null,
      stashAlert ? `StashAlert: $${STASH_ALERT_PRICE}` : null,
      extraSeats && jobstash !== "starter"
        ? `${extraSeats} Extra Seats @ ${EXTRA_SEATS_PRICING[jobstash]}/seat: $${EXTRA_SEATS_PRICING[jobstash] * extraSeats}`
        : null,
    ]
      .filter(Boolean)
      .join(" + ");

    const amount = total + extraSeatCost;
    return { description, amount };
  }

  async getSubscriptionOwnerEmail(
    wallet: string,
    orgId: string,
  ): Promise<string | undefined> {
    return data(await this.profileService.getUserVerifications(wallet)).find(
      org => org.id === orgId && org.credential === "email" && org.isOwner,
    )?.account;
  }

  async recordQuotaUsage(
    orgId: string,
    wallet: string,
    amount: number,
    service: MeteredService,
  ): Promise<ResponseWithNoData> {
    try {
      this.logger.log(
        `Attempting to record ${amount} quota usage for ${wallet} for ${orgId} on ${service}`,
      );
      const subscription = data(await this.getSubscriptionInfo(orgId));
      const isOrgMember = await this.userService.isOrgMember(wallet, orgId);
      if (isOrgMember) {
        if (subscription.isActive() && subscription.canAccessService(service)) {
          const quota = subscription.getOldestActiveUnfilledQuota(service);
          if (quota?.id) {
            await this.neogma.queryRunner.run(
              `
                MATCH (user:User {wallet: $wallet}), (subscription:OrgSubscription {id: $subscriptionId, status: "active"})-[:HAS_QUOTA]->(quota:Quota {id: $quotaId})
                MERGE (user)-[:USED_QUOTA]->(quotaUsage:QuotaUsage {id: randomUUID(), service: $service, amount: $amount, timestamp: timestamp()})<-[:HAS_USAGE]-(quota)
              `,
              {
                subscriptionId: subscription.id,
                quotaId: quota.id,
                wallet,
                amount,
                service,
              },
            );
            this.logger.log(`Successfully recorded quota usage`);
            return {
              success: true,
              message: `Successfully recorded quota usage`,
            };
          } else {
            this.logger.log(
              `Account has exhausted all available quota for ${service}`,
            );
            return {
              success: false,
              message: `Account has exhausted all available quota for ${service}`,
            };
          }
        } else {
          this.logger.log(
            `Cannot record quota usage for expired or inactive subscription`,
          );
          return {
            success: false,
            message: `Cannot record quota usage for expired or inactive subscription`,
          };
        }
      } else {
        this.logger.log(`Non org member cannot record quota usage`);
        return {
          success: false,
          message: `Non org member cannot record quota usage`,
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
        `SubscriptionsService::recordQuotaUsage ${err.message}`,
      );
      return {
        success: false,
        message: `Error recording quota usage`,
      };
    }
  }

  async initiateNewSubscription(input: {
    wallet: string;
    email: string;
    dto: NewSubscriptionInput;
  }): Promise<ResponseWithOptionalData<string>> {
    try {
      const { wallet, email, dto } = input;
      this.logger.log("Generating payment details");
      const { description, amount } = this.generatePaymentDetails(dto);

      if (amount > 0) {
        this.logger.log("Creating charge");
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
            action: "new-subscription",
          },
          redirect_url: `${this.ORG_ADMIN_DOMAIN}`,
          cancel_url: `${this.ORG_ADMIN_DOMAIN}`,
        });

        if (paymentLink) {
          this.logger.log("Creating pending payment");
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
              action: "new-subscription",
              orgId: dto.orgId,
            },
          );

          try {
            this.logger.log("Sending payment reminder emails: now");
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.from,
                to: email,
                subject: "Your hiring tools are waiting for you!",
                previewText:
                  "Complete your purchase and unlock JobStash features to help streamline your hiring process.",
                title: "Hey there,",
                bodySections: [
                  text(
                    "We noticed you left some powerful hiring add-ons in your cart. These features can help you find the right talent faster and more efficiently - perfect for taking your recruitment process to the next level.",
                  ),
                  text(
                    "Don’t leave these tools behind! Just click below to finish your purchase.",
                  ),
                  button("Complete Your Purchase", paymentLink.url),
                  text(
                    "If you have any questions or need more info, we’re here to help!",
                  ),
                ],
              }),
            );
            const now = new Date();
            this.logger.log("Scheduling payment reminder emails: 24 hours");
            await this.mailService.scheduleEmailWithPredicate({
              mail: emailBuilder({
                from: this.from,
                to: email,
                subject: "Your hiring tools are still waiting for you!",
                previewText:
                  "Let’s finish what you started! These add-ons are designed to make your hiring easier.",
                title: "Hi there,",
                bodySections: [
                  text(
                    "It’s been 24 hours since you added those hiring add-ons to your cart. These features are designed to help you streamline your hiring process, access a broader talent pool, and make smarter recruitment decisions.",
                  ),
                  text("Take the next step and complete your purchase now."),
                  button("Complete Your Purchase", paymentLink.url),
                  text(
                    "We’re here to help if you have any questions or need assistance.",
                  ),
                ],
              }),
              predicateName: "isPaymentReminderNeeded",
              predicateData: {
                paymentReference: paymentLink.id,
                orgId: dto.orgId,
              },
              time: addHours(now, 24).getTime(),
            });
            this.logger.log("Scheduling payment reminder emails: 3 days");
            await this.mailService.scheduleEmailWithPredicate({
              mail: emailBuilder({
                from: this.from,
                to: email,
                subject: "Still interested in optimizing your hiring process?",
                previewText:
                  "The add-ons you need to improve your hiring are still in your cart!",
                title: "Hello again,",
                bodySections: [
                  text(
                    "It’s been a few days, and we just wanted to remind you that your cart is still open.",
                  ),
                  text(
                    "These hiring add-ons are designed to make your recruitment process more efficient and give you the edge you need in today’s competitive job market.",
                  ),
                  text("Ready to take the next step?"),
                  button("Complete Your Purchase", paymentLink.url),
                  text(
                    "If you’d like more details or have any questions, we’re always here to chat!",
                  ),
                ],
              }),
              predicateName: "isPaymentReminderNeeded",
              predicateData: {
                paymentReference: paymentLink.id,
                orgId: dto.orgId,
              },
              time: addDays(now, 3).getTime(),
            });
            this.logger.log("Scheduling payment reminder emails: 7 days");
            await this.mailService.scheduleEmailWithPredicate({
              mail: emailBuilder({
                from: this.from,
                to: email,
                subject: "Last chance to complete your purchase!",
                previewText:
                  "Don’t let your hiring tools slip away. Your cart expires soon.",
                title: "Hey there,",
                bodySections: [
                  text("Your cart is about to expire!"),
                  text(
                    "These hiring add-ons are a great way to enhance your recruitment process, this is your final chance to grab them and improve your hiring process.",
                  ),
                  button("Complete Your Purchase", paymentLink.url),
                  text(
                    "Let us know if you have any questions - we’d be happy to help!",
                  ),
                ],
              }),
              predicateName: "isPaymentReminderNeeded",
              predicateData: {
                paymentReference: paymentLink.id,
                orgId: dto.orgId,
              },
              time: addDays(now, 7).getTime(),
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
              `SubscriptionsService::initiateNewSubscription ${err.message}`,
            );
          }
          this.logger.log("Subscription initiated successfully");
          return {
            success: true,
            message: "Subscription initiated successfully",
            data: paymentLink.url,
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
        return this.createNewSubscription({
          ...dto,
          extraSeats: dto.jobstash === "starter" ? 0 : dto.extraSeats,
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

  async createNewSubscription(
    dto: SubscriptionMetadata,
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
                  createdTimestamp: timestamp.getTime(),
                  expiryTimestamp: addMonths(timestamp, 2).getTime(),
                },
                stashPool: quotaInfo.stashPool,
                atsIntegration: quotaInfo.atsIntegration,
                boostedVacancyMultiplier: quotaInfo.boostedVacancyMultiplier,
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
                  SET tier.boostedVacancyMultiplier = $boostedVacancyMultiplier
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
                boostedVacancyMultiplier: quotaInfo.boostedVacancyMultiplier,
                quota: {
                  veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
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
                SET tier.boostedVacancyMultiplier = $boostedVacancyMultiplier
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
          const subscription = data(await this.getSubscriptionInfo(dto.orgId));
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

  async getSubscriptionInfo(
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
            boostedVacancyMultiplier: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.boostedVacancyMultiplier
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
      } = data(await this.getSubscriptionInfo(orgId));

      const { description, amount } = this.generatePaymentDetails({
        jobstash,
        veri,
        stashAlert,
        extraSeats,
      });

      if (jobstash === "starter") {
        return {
          success: false,
          message:
            "You can't renew your free trial. Please upgrade to a premium plan to keep using JobStash.xyz.",
        };
      } else {
        const email = await this.getSubscriptionOwnerEmail(wallet, orgId);

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
              orgId,
              jobstash,
              veri,
              stashAlert,
              extraSeats,
              wallet,
              amount,
            }),
            action: "subscription-renewal",
          },
          redirect_url: `${this.ORG_ADMIN_DOMAIN}`,
          cancel_url: `${this.ORG_ADMIN_DOMAIN}`,
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
              action: "subscription-renewal",
              orgId,
            },
          );

          try {
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.from,
                to: email,
                subject:
                  "Renewal Request for Your JobStash Subscription – Complete Your Payment",
                title: "Hey there,",
                bodySections: [
                  text(
                    "We’ve received your subscription renewal request for JobStash! 🎉 To complete your renewal and continue enjoying our premium features, please follow the payment link below:",
                  ),
                  button("Complete Your Purchase", paymentLink.url),
                  text(
                    "Once we receive your payment, your subscription will be renewed, and you’ll regain full access to all premium features.",
                  ),
                  text(
                    `If you have any questions or need help with the payment process, feel free to reach out to us! Join our help channel <a href="https://t.me/+24r67MsBXT00ODE8">here</a> – we're here to assist you!`,
                  ),
                  text(
                    "Thank you for being a valued member of the JobStash community. We’re excited to continue supporting your journey!",
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
              `SubscriptionsService::initiateSubscriptionRenewal ${err.message}`,
            );
          }
          return {
            success: true,
            message: "Subscription renewal initiated successfully",
            data: paymentLink.url,
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

  async renewSubscription(
    dto: SubscriptionMetadata,
  ): Promise<ResponseWithNoData> {
    try {
      const { wallet, orgId } = dto;
      this.logger.log("Fetching org owner email");
      const ownerEmail = await this.getSubscriptionOwnerEmail(wallet, orgId);
      if (!ownerEmail) {
        this.logger.log(
          `User not authorized to renew subscription to ${orgId}`,
        );
        return {
          success: false,
          message: `You are not the owner of this organization`,
        };
      } else {
        this.logger.log("Renewing subscription");
        const existingSubscription = data(
          await this.getSubscriptionInfo(dto.orgId),
        );
        const result = await this.neogma.getTransaction(null, async tx => {
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
            const timestamp = new Date();
            const externalRefCode = pendingPayment.reference;
            const quotaInfo = JOBSTASH_QUOTA[dto.jobstash];
            const veriAddons = VERI_ADDONS[dto.veri];

            const quotaPayload = {
              veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
              createdTimestamp: timestamp.getTime(),
              expiryTimestamp: addMonths(timestamp, 2).getTime(),
            };

            const payload = {
              ...dto,
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
                action: "subscription-renewal",
                ownerEmail,
                ...dto,
              });
              Sentry.captureMessage(
                "Attempted confirmation of missing pending payment",
              );
            });
            return false;
          }
        });
        if (result) {
          this.logger.log("Renewed subscription successfully");
          this.logger.log("Sending confirmation email to owner");
          try {
            //TODO: change these to official copy from @Laura
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.from,
                to: ownerEmail,
                subject: "JobStash.xyz Subscription",
                previewText:
                  "Your subscription has been renewed. You can now continue using JobStash.xyz.",
                title: "Your JobStash.xyz subscription has been renewed",
                bodySections: [
                  text(
                    "Your subscription is active. You can now start using JobStash.xyz.",
                  ),
                  text(
                    `Head to your <a href="${this.configService.getOrThrow("ORG_ADMIN_DOMAIN")}">profile</a> to start using your shiny new subscription.`,
                  ),
                  text(
                    "If you have any questions, feel free to reach out to us at support@jobstash.xyz.",
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
              `SubscriptionsService::renewSubscription ${err.message}`,
            );
          }
        } else {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "business-logic",
              source: "subscriptions.service",
            });
            scope.setExtra("input", {
              wallet: dto.wallet,
              orgId: dto.orgId,
              action: "subscription-renewal",
              ownerEmail,
              ...dto,
            });
            Sentry.captureMessage(
              "Attempted confirmation of missing pending payment",
            );
          });
        }
        return {
          success: result,
          message: result
            ? "Subscription renewed successfully"
            : "Error renewing subscription",
        };
      }
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
          wallet: dto.wallet,
          orgId: dto.orgId,
          action: "subscription-renewal",
          ...dto,
        });
        Sentry.captureException(err);
      });
      return {
        success: false,
        message: "Error renewing subscription",
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
      } = data(await this.getSubscriptionInfo(orgId));

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
        const email = await this.getSubscriptionOwnerEmail(wallet, orgId);

        const { description, amount } = this.generatePaymentDetails({
          jobstash: newJobstash,
          veri: newVeri,
          stashAlert: newStashAlert,
          extraSeats: newExtraSeats,
        });

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
              orgId,
              jobstash: newJobstash,
              veri: newVeri,
              stashAlert: newStashAlert,
              extraSeats: newExtraSeats,
              wallet,
              amount,
            }),
            action: `subscription-change`,
          },
          redirect_url: `${this.ORG_ADMIN_DOMAIN}`,
          cancel_url: `${this.ORG_ADMIN_DOMAIN}`,
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
              action: `subscription-change`,
              orgId,
            },
          );

          try {
            //TODO: change these to official copy from @Laura
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.from,
                to: email,
                subject: "Your hiring tools are waiting for you!",
                previewText:
                  "Complete your purchase and unlock JobStash features to help streamline your hiring process.",
                title: "Hey there,",
                bodySections: [
                  text(
                    "We noticed you left some powerful hiring add-ons in your cart. These features can help you find the right talent faster and more efficiently - perfect for taking your recruitment process to the next level.",
                  ),
                  text(
                    "Don’t leave these tools behind! Just click below to finish your purchase.",
                  ),
                  button("Complete Your Purchase", paymentLink.url),
                  text(
                    "If you have any questions or need more info, we’re here to help!",
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
              `SubscriptionsService::initiateSubscriptionChange ${err.message}`,
            );
          }
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

  async changeSubscription(
    dto: SubscriptionMetadata,
  ): Promise<ResponseWithNoData> {
    try {
      const { wallet, orgId } = dto;
      this.logger.log("Fetching org owner email");
      const ownerEmail = await this.getSubscriptionOwnerEmail(wallet, orgId);
      if (!ownerEmail) {
        this.logger.log(
          `User not authorized to change subscription for ${orgId}`,
        );
        return {
          success: false,
          message: `You are not the owner of this organization`,
        };
      } else {
        const timestamp = new Date();
        this.logger.log("Changing subscription");
        const existingSubscription = data(
          await this.getSubscriptionInfo(orgId),
        );

        const result = await this.neogma.getTransaction(null, async tx => {
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

            const payload = {
              ...dto,
              quota: {
                veri: dto.veri ? quotaInfo.veri + veriAddons : quotaInfo.veri,
                createdTimestamp: timestamp.getTime(),
                expiryTimestamp: addMonths(timestamp, 2).getTime(),
              },
              stashPool: quotaInfo.stashPool,
              atsIntegration: quotaInfo.atsIntegration,
              boostedVacancyMultiplier: quotaInfo.boostedVacancyMultiplier,
              stashAlert: dto.stashAlert,
              action: "subscription-change",
              duration: "monthly",
              internalRefCode,
              externalRefCode,
              timestamp: timestamp.getTime(),
              expiryTimestamp: addMonths(timestamp, 1).getTime(),
            };

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
                  SET tier.boostedVacancyMultiplier = $boostedVacancyMultiplier
                  SET tier.createdTimestamp = $createdTimestamp
                  SET tier.expiryTimestamp = $expiryTimestamp

                  WITH subscription, tier
                  MERGE (subscription)-[:HAS_SERVICE]->(tier)
                `,
                {
                  ...payload,
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: existingSubscription.id,
                },
              );
            } else {
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
                  SET tier.boostedVacancyMultiplier = $boostedVacancyMultiplier
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
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: existingSubscription.id,
                },
              );
            } else {
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
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: existingSubscription.id,
                },
              );
            } else {
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
                  createdTimestamp: timestamp.getTime(),
                  subscriptionId: existingSubscription.id,
                },
              );
            } else {
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
                action: "subscription-change",
                ...dto,
              });
              Sentry.captureMessage(
                "Attempted confirmation of missing pending payment",
              );
            });
            return false;
          }
        });
        if (result) {
          this.logger.log("Changed subscription successfully");
          this.logger.log("Sending confirmation email to owner");
          try {
            //TODO: change these to official copy from @Laura
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.from,
                to: ownerEmail,
                subject: "JobStash.xyz Subscription",
                previewText:
                  "Your subscription has been upgraded. You can now continue using JobStash.xyz.",
                title: "Your JobStash.xyz subscription has been upgraded",
                bodySections: [
                  text(
                    "Your new subscription is active. You can now start using JobStash.xyz.",
                  ),
                  text(
                    `Head to your <a href="${this.configService.getOrThrow("ORG_ADMIN_DOMAIN")}">profile</a> to start using your shiny new subscription.`,
                  ),
                  text(
                    "If you have any questions, feel free to reach out to us at support@jobstash.xyz.",
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
              `SubscriptionsService::changeSubscription ${err.message}`,
            );
          }
        } else {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "business-logic",
              source: "subscriptions.service",
            });
            scope.setExtra("input", {
              wallet: dto.wallet,
              orgId: dto.orgId,
              action: "subscription-change",
              ownerEmail,
              ...dto,
            });
            Sentry.captureMessage(
              "Attempted confirmation of missing pending payment",
            );
          });
        }
        return {
          success: result,
          message: result
            ? "Subscription changed successfully"
            : "Error changing subscription",
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
        `SubscriptionsService::changeSubscription ${err.message}`,
      );
      return {
        success: false,
        message: "Error changing subscription",
      };
    }
  }

  async cancelSubscription(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
            SET subscription.status = "inactive"
          `,
        { wallet, orgId },
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

  async reactivateSubscription(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
            MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)
            SET subscription.status = "active"
          `,
        { wallet, orgId },
      );
      return {
        success: true,
        message: "Subscription reactivated successfully",
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
        `SubscriptionsService::reactivateSubscription ${err.message}`,
      );
      return {
        success: false,
        message: "Error reactivating subscription",
      };
    }
  }

  async resetSubscriptionState(orgId: string): Promise<ResponseWithNoData> {
    try {
      const users = await this.neogma.queryRunner.run(
        `
          MATCH (org:Organization {orgId: $orgId})
          OPTIONAL MATCH (org)-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription)-[:HAS_QUOTA|HAS_PAYMENT|HAS_SERVICE]->(node)
          OPTIONAL MATCH (org)-[:HAS_USER_SEAT]->(userSeat:OrgUserSeat)<-[:OCCUPIES]-(user:User)
          DETACH DELETE subscription, node, userSeat
          RETURN user { .* } as user
        `,
        { orgId },
      );
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
            boostedVacancyMultiplier: [
              (subscription)-[:HAS_SERVICE]->(bundle:JobstashBundle)
              WHERE bundle.createdTimestamp < timestamp() AND bundle.expiryTimestamp > timestamp()
              | bundle.boostedVacancyMultiplier
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
            } else {
              await this.mailService.sendEmail(
                emailBuilder({
                  from: this.from,
                  to: ownerEmail,
                  subject: "JobStash.xyz Subscription",
                  previewText:
                    "Your subscription has been renewed. You can now continue using JobStash.xyz.",
                  title: "Your JobStash.xyz subscription has been renewed",
                  bodySections: [
                    text(
                      "Your new subscription is active. You can now start using JobStash.xyz.",
                    ),
                    text(
                      `Head to your <a href="${this.configService.getOrThrow("ORG_ADMIN_DOMAIN")}">profile</a> to start using your shiny new subscription.`,
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
        ORDER BY payment.timestamp DESC
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
