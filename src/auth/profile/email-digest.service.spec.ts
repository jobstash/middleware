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
    jest.clearAllMocks();
    repository.getState.mockResolvedValue({
      email: "person@example.com",
      status: "pending",
      requestedAt: "2026-08-26T10:00:00Z",
      confirmedAt: null,
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
      );
      expect(repository.markSent).toHaveBeenCalledWith("1");
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
