import { TelemetryService } from "./telemetry.service";
import { TelemetryRepository } from "src/postgres/telemetry.repository";

describe("dashboard calendar month", () => {
  afterEach(() => jest.useRealTimers());
  it("requests the UTC month boundary instead of a rolling thirty-day window", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-06T17:00:00Z"));
    const getDashboardJobStats = jest.fn().mockResolvedValue({
      jobCounts: { active: 0, inactive: 0, expert: 0, promoted: 0 },
      applicationsThisMonth: 0,
      totalApplications: 0,
      totalJobCount: 0,
    });
    const service = new TelemetryService({
      getDashboardJobStats,
    } as unknown as TelemetryRepository);
    await service.getDashboardJobStats({ type: "ecosystem", id: "universe" });
    expect(getDashboardJobStats).toHaveBeenCalledWith({
      type: "ecosystem",
      id: "universe",
      applicationEpochStart: Date.parse("2026-09-01T00:00:00Z"),
    });
  });
});
