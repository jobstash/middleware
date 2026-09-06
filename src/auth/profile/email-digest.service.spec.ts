import { ConfigService } from "@nestjs/config";
import { MailService } from "src/mail/mail.service";
import { EmailDigestRepository } from "src/postgres/email-digest.repository";
import { EmailDigestService } from "./email-digest.service";
import { ProfileService } from "./profile.service";

describe("EmailDigestService", () => {
  const repository = {
    requestConfirmation: jest.fn(),
    cancelPending: jest.fn(),
    getState: jest.fn(),
    confirm: jest.fn(),
    unsubscribeWallet: jest.fn(),
    unsubscribeToken: jest.fn(),
    getRecipients: jest.fn(),
    claimWeek: jest.fn(),
    setUnsubscribeToken: jest.fn(),
    markSent: jest.fn(),
    releaseWeek: jest.fn(),
  };
  const profileService = { getRecommendedJobs: jest.fn() };
  const mailService = { sendEmail: jest.fn() };
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === "EMAIL" ? "jobs@jobstash.xyz" : "https://jobstash.xyz",
    ),
    get: jest.fn(() => "production"),
  };

  const service = new EmailDigestService(
    repository as unknown as EmailDigestRepository,
    profileService as unknown as ProfileService,
    mailService as unknown as MailService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue("production");
    repository.setUnsubscribeToken.mockResolvedValue(true);
    repository.getState.mockResolvedValue({
      email: "person@example.com",
      status: "pending",
      requestedAt: "2026-08-26T10:00:00Z",
      confirmedAt: null,
    });
  });

  describe("weekly selection and failure isolation", () => {
    let previousOwner: string | undefined;
    beforeEach(() => {
      previousOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
      process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
      repository.getRecipients.mockResolvedValue([
        { userNodeId: "1", wallet: "wallet", email: "person@example.com" },
      ]);
      repository.claimWeek.mockResolvedValue(true);
      repository.releaseWeek.mockResolvedValue(undefined);
      profileService.getRecommendedJobs.mockResolvedValue({
        jobs: Array.from({ length: 6 }, (_, i) => ({
          job: {
            shortUUID: `job-${i}`,
            title: "Engineer",
            organization: { name: "Acme" },
          },
          reason: "Skills",
        })),
      });
    });
    afterEach(() => {
      if (previousOwner === undefined)
        delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
      else process.env.MIDDLEWARE_SCHEDULE_OWNER = previousOwner;
    });
    it("sends at most three jobs and keeps one-click unsubscribe headers", async () => {
      await service.sendWeeklyDigests();
      const mail = mailService.sendEmail.mock.calls[0][0];
      expect(mail.html).toContain("job-2");
      expect(mail.html).not.toContain("job-3");
      expect(mail.headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
    });
    it("does not send when the subscription was cancelled while ranking", async () => {
      repository.setUnsubscribeToken.mockResolvedValue(false);
      await service.sendWeeklyDigests();
      expect(mailService.sendEmail).not.toHaveBeenCalled();
    });
    it("does not send an empty digest", async () => {
      profileService.getRecommendedJobs.mockResolvedValue({ jobs: [] });
      await service.sendWeeklyDigests();
      expect(mailService.sendEmail).not.toHaveBeenCalled();
      expect(repository.releaseWeek).toHaveBeenCalledWith("1");
    });
    it("does not release the claim after email delivery if receipt storage fails", async () => {
      repository.markSent.mockRejectedValue(new Error("storage unavailable"));
      await service.sendWeeklyDigests();
      expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(repository.releaseWeek).not.toHaveBeenCalled();
    });
    it("isolates a failed recipient without releasing a claim it did not acquire", async () => {
      repository.getRecipients.mockResolvedValue([
        { userNodeId: "1", wallet: "one", email: "one@example.com" },
        { userNodeId: "2", wallet: "two", email: "two@example.com" },
      ]);
      repository.claimWeek
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce(true);
      await service.sendWeeklyDigests();
      expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(repository.releaseWeek).not.toHaveBeenCalledWith("1");
    });
    it("skips recipients whose week is already claimed", async () => {
      repository.claimWeek.mockResolvedValue(false);
      await service.sendWeeklyDigests();
      expect(mailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  it("sends a confirmation email but does not subscribe immediately", async () => {
    repository.requestConfirmation.mockResolvedValue({
      email: "person@example.com",
    });
    mailService.sendEmail.mockResolvedValue([{}, {}]);

    await expect(service.requestConfirmation("wallet")).resolves.toMatchObject({
      status: "pending",
    });

    expect(repository.requestConfirmation).toHaveBeenCalledWith(
      "wallet",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "person@example.com",
        subject: "Confirm your weekly JobStash email",
      }),
    );
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it("hashes confirmation links before database lookup", async () => {
    repository.confirm.mockResolvedValue(true);
    await expect(service.confirm("x".repeat(40))).resolves.toBe(true);
    expect(repository.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(repository.confirm).not.toHaveBeenCalledWith("x".repeat(40));
  });

  it("sends only claimed subscribers and records the successful week", async () => {
    const previousOwner = process.env.MIDDLEWARE_SCHEDULE_OWNER;
    try {
      process.env.MIDDLEWARE_SCHEDULE_OWNER = "1";
      repository.getRecipients.mockResolvedValue([
        {
          userNodeId: "1",
          wallet: "wallet",
          email: "person@example.com",
        },
      ]);
      repository.claimWeek.mockResolvedValue(true);
      profileService.getRecommendedJobs.mockResolvedValue({
        rankingVersion: "content-v2",
        total: 1,
        jobs: [
          {
            reason: "Matches your search",
            job: {
              shortUUID: "job-one",
              title: "Protocol Engineer",
              organization: { name: "Example" },
              project: null,
            },
          },
        ],
      });
      mailService.sendEmail.mockResolvedValue([{}, {}]);

      await service.sendWeeklyDigests();

      expect(repository.claimWeek).toHaveBeenCalledWith("1");
      expect(repository.setUnsubscribeToken).toHaveBeenCalledWith(
        "1",
        expect.stringMatching(/^[a-f0-9]{64}$/),
        "person@example.com",
      );
      expect(profileService.getRecommendedJobs).toHaveBeenCalledWith(
        "wallet",
        3,
        "weekly_email",
      );
      expect(repository.markSent).toHaveBeenCalledWith(
        "1",
        ["job-one"],
        "content-v2",
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
      expect(repository.releaseWeek).not.toHaveBeenCalled();
    } finally {
      if (previousOwner === undefined) {
        delete process.env.MIDDLEWARE_SCHEDULE_OWNER;
      } else {
        process.env.MIDDLEWARE_SCHEDULE_OWNER = previousOwner;
      }
    }
  });
});
