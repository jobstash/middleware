import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { Request, Response } from "express";
import { GraphRepository } from "src/postgres/graph.repository";
import { SessionObject } from "src/shared/interfaces";
import { AuthService } from "./auth.service";

const secret = "authentication-regression-test-secret";
const address = "0x0000000000000000000000000000000000000001";
const now = 1_800_000_000;
const anonymous = { address: null, cryptoNative: false, permissions: [] };
const jwt = new JwtService();

const sign = (
  claims: Record<string, unknown> = {},
  options: JwtSignOptions = {},
): string =>
  jwt.sign(
    { address, iat: now, exp: now + 3600, ...claims },
    { secret, algorithm: "HS256", ...options },
  );

describe("AuthService verified sessions", () => {
  let service: AuthService;
  const graph = {
    findNode: jest.fn(),
    findRelatedNodes: jest.fn(),
  };
  const session = (authorization?: string): Promise<SessionObject | null> =>
    service.getSession(
      { headers: { authorization } } as Request,
      {} as Response,
    );

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(now * 1000);
    graph.findNode.mockReset().mockResolvedValue({
      properties: { cryptoNative: true },
    });
    graph.findRelatedNodes
      .mockReset()
      .mockResolvedValue([{ properties: { name: "USER" } }]);
    service = new AuthService(
      graph as unknown as GraphRepository,
      new ConfigService({ JWT_SECRET: secret, JWT_EXPIRES_IN: "1h" }),
      jwt,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("issues expiring HS256 tokens even with an unconfigured JwtService", () => {
    const claim = { address, cryptoNative: false, permissions: ["USER"] };
    const token = service.createToken(claim);
    expect(jwt.verify(token, { secret, algorithms: ["HS256"] })).toEqual({
      ...claim,
      iat: now,
      exp: now + 3600,
    });
    expect(claim).not.toHaveProperty("exp");
    expect(service.validateToken(token)).toBe(true);
  });

  it.each<[string, () => string | undefined]>([
    ["missing header", (): undefined => undefined],
    ["empty bearer", (): string => "Bearer "],
    ["bare token", (): string => sign()],
    ["wrong scheme", (): string => `Basic ${sign()}`],
    ["embedded bearer", (): string => `prefix Bearer ${sign()}`],
    ["multiple tokens", (): string => `Bearer ${sign()} ${sign()}`],
    ["malformed token", (): string => "Bearer not-a-jwt"],
    [
      "wrong signature",
      (): string => `Bearer ${sign({}, { secret: "wrong-secret" })}`,
    ],
    [
      "unsigned token",
      (): string => `Bearer ${sign({}, { algorithm: "none" })}`,
    ],
    [
      "wrong algorithm",
      (): string => `Bearer ${sign({}, { algorithm: "HS384" })}`,
    ],
    ["expired token", (): string => `Bearer ${sign({ exp: now })}`],
    ["not-yet-valid token", (): string => `Bearer ${sign({ nbf: now + 60 })}`],
    ["future issuance", (): string => `Bearer ${sign({ iat: now + 60 })}`],
    [
      "missing issuance",
      (): string => `Bearer ${sign({}, { noTimestamp: true })}`,
    ],
    [
      "missing identity",
      (): string => `Bearer ${sign({ address: undefined })}`,
    ],
    ["empty identity", (): string => `Bearer ${sign({ address: " " })}`],
    [
      "object identity",
      (): string => `Bearer ${sign({ address: { wallet: address } })}`,
    ],
    ["numeric identity", (): string => `Bearer ${sign({ address: 1 })}`],
    ["over-age token", (): string => `Bearer ${sign({ iat: now - 3600 })}`],
    [
      "old legacy token without expiry",
      (): string =>
        `Bearer ${jwt.sign({ address, iat: now - 3600 }, { secret })}`,
    ],
  ])("rejects %s before looking up an account", async (_name, header) => {
    expect(await session(header())).toEqual(anonymous);
    expect(graph.findNode).not.toHaveBeenCalled();
    expect(graph.findRelatedNodes).not.toHaveBeenCalled();
  });

  it("rejects a tampered identity", async () => {
    const [header, payload, signature] = sign().split(".");
    const modified = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        address: "someone-else",
      }),
    ).toString("base64url");
    expect(await session(`Bearer ${header}.${modified}.${signature}`)).toEqual(
      anonymous,
    );
    expect(graph.findNode).not.toHaveBeenCalled();
  });

  it("uses current database permissions, not claims in the token", async () => {
    expect(
      await session(
        `bEaReR ${sign({ permissions: ["SUPER_ADMIN"], cryptoNative: false })}`,
      ),
    ).toEqual({ address, cryptoNative: true, permissions: ["USER"] });
  });

  it("does not retain revoked permissions from a valid token", async () => {
    graph.findRelatedNodes.mockResolvedValue([]);
    expect(
      await session(`Bearer ${sign({ permissions: ["SUPER_ADMIN"] })}`),
    ).toEqual({ address, cryptoNative: true, permissions: [] });
  });

  it("rejects an account that no longer exists", async () => {
    graph.findNode.mockResolvedValue(null);
    expect(await session(`Bearer ${sign()}`)).toEqual(anonymous);
  });

  it("bounds correctly signed legacy tokens by their original issuance time", async () => {
    const token = jwt.sign({ address, iat: now - 3599 }, { secret });
    expect(service.validateToken(token)).toBe(true);
    expect(await session(`Bearer ${token}`)).toEqual({
      address,
      cryptoNative: true,
      permissions: ["USER"],
    });
    jest.spyOn(Date, "now").mockReturnValue((now + 1) * 1000);
    expect(service.validateToken(token)).toBe(false);
  });

  it("fails closed when the account lookup fails", async () => {
    graph.findNode.mockRejectedValue(new Error("database unavailable"));
    expect(await session(`Bearer ${sign()}`)).toBeNull();
  });
});
