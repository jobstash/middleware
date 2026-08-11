import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { of, throwError } from "rxjs";
import { PeopleIntelligenceService } from "./people-intelligence.service";

describe("PeopleIntelligenceService", () => {
  it("forwards public activity-map parameters to scorer", async () => {
    const response = {
      available: true,
      asOf: "2026-08-01T00:00:00.000Z",
      metric: "commits" as const,
      page: 2,
      limit: 250,
      total: 7000,
      rows: [],
    };
    const get = jest.fn().mockReturnValue(of({ data: response }));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.activityMap({ metric: "commits", page: 2, limit: 250 }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith("/scorer/people/activity-map", {
      params: { metric: "commits", page: 2, limit: 250 },
    });
  });

  it("returns an unavailable contract while a scorer model is absent", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.overview({ bucket: "quarter" })).resolves.toEqual({
      available: false,
      asOf: null,
      bucket: "quarter",
      points: [],
    });
  });

  it("returns the movement-flow contract while scorer is unavailable", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.atlas({ organizationKey: "github:example", windowMonths: 36 }),
    ).resolves.toEqual({
      available: false,
      asOf: null,
      fromPeriod: null,
      toPeriod: null,
      focusOrganizationKey: "github:example",
      totalMovements: 0,
      visibleMovements: 0,
      organizations: [],
      flows: [],
    });
    expect(get).toHaveBeenCalledWith("/scorer/people/atlas", {
      params: { organizationKey: "github:example", windowMonths: 36 },
    });
  });

  it("preserves requested activity-map metadata in an unavailable response", async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => new AxiosError("unavailable")));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(
      service.activityMap({ metric: "commits", page: "2", limit: "250" }),
    ).resolves.toMatchObject({
      available: false,
      metric: "commits",
      page: 2,
      limit: 250,
    });
  });

  it("maps a missing scorer profile to a public 404 result", async () => {
    const error = new AxiosError("not found", undefined, undefined, undefined, {
      status: 404,
    } as never);
    const get = jest.fn().mockReturnValue(throwError(() => error));
    const service = new PeopleIntelligenceService({
      get,
    } as unknown as HttpService);

    await expect(service.profile("missing-user")).resolves.toBeUndefined();
  });
});
