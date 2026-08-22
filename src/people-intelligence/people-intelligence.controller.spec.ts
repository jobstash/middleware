import { GoneException } from "@nestjs/common";
import { Response } from "express";
import { PeopleIntelligenceController } from "./people-intelligence.controller";
import { PeopleIntelligenceService } from "./people-intelligence.service";

describe("PeopleIntelligenceController privacy tombstones", () => {
  const response = (): Response =>
    ({ setHeader: jest.fn() }) as unknown as Response;

  it("returns identity-independent 410 responses with no-store/noindex", () => {
    const controller = new PeopleIntelligenceController(
      {} as PeopleIntelligenceService,
    );
    const first = response();
    const second = response();

    let firstError: GoneException | undefined;
    let secondError: GoneException | undefined;
    try {
      controller.profile("alice", first);
    } catch (error) {
      firstError = error as GoneException;
    }
    try {
      controller.profile("bob", second);
    } catch (error) {
      secondError = error as GoneException;
    }

    expect(firstError?.getStatus()).toBe(410);
    expect(firstError?.getResponse()).toEqual(secondError?.getResponse());
    expect(first.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-cache, private, no-store, must-revalidate",
    );
    expect(first.setHeader).toHaveBeenCalledWith(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive",
    );
    expect(first.setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(first.setHeader).toHaveBeenCalledWith("Expires", "0");
  });
});
