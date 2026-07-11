import { ConfigService } from "@nestjs/config";
import { addMonths } from "date-fns";
import { ProfileService } from "src/auth/profile/profile.service";
import { MailService } from "src/mail/mail.service";
import { SubscriptionEntity } from "src/shared/entities/subscription.entity";
import {
  Payment,
  Subscription,
  SubscriptionMember,
} from "src/shared/interfaces/org";
import { StripeService } from "src/stripe/stripe.service";
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { UserService } from "src/user/user.service";
import Stripe from "stripe";
import { GraphRepository } from "./graph.repository";
import { PostgresService } from "./postgres.service";
import {
  SubscriptionQuotaWrite,
  SubscriptionRepository,
  SubscriptionServiceWrite,
} from "./subscription.repository";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("SubscriptionRepository PostgreSQL integration", () => {
  let postgres: PostgresService;
  let graph: GraphRepository;
  let repository: SubscriptionRepository;
  let service: SubscriptionsService;
  let userService: {
    isOrgMember: jest.Mock;
    addOrgUser: jest.Mock;
    getUserPermissions: jest.Mock;
    syncUserPermissions: jest.Mock;
  };
  let mailService: { sendEmail: jest.Mock };
  let profileService: { getUserVerifications: jest.Mock };
  let now: number;

  beforeAll(async () => {
    postgres = new PostgresService({
      url:
        process.env.DATABASE_TEST_URL ??
        "postgresql://jobstash:jobstash@127.0.0.1:5434/jobstash_test",
      maxConnections: 5,
      statementTimeoutMs: 30_000,
      applicationName: "middleware-subscription-integration-test",
    });
    await postgres.onModuleInit();
    graph = new GraphRepository(postgres);
    repository = new SubscriptionRepository(postgres, graph);
    userService = {
      isOrgMember: jest.fn(),
      addOrgUser: jest.fn(),
      getUserPermissions: jest.fn(),
      syncUserPermissions: jest.fn(),
    };
    mailService = { sendEmail: jest.fn() };
    profileService = { getUserVerifications: jest.fn() };
    service = new SubscriptionsService(
      repository,
      userService as unknown as UserService,
      mailService as unknown as MailService,
      {
        getOrThrow: jest.fn().mockReturnValue("billing@example.com"),
        get: jest.fn().mockReturnValue("test"),
      } as unknown as ConfigService,
      profileService as unknown as ProfileService,
    );
  });

  afterAll(async () => {
    await postgres.onModuleDestroy();
  });

  beforeEach(async () => {
    await postgres.query("TRUNCATE TABLE graph_nodes RESTART IDENTITY CASCADE");
    userService.isOrgMember.mockReset().mockResolvedValue(true);
    userService.addOrgUser.mockReset().mockResolvedValue({
      success: true,
      message: "owner added",
    });
    userService.getUserPermissions
      .mockReset()
      .mockResolvedValue([{ name: "ORG_MEMBER" }, { name: "unrelated" }]);
    userService.syncUserPermissions.mockReset().mockResolvedValue(undefined);
    mailService.sendEmail.mockReset().mockResolvedValue(undefined);
    profileService.getUserVerifications.mockReset().mockResolvedValue({
      success: true,
      message: "ok",
      data: [
        {
          id: "subscription-org",
          credential: "email",
          account: "owner@example.com",
          isOwner: true,
        },
      ],
    });
    now = Date.now();
    await seedMembership();
  });

  it("creates a scoped pending payment without duplicates", async () => {
    await expect(
      repository.createPendingPayment({
        wallet: "0xSubscriber",
        orgId: "subscription-org",
        amount: 2500,
        action: "new-subscription",
        reference: "invoice-pending",
        link: "https://pay.example/one",
      }),
    ).resolves.toBe(true);
    await repository.createPendingPayment({
      wallet: "0xSubscriber",
      orgId: "subscription-org",
      amount: 2500,
      action: "new-subscription",
      reference: "invoice-pending",
      link: "https://pay.example/one",
    });
    await expect(
      repository.getPendingPayment("0xSubscriber", "subscription-org"),
    ).resolves.toMatchObject({
      properties: expect.objectContaining({
        reference: "invoice-pending",
        amount: 2500,
      }),
    });
    const [count] = await postgres.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM graph_nodes WHERE label = 'PendingPayment'",
    );
    expect(count.count).toBe("1");
  });

  it("creates and hydrates a paid subscription atomically", async () => {
    const pending = await createPendingPayment();
    await expect(
      repository.createSubscription({
        wallet: "0xSubscriber",
        orgId: "subscription-org",
        externalId: "sub_external",
        duration: "monthly",
        createdTimestamp: now,
        expiryTimestamp: addMonths(now, 1).getTime(),
        services: services("growth", "lite", 2),
        quota: quota(),
        payment: payment("new-subscription", "invoice-one"),
        pendingPaymentNodeId: pending.nodeId,
      }),
    ).resolves.toBe(true);

    const raw = await repository.getSubscriptionByOrgId("subscription-org");
    expect(
      new SubscriptionEntity(raw as unknown as Subscription).getProperties(),
    ).toMatchObject({
      id: expect.any(String),
      externalId: "sub_external",
      status: "active",
      tier: "growth",
      veri: "lite",
      stashPool: true,
      atsIntegration: false,
      jobPromotions: 5,
      stashAlert: true,
      extraSeats: 2,
      quota: [expect.objectContaining({ veri: 20, jobPromotions: 5 })],
    });
    await expect(
      repository.getSubscriptionByExternalId("sub_external"),
    ).resolves.toMatchObject({ id: expect.any(String), tier: "growth" });
    await expect(
      repository.getPendingPayment("0xSubscriber", "subscription-org"),
    ).resolves.toBeUndefined();
    await expect(
      repository.getOwnerByExternalId("sub_external"),
    ).resolves.toEqual({ orgId: "subscription-org", wallet: "0xSubscriber" });
    await expect(
      repository.getOwnerByOrgId("subscription-org"),
    ).resolves.toEqual({ orgId: "subscription-org", wallet: "0xSubscriber" });
  });

  it("hydrates verified subscription members", async () => {
    await createSubscription();
    const members = (
      await repository.getSubscriptionMembers("subscription-org")
    ).map(
      member => new SubscriptionMember(member as unknown as SubscriptionMember),
    );
    expect(members).toEqual([
      expect.objectContaining({
        wallet: "0xSubscriber",
        role: "owner",
        credential: "email",
        account: "owner@example.com",
      }),
    ]);
  });

  it("records quota usage and returns it in the subscription payload", async () => {
    const subscription = await createSubscription();
    const raw = await repository.getSubscriptionByExternalId("sub_external");
    const quotaId = String((raw?.quota as Record<string, unknown>[])[0]?.id);
    await expect(
      repository.recordQuotaUsage({
        wallet: "0xSubscriber",
        subscriptionId: subscription.id,
        quotaId,
        service: "veri",
        amount: 3,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.getSubscriptionByExternalId("sub_external"),
    ).resolves.toMatchObject({
      quota: [
        expect.objectContaining({
          usage: [expect.objectContaining({ service: "veri", amount: 3 })],
        }),
      ],
    });
  });

  it("renews subscriptions with a new payment and quota", async () => {
    const subscription = await createSubscription();
    const renewedExpiry = addMonths(now, 2).getTime();
    await expect(
      repository.renewSubscription({
        subscriptionId: subscription.id,
        wallet: "0xSubscriber",
        orgId: "subscription-org",
        expiryTimestamp: renewedExpiry,
        payment: payment("subscription-renewal", "invoice-two"),
        quota: { ...quota(), createdTimestamp: now + 1 },
      }),
    ).resolves.toBe(true);
    await expect(
      repository.getSubscriptionByExternalId("sub_external"),
    ).resolves.toMatchObject({
      expiryTimestamp: renewedExpiry,
      quota: [expect.any(Object), expect.any(Object)],
    });
    const payments = (await repository.getPayments("subscription-org")).map(
      raw => new Payment(raw as unknown as Payment),
    );
    expect(payments).toHaveLength(2);
    expect(payments[0].externalRefCode).toBe("invoice-two");
  });

  it("versions changed services and selects the latest values", async () => {
    const subscription = await createSubscription();
    const cycleEnd = addMonths(now, 1).getTime();
    await expect(
      repository.changeSubscription({
        subscriptionId: subscription.id,
        externalId: "sub_external",
        wallet: "0xSubscriber",
        changedTimestamp: now + 100,
        changes: [
          {
            label: "JobstashBundle",
            direction: "upgrade",
            cycleStart: now,
            cycleEnd,
            properties: {
              name: "pro",
              stashPool: true,
              atsIntegration: true,
            },
          },
          {
            label: "JobPromotions",
            direction: "upgrade",
            cycleStart: now,
            cycleEnd,
            properties: { value: 10 },
          },
          {
            label: "ExtraSeats",
            direction: "downgrade",
            cycleStart: now,
            cycleEnd,
            properties: { value: 1 },
          },
        ],
        payment: payment("subscription-change", "invoice-change"),
        quota: quota(),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.getSubscriptionByExternalId("sub_external"),
    ).resolves.toMatchObject({
      tier: "pro",
      atsIntegration: true,
      jobPromotions: 10,
      extraSeats: 1,
    });
  });

  it("updates PAYG and cancellation state", async () => {
    await createSubscription();
    await expect(repository.setPaygState("sub_external", true)).resolves.toBe(
      true,
    );
    await expect(repository.cancelSubscription("sub_external")).resolves.toBe(
      true,
    );
    await expect(
      repository.getSubscriptionByExternalId("sub_external"),
    ).resolves.toMatchObject({ veriPayg: true, status: "inactive" });
  });

  it("returns renewal jobs and resets owned subscription state", async () => {
    await createSubscription();
    await expect(repository.getRenewalSubscriptions()).resolves.toEqual([
      expect.objectContaining({
        ownerWallet: "0xSubscriber",
        orgId: "subscription-org",
        subscription: expect.objectContaining({ tier: "growth" }),
      }),
    ]);
    await expect(
      repository.resetSubscriptionState("subscription-org"),
    ).resolves.toEqual(["0xSubscriber"]);
    await expect(
      repository.getSubscriptionByOrgId("subscription-org"),
    ).resolves.toBeUndefined();
    const [remaining] = await postgres.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM graph_nodes
        WHERE label = ANY(
          ARRAY[
            'OrgSubscription', 'Quota', 'Payment', 'JobstashBundle',
            'VeriAddon', 'JobPromotions', 'StashAlert', 'ExtraSeats',
            'OrgUserSeat'
          ]::text[]
        )
      `,
    );
    expect(remaining.count).toBe("0");
  });

  it("has the subscription lookup and ordering indexes", async () => {
    const names = [
      "graph_nodes_subscription_external_id_idx",
      "graph_nodes_pending_payment_link_idx",
      "graph_nodes_subscription_status_expiry_idx",
      "graph_nodes_subscription_service_expiry_idx",
      "graph_nodes_payment_created_idx",
    ];
    const rows = await postgres.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])",
      [names],
    );
    expect(rows.map(row => row.indexname).sort()).toEqual(names.sort());
  });

  it("creates paid subscriptions through SubscriptionsService", async () => {
    await expect(
      service.createPendingPayment(
        "0xSubscriber",
        "subscription-org",
        2500,
        "new-subscription",
        "invoice-service",
        "https://pay.example/service",
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.createNewSubscription(paidDto(), "sub_service"),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.getSubscriptionInfoByOrgId("subscription-org"),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        externalId: "sub_service",
        tier: "growth",
        veri: "lite",
      }),
    });
    await expect(
      service.getOrgSubscriptionMembers("subscription-org"),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ wallet: "0xSubscriber" })],
    });
    expect(userService.addOrgUser).toHaveBeenCalledTimes(1);
    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("creates a starter subscription without a pending payment", async () => {
    await expect(
      service.createNewSubscription({
        wallet: "0xSubscriber",
        orgId: "subscription-org",
        jobstash: "starter",
        veri: "",
        stashAlert: false,
        extraSeats: 0,
        amount: 0,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.getSubscriptionInfoByOrgId("subscription-org"),
    ).resolves.toMatchObject({
      data: expect.objectContaining({
        externalId: null,
        tier: "starter",
        veri: null,
        stashAlert: false,
        extraSeats: 0,
      }),
    });
  });

  it("records service usage and runs renewal/change/cancellation through PostgreSQL", async () => {
    await createPaidViaService();
    const stripeService = {
      recordMeteredServiceUsage: jest.fn(),
    } as unknown as StripeService;
    await expect(
      service.recordMeteredServiceUsage(
        "subscription-org",
        "0xSubscriber",
        2,
        "veri",
        stripeService,
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.renewSubscription("sub_service", 2500, "invoice-renewal"),
    ).resolves.toMatchObject({ success: true });

    const cycleStart = Math.floor(now / 1000);
    const stripeSubscription = {
      id: "sub_service",
      items: {
        data: [
          {
            price: { lookup_key: "jobstash_pro" },
            current_period_start: cycleStart,
            current_period_end: cycleStart + 30 * 24 * 60 * 60,
          },
          {
            price: { lookup_key: "veri_plus" },
            current_period_start: cycleStart,
            current_period_end: cycleStart + 30 * 24 * 60 * 60,
          },
        ],
      },
    } as unknown as Stripe.Subscription;
    await expect(
      service.changeSubscription(
        {
          jobstash: "pro",
          veri: "plus",
          stashAlert: false,
          extraSeats: 1,
          amount: 3000,
        },
        "invoice-change",
        stripeSubscription,
      ),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.getSubscriptionInfoByExternalId("sub_service"),
    ).resolves.toMatchObject({
      data: expect.objectContaining({
        tier: "pro",
        veri: "plus",
        extraSeats: 1,
      }),
    });
    await expect(
      service.cancelSubscription("sub_service"),
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.getOrgPayments("subscription-org"),
    ).resolves.toMatchObject({ data: expect.any(Array) });
  });

  it("resets subscription state and synchronizes former member permissions", async () => {
    await createPaidViaService();
    await expect(
      service.resetSubscriptionState("subscription-org"),
    ).resolves.toMatchObject({ success: true });
    expect(userService.getUserPermissions).toHaveBeenCalledWith("0xSubscriber");
    expect(userService.syncUserPermissions).toHaveBeenCalledWith(
      "0xSubscriber",
      ["unrelated"],
    );
    await expect(
      service.getSubscriptionInfoByOrgId("subscription-org"),
    ).resolves.toMatchObject({ success: false });
  });

  async function seedMembership(): Promise<void> {
    const account = await graph.createNode("User", {
      id: "subscription-user-id",
      wallet: "0xSubscriber",
      name: "Subscription Owner",
    });
    const organization = await graph.createNode("Organization", {
      id: "subscription-organization-id",
      orgId: "subscription-org",
      name: "Subscription Org",
      normalizedName: "subscription-org",
    });
    const seat = await graph.createNode("OrgUserSeat", {
      id: "subscription-seat-id",
      seatType: "owner",
      createdTimestamp: now,
    });
    await graph.upsertRelationship({
      sourceNodeId: organization.nodeId,
      targetNodeId: seat.nodeId,
      type: "HAS_USER_SEAT",
    });
    await graph.upsertRelationship({
      sourceNodeId: account.nodeId,
      targetNodeId: seat.nodeId,
      type: "OCCUPIES",
    });
    await graph.upsertRelationship({
      sourceNodeId: account.nodeId,
      targetNodeId: organization.nodeId,
      type: "VERIFIED_FOR_ORG",
      properties: {
        credential: "email",
        account: "owner@example.com",
      },
    });
  }

  async function createPendingPayment() {
    await repository.createPendingPayment({
      wallet: "0xSubscriber",
      orgId: "subscription-org",
      amount: 2500,
      action: "new-subscription",
      reference: "invoice-pending",
      link: "https://pay.example/one",
    });
    return repository.getPendingPayment("0xSubscriber", "subscription-org");
  }

  async function createPaidViaService(): Promise<void> {
    await service.createPendingPayment(
      "0xSubscriber",
      "subscription-org",
      2500,
      "new-subscription",
      "invoice-service",
      "https://pay.example/service",
    );
    await service.createNewSubscription(paidDto(), "sub_service");
  }

  function paidDto() {
    return {
      wallet: "0xSubscriber",
      orgId: "subscription-org",
      jobstash: "growth",
      veri: "lite",
      stashAlert: true,
      extraSeats: 2,
      amount: 2500,
    };
  }

  async function createSubscription(): Promise<Subscription> {
    const pending = await createPendingPayment();
    await repository.createSubscription({
      wallet: "0xSubscriber",
      orgId: "subscription-org",
      externalId: "sub_external",
      duration: "monthly",
      createdTimestamp: now,
      expiryTimestamp: addMonths(now, 1).getTime(),
      services: services("growth", "lite", 2),
      quota: quota(),
      payment: payment("new-subscription", "invoice-one"),
      pendingPaymentNodeId: pending.nodeId,
    });
    const raw = await repository.getSubscriptionByExternalId("sub_external");
    return new SubscriptionEntity(
      raw as unknown as Subscription,
    ).getProperties();
  }

  function services(
    tier: string,
    veri: string,
    extraSeats: number,
  ): SubscriptionServiceWrite[] {
    const expiryTimestamp = addMonths(now, 1).getTime();
    const common = { createdTimestamp: now, expiryTimestamp };
    return [
      {
        label: "JobstashBundle",
        properties: {
          name: tier,
          stashPool: true,
          atsIntegration: false,
          ...common,
        },
      },
      { label: "VeriAddon", properties: { name: veri, ...common } },
      { label: "JobPromotions", properties: { value: 5, ...common } },
      { label: "StashAlert", properties: { active: true, ...common } },
      { label: "ExtraSeats", properties: { value: extraSeats, ...common } },
    ];
  }

  function quota(): SubscriptionQuotaWrite {
    return {
      veri: 20,
      jobPromotions: 5,
      createdTimestamp: now,
      expiryTimestamp: addMonths(now, 2).getTime(),
    };
  }

  function payment(action: string, externalRefCode: string) {
    return {
      amount: 2500,
      action,
      internalRefCode: `internal-${externalRefCode}`,
      externalRefCode,
      createdTimestamp: now,
      expiryTimestamp: addMonths(now, 1).getTime(),
    };
  }
});
