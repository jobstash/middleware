import { Auth0Service } from "./auth0.service";
import axios from "axios";
jest.mock("axios");
it("refreshes the middleware ETL service token before its actual expiry", async () => {
  const cache = { get: jest.fn(async () => null), set: jest.fn() };
  (axios.post as jest.Mock).mockResolvedValue({
    data: { access_token: "fixture-token", expires_in: 300 },
  });
  const service = new Auth0Service(
    { get: () => "fixture" } as never,
    cache as never,
  );
  expect(await service.getETLToken()).toBe("fixture-token");
  expect(cache.set).toHaveBeenCalledWith("etl-token", "fixture-token", 240000);
});
it("does not cache grants with an absent or imminent expiry", async () => {
  for (const expiresIn of [undefined, 30]) {
    const cache = { get: jest.fn(async () => null), set: jest.fn() };
    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: "fixture-token", expires_in: expiresIn },
    });
    const service = new Auth0Service(
      { get: () => "fixture" } as never,
      cache as never,
    );
    expect(await service.getETLToken()).toBe("fixture-token");
    expect(cache.set).not.toHaveBeenCalled();
  }
});
