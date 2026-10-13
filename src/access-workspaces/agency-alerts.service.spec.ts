import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailService } from "src/mail/mail.service";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { AgencyAlertsRepository } from "./agency-alerts.repository";
import { AgencyAlertsService } from "./agency-alerts.service";

const followId = "c91c41b7-8c1e-4015-8606-2d9f047017c1";

describe("AgencyAlertsService", () => {
  const repository = {
    recipient: jest.fn(),
    follows: jest.fn(),
    search: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
    claim: jest.fn(),
    prepare: jest.fn(),
    finish: jest.fn(),
  };
  const access = { authorize: jest.fn() };
  const mail = { sendEmail: jest.fn() };
  let service: AgencyAlertsService;
  let previousOwner: string | undefined;
  const claim = {
    id: "delivery",
    followId,
    workspaceId: followId,
    userId: "member",
    recipientEmail: "member@example.com",
    organizationName: "A <Company>",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    previousOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    access.authorize.mockResolvedValue({
      alertsEnabled: true,
      entitled: false,
    });
    repository.recipient.mockResolvedValue({ email: "member@example.com" });
    repository.follows.mockResolvedValue([]);
    repository.follow.mockResolvedValue(true);
    repository.claim.mockResolvedValue(null);
    repository.finish.mockResolvedValue(undefined);
    service = new AgencyAlertsService(
      repository as unknown as AgencyAlertsRepository,
      access as unknown as AccessWorkspacesRepository,
      mail as unknown as MailService,
      new ConfigService({
        ENVIRONMENT: "production",
        JWT_SECRET: "test-secret",
        EMAIL: "alerts@example.com",
        FE_DOMAIN: "https://jobstash.xyz",
        MW_DOMAIN: "https://middleware.example.com",
        ORG_ADMIN_DOMAIN: "https://admin.jobstash.xyz",
      }),
    );
  });
  afterEach(() => {
    if (previousOwner === undefined)
      delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
    else process.env.MIDDLEWARE_SCHEDULE_OWNER = previousOwner;
  });

  it("rejects nonmembers before reading personal recipient state", async () => {
    access.authorize.mockResolvedValue(null);
    await expect(service.state("workspace", "outsider")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.recipient).not.toHaveBeenCalled();
  });

  it("requires manual partner approval and a verified account email, not paid access", async () => {
    access.authorize.mockResolvedValueOnce({
      alertsEnabled: false,
      entitled: true,
    });
    await expect(
      service.follow("workspace", "outsider", "org"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.follow).not.toHaveBeenCalled();
    repository.recipient.mockResolvedValue(null);
    await expect(
      service.follow("workspace", "member", "org"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.follow).not.toHaveBeenCalled();
  });

  it("retains stop controls and truthful paused state for revoked partners", async () => {
    access.authorize.mockResolvedValue({ alertsEnabled: false });
    repository.follows.mockResolvedValue([
      { organizationId: "org", deliveryPaused: false },
    ]);
    await expect(service.state("workspace", "member")).resolves.toMatchObject({
      enabled: false,
      followCount: 1,
      follows: [{ deliveryPaused: true }],
    });
    await service.unfollow("workspace", "member", "org");
    expect(repository.unfollow).toHaveBeenCalledWith(
      "workspace",
      "member",
      "org",
    );
  });

  it("uses a confirmation GET and a persistent signed workspace-recipient unsubscribe", async () => {
    const token = service.unsubscribeToken(followId, "member");
    expect(service.unsubscribePage(token)).toContain('method="post"');
    expect(repository.unfollow).not.toHaveBeenCalled();
    await service.unsubscribe(token);
    expect(repository.unfollow).toHaveBeenCalledWith(followId, "member");
    await expect(
      service.unsubscribe(`${token.slice(0, -1)}!`),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.unsubscribe(
        token.replace(followId, "d91c41b7-8c1e-4015-8606-2d9f047017c1"),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sends one organization batch to only the verified personal recipient", async () => {
    repository.claim.mockResolvedValueOnce(claim);
    repository.prepare.mockResolvedValue([
      { shortUUID: "one", title: "<Engineer>", location: "Remote" },
      { shortUUID: "two", title: "Designer", location: null },
    ]);
    await service.deliver();
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        headers: expect.objectContaining({
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }),
      }),
    );
    const message = mail.sendEmail.mock.calls[0][0] as {
      html: string;
      text: string;
    };
    expect(message.html).toContain("&lt;Engineer&gt;");
    expect(message.html).not.toContain("<Engineer>");
    expect(message.text).toContain("2 new roles");
    expect(repository.finish).toHaveBeenCalledWith("delivery", "accepted");
  });

  it("skips a claimed delivery when unsubscribe, entitlement or recipient recheck fails", async () => {
    repository.claim.mockResolvedValueOnce(claim);
    repository.prepare.mockResolvedValue(null);
    await service.deliver();
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(repository.finish).toHaveBeenCalledWith("delivery", "skipped");
  });

  it("never reopens ambiguous provider attempts or accepted receipts", async () => {
    repository.claim.mockResolvedValueOnce(claim);
    repository.prepare.mockResolvedValue([
      { shortUUID: "one", title: "Engineer", location: null },
    ]);
    mail.sendEmail.mockRejectedValueOnce(
      new Error("timeout after possible acceptance"),
    );
    await service.deliver();
    expect(repository.finish).toHaveBeenCalledWith(
      "delivery",
      "failed_unknown",
    );
    repository.claim.mockResolvedValueOnce({ ...claim, id: "second" });
    repository.finish.mockRejectedValueOnce(
      new Error("receipt database unavailable"),
    );
    await service.deliver();
    expect(repository.finish).not.toHaveBeenCalledWith(
      "second",
      "failed_unknown",
    );
    expect(mail.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("runs only on the schedule owner and bounds each tick", async () => {
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "0";
    await service.deliver();
    expect(repository.claim).not.toHaveBeenCalled();
    process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
    repository.claim.mockResolvedValue(claim);
    repository.prepare.mockResolvedValue(null);
    await service.deliver();
    expect(repository.claim).toHaveBeenCalledTimes(20);
  });

  it("does not overlap local cron runs", async () => {
    repository.claim.mockImplementationOnce(async () => {
      await service.deliver();
      return null;
    });
    await service.deliver();
    expect(repository.claim).toHaveBeenCalledTimes(1);
  });
});
