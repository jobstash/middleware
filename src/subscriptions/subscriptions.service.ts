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
import {
  button,
  emailBuilder,
  link,
  randomToken,
  text,
} from "src/shared/helpers";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { JOBSTASH_QUOTA, VERI_ADDONS } from "src/shared/constants/quota";
import { MeteredService, Subscription } from "src/shared/interfaces/org";
import { SubscriptionEntity } from "src/shared/entities/subscription.entity";
import { addDays, addHours, addMonths, subDays } from "date-fns";
import { capitalize, now } from "lodash";
import { ProfileService } from "src/auth/profile/profile.service";

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
    private readonly paymentsService: PaymentsService,
  ) {
    this.from = this.configService.getOrThrow<string>("EMAIL");
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

  async scheduleSubscriptionRenewalEmail(
    dto: SubscriptionMetadata & { ownerEmail: string },
    timestamp: Date,
  ): Promise<void> {
    const { ownerEmail } = dto;
    const { description, amount } = this.generatePaymentDetails(dto);
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
          wallet: dto.wallet,
          amount,
        }),
        action: "subscription-renewal",
      },
      redirect_url: "https://jobstash.xyz/subscriptions/renew?success=true",
      cancel_url: "https://jobstash.xyz/subscriptions/renew?cancelled=true",
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
          wallet: dto.wallet,
          reference: paymentLink.id,
          link: paymentLink.url,
          amount,
          action: "subscription-renewal",
          orgId: dto.orgId,
        },
      );
      await this.mailService.scheduleEmail(
        emailBuilder({
          from: this.from,
          to: ownerEmail,
          subject:
            "⏰ Reminder: Keep Your JobStash.xyz Subscription Active! 🚀",
          previewText:
            "Just a quick reminder that your JobStash.xyz subscription is about to expire! To continue enjoying all the features and benefits of your add-ons, please complete your payment to keep your subscription active. 💥",
          title: "Hey there,",
          bodySections: [
            text(
              "Just a quick reminder that your JobStash.xyz subscription is about to expire! To continue enjoying all the features and benefits of your add-ons, please complete your payment to keep your subscription active. 💥",
            ),
            text(
              `
                Subscription Details:
                <ul>
                <li>Subscription Plan: ${description}</li>
                <li>Next Payment Due: ${addMonths(timestamp, 1).toDateString()}</li>
                <li>Amount Due: $${amount}</li>
                </ul>
              `,
            ),
            text(
              "To make your payment, we've generated a new payment link for you. Simply click the link below and follow the instructions to complete your payment. 💰",
            ),
            link("Payment Link", paymentLink.url),
            text(
              "Once your payment is completed, you’ll receive a confirmation email from us. 🙌",
            ),
            text(
              `Got questions or need support? We’ve got your back! Just reach out to us via <a href="https://t.me/+24r67MsBXT00ODE8">Telegram</a>. We’re always here to help.`,
            ),
            text(
              "Thanks for being part of the JobStash.xyz community – we’re excited to continue supporting you!",
            ),
          ],
        }),
        subDays(addMonths(timestamp, 1), 5).getTime(),
      );
    } else {
      this.logger.warn("Error creating subscription renewal payment link");
    }
  }

  async getSubscriptionOwnerEmail(
    wallet: string,
    orgId: string,
  ): Promise<string | undefined> {
    return data(await this.profileService.getUserAuthorizedOrgs(wallet)).find(
      org => org.id === orgId,
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
          const quotaId = subscription.getOldestActiveUnfilledQuota()?.id;
          if (quotaId) {
            await this.neogma.queryRunner.run(
              `
                MATCH (user:User {wallet: $wallet}), (subscription:OrgSubscription {id: $subscriptionId, status: "active"})-[:HAS_QUOTA]->(quota:Quota {id: $quotaId})
                MERGE (user)-[:USED_QUOTA]->(quotaUsage:QuotaUsage {service: $service, amount: $amount, timestamp: timestamp()})<-[:HAS_USAGE]-(quota)
              `,
              {
                subscriptionId: subscription.id,
                quotaId: quotaId,
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
      const { description, amount } = this.generatePaymentDetails(dto);

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
            action: "new-subscription",
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
              action: "new-subscription",
              orgId: dto.orgId,
            },
          );

          try {
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
        await this.profileService.getUserVerifiedOrgs(dto.wallet),
      ).find(org => org.id === dto.orgId)?.account;
      this.logger.log(`Owner email: ${ownerEmail}`);
      const timestamp = new Date();
      this.logger.log("Creating new subscription");
      const result = await this.neogma
        .getTransaction(null, async tx => {
          if (dto.amount > 0) {
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
                    SET subscription.tier = $jobstash
                    SET subscription.veri = $veri
                    SET subscription.stashAlert = $stashAlert
                    SET subscription.extraSeats = $extraSeats
                    SET subscription.stashPool = $stashPool
                    SET subscription.atsIntegration = $atsIntegration
                    SET subscription.boostedVacancyMultiplier = $boostedVacancyMultiplier
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
                  action: "new-subscription",
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
                  SET subscription.tier = $jobstash
                  SET subscription.veri = $veri
                  SET subscription.stashAlert = $stashAlert
                  SET subscription.extraSeats = $extraSeats
                  SET subscription.stashPool = $stashPool
                  SET subscription.atsIntegration = $atsIntegration
                  SET subscription.boostedVacancyMultiplier = $boostedVacancyMultiplier
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
          this.logger.error(`SubscriptionsService::createNewSubscription ${x}`);
          return false;
        });
      if (result) {
        this.logger.log("Created new subscription successfully");
        this.logger.log("Sending confirmation email to owner");
        const subscription = data(await this.getSubscriptionInfo(dto.orgId));
        if (dto.jobstash === "starter") {
          try {
            //TODO: change these to official copy from @Laura
            await this.mailService.sendEmail(
              emailBuilder({
                from: this.from,
                to: ownerEmail,
                subject: "JobStash.xyz Free Trial",
                previewText: "Your free trial has been activated.",
                title: "Your JobStash.xyz free trial is now active",
                bodySections: [
                  text(
                    "Your free trial has been activated. You can now try out JobStash.xyz for free for the next 30 days.",
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
            this.logger.log("Scheduled renewal email to owner");
            await this.mailService.scheduleEmail(
              emailBuilder({
                from: this.from,
                to: ownerEmail,
                subject: "JobStash.xyz Free Trial Expiration",
                previewText:
                  "Your free trial is about to expire. Upgrade to a premium plan to keep using JobStash.xyz.",
                title: "Your JobStash.xyz free trial is going to expire soon",
                bodySections: [
                  text(
                    'Your free trial expires in 5 days. Head to your <a href="${this.configService.getOrThrow("ORG_ADMIN_DOMAIN")}">profile</a> to make a payment to upgrade to one of our premium plans before it expires to keep using JobStash.xyz.',
                  ),
                  text(
                    "If you have any questions, feel free to reach out to us at support@jobstash.xyz.",
                  ),
                  text("Thanks for using JobStash.xyz!"),
                ],
              }),
              subDays(addMonths(timestamp, 1), 5).getTime(),
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
            this.logger.log("Scheduled renewal email to owner");
            await this.scheduleSubscriptionRenewalEmail(
              {
                ...dto,
                ownerEmail,
              },
              timestamp,
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
        return this.userService.addOrgUser(dto.orgId, dto.wallet, subscription);
      } else {
        this.logger.log("Error creating new subscription");
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
          MATCH (org:Organization {orgId: $orgId})-[:HAS_SUBSCRIPTION]->(subscription:OrgSubscription {status: "active"})
          RETURN subscription {
            .*,
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
          redirect_url: "https://jobstash.xyz/subscriptions/renew?success=true",
          cancel_url: "https://jobstash.xyz/subscriptions/renew?cancelled=true",
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
          message: `You are not the owner of this subscription`,
        };
      } else {
        const timestamp = new Date();
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
            this.logger.log("Scheduled next renewal email to owner");
            await this.scheduleSubscriptionRenewalEmail(
              {
                ...dto,
                ownerEmail,
              },
              timestamp,
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

      const { amount: oldAmount } = this.generatePaymentDetails({
        jobstash,
        veri,
        stashAlert,
        extraSeats,
      });

      const { amount: newAmount } = this.generatePaymentDetails({
        jobstash: newJobstash,
        veri: newVeri,
        stashAlert: newStashAlert,
        extraSeats: newExtraSeats,
      });

      if (oldAmount < newAmount) {
        const { description, amount } = this.generatePaymentDetails({
          jobstash: newJobstash,
          veri: newVeri,
          stashAlert: newStashAlert,
          extraSeats: newExtraSeats,
        });

        if (newJobstash === "starter") {
          return {
            success: false,
            message:
              "You can't upgrade your plan to a free trial. Please upgrade to a premium plan to keep using JobStash.xyz.",
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
                jobstash: newJobstash,
                veri: newVeri,
                stashAlert: newStashAlert,
                extraSeats: newExtraSeats,
                wallet,
                amount,
              }),
              action: "subscription-upgrade",
            },
            redirect_url:
              "https://jobstash.xyz/subscriptions/upgrade?success=true",
            cancel_url:
              "https://jobstash.xyz/subscriptions/upgrade?cancelled=true",
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
                action: "subscription-upgrade",
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
                `SubscriptionsService::initiateSubscriptionUpgrade ${err.message}`,
              );
            }
            return {
              success: true,
              message: "Subscription upgrade initiated successfully",
              data: paymentLink.url,
            };
          } else {
            return {
              success: false,
              message: "Subscription upgrade initiation failed",
            };
          }
        }
      } else if (oldAmount > newAmount) {
        //TODO: implement subscription downgrade
      } else {
        return {
          success: false,
          message: "Subscription plan change not required",
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
        `SubscriptionsService::initiateSubscriptionUpgrade ${err.message}`,
      );
      return {
        success: false,
        message: `Error upgrading subscription`,
      };
    }
  }

  async upgradeSubscription(
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
          message: `You are not the owner of this subscription`,
        };
      } else {
        const timestamp = new Date();
        this.logger.log("Upgrading subscription");
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

            const newVeri = dto.veri
              ? quotaInfo.veri + veriAddons
              : quotaInfo.veri;
            const oldVeri = existingSubscription
              .getEpochAggregateAvailableCredits(
                existingSubscription.createdTimestamp,
                now(),
              )
              .get("veri");

            const payload = {
              ...dto,
              quota: {
                veri: newVeri + oldVeri,
                createdTimestamp: timestamp.getTime(),
                expiryTimestamp: addMonths(timestamp, 2).getTime(),
              },
              stashPool: quotaInfo.stashPool,
              atsIntegration: quotaInfo.atsIntegration,
              boostedVacancyMultiplier: quotaInfo.boostedVacancyMultiplier,
              stashAlert: dto.stashAlert,
              action: "subscription-upgrade",
              duration: "monthly",
              internalRefCode,
              externalRefCode,
              timestamp: timestamp.getTime(),
              expiryTimestamp: addMonths(timestamp, 1).getTime(),
            };

            await tx.run(
              `
                MATCH (subscription:OrgSubscription {id: $subscriptionId})
                SET subscription.status = "inactive"
                SET subscription.expiryTimestamp = timestamp()
                RETURN subscription
              `,
              { subscriptionId: existingSubscription.id },
            );

            const subscription = (
              await tx.run(
                `
                  CREATE (subscription:OrgSubscription {id: randomUUID()})
                  SET subscription.tier = $jobstash
                  SET subscription.veri = $veri
                  SET subscription.stashAlert = $stashAlert
                  SET subscription.extraSeats = $extraSeats
                  SET subscription.stashPool = $stashPool
                  SET subscription.atsIntegration = $atsIntegration
                  SET subscription.boostedVacancyMultiplier = $boostedVacancyMultiplier
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
                action: "new-subscription",
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
          this.logger.log("Upgraded subscription successfully");
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
            this.logger.log("Scheduled next renewal email to owner");
            await this.scheduleSubscriptionRenewalEmail(
              {
                ...dto,
                ownerEmail,
              },
              timestamp,
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
              `SubscriptionsService::upgradeSubscription ${err.message}`,
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
              action: "subscription-upgrade",
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
            ? "Subscription upgraded successfully"
            : "Error upgrading subscription",
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
        `SubscriptionsService::upgradeSubscription ${err.message}`,
      );
      return {
        success: false,
        message: "Error upgrading subscription",
      };
    }
  }
}
