import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "src/career-agent/career.repository";
import { McpOAuthService } from "./mcp-oauth.service";
const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)(
  "MCP account authorization (isolated PostgreSQL)",
  () => {
    let db: PostgresService, oauth: McpOAuthService, client: any;
    const settings = {
      NODE_ENV: "test",
      MCP_RESOURCE_URL: "http://127.0.0.1:3333/mcp",
      MCP_ISSUER_URL: "http://127.0.0.1:8085/mcp",
      MCP_FRONTEND_URL: "http://localhost:3000",
    };
    const redirect = "https://client.example/callback";
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        parsed.hostname !== "127.0.0.1" ||
        parsed.pathname !== "/jobstash_mcp_test"
      )
        throw Error("Dedicated local MCP test database required");
      db = new PostgresService({
        url: url!,
        applicationName: "mcp-tests",
        maxConnections: 10,
        statementTimeoutMs: 5000,
      });
      await db.onModuleInit();
      await db.query(
        "CREATE TABLE IF NOT EXISTS graph_nodes(id bigserial PRIMARY KEY,label text,properties jsonb)",
      );
      await db.query(readFileSync("scripts/sql/mcp-access.sql", "utf8"));
      oauth = new McpOAuthService(
        db,
        new CareerRepository(db),
        new ConfigService(settings),
      );
    });
    afterAll(async () => {
      await db?.onModuleDestroy();
    });
    beforeEach(async () => {
      await db.query(
        "TRUNCATE mcp_tokens,mcp_grants,mcp_authorizations,mcp_clients,graph_nodes RESTART IDENTITY CASCADE",
      );
      await db.query(
        `INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`,
      );
      client = await oauth.register({
        client_name: "Test AI",
        redirect_uris: [redirect],
        token_endpoint_auth_method: "none",
      });
    });
    async function request(overrides = {}) {
      const verifier = randomBytes(32).toString("base64url");
      const params = {
        client_id: client.client_id,
        redirect_uri: redirect,
        state: "test-state",
        resource: settings.MCP_RESOURCE_URL,
        scope: "data:read",
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        ...overrides,
      };
      const next = await oauth.authorize(params);
      return { id: new URL(next).searchParams.get("request")!, verifier, next };
    }
    async function approved(overrides = {}) {
      const req = await request(overrides);
      const result = await oauth.consent("alice", req.id, true);
      return {
        grant_type: "authorization_code",
        client_id: client.client_id,
        redirect_uri: redirect,
        resource: settings.MCP_RESOURCE_URL,
        code: new URL(result.redirectUrl).searchParams.get("code"),
        code_verifier: req.verifier,
      };
    }
    it("connects only after explicit consent and binds tokens to the account and resource", async () => {
      const input = await approved();
      const token = await oauth.exchange(input);
      expect(
        await oauth.identity("Bearer " + token.access_token),
      ).toMatchObject({ owner: "1", wallet: "alice", scope: "data:read" });
      expect(await oauth.connections("bob")).toEqual([]);
      const stored = await db.query("SELECT hash FROM mcp_tokens");
      expect(JSON.stringify(stored)).not.toContain(token.access_token);
      expect(JSON.stringify(stored)).not.toContain(token.refresh_token);
      await expect(
        oauth.identity("Bearer regular-jobstash-session"),
      ).rejects.toThrow();
    });
    it("rejects unregistered redirects, another resource and missing proof challenge", async () => {
      for (const overrides of [
        { redirect_uri: "https://evil.example" },
        { resource: "https://another.example/mcp" },
        { code_challenge_method: "plain" },
        { scope: "talent:read" },
        { code_challenge: "" },
      ])
        await expect(request(overrides)).rejects.toThrow();
    });
    it("cancels without issuing a code and cannot approve twice", async () => {
      const req = await request();
      const result = await oauth.consent("alice", req.id, false);
      const next = new URL(result.redirectUrl);
      expect(next.searchParams.get("error")).toBe("access_denied");
      expect(next.searchParams.get("state")).toBe("test-state");
      expect(next.searchParams.get("iss")).toBe(settings.MCP_ISSUER_URL);
      expect(next.searchParams.has("code")).toBe(false);
      await expect(oauth.consent("alice", req.id, true)).rejects.toThrow();
    });
    it("rejects the wrong verifier without consuming the valid code", async () => {
      const input = await approved();
      await expect(
        oauth.exchange({
          ...input,
          code_verifier: randomBytes(32).toString("base64url"),
        }),
      ).rejects.toThrow();
      await expect(oauth.exchange(input)).resolves.toHaveProperty(
        "access_token",
      );
    });
    it("consumes a code only once under concurrent exchanges", async () => {
      const input = await approved();
      const results = await Promise.allSettled([
        oauth.exchange(input),
        oauth.exchange(input),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    });
    it("normalizes requested sets but never adds permissions to an authorization or refresh", async () => {
      const req = await request({ scope: " career:write  account:read career:read account:read " });
      const info = await oauth.consentInfo("alice", req.id);
      expect(info.scopes).toEqual(["account:read", "career:read", "career:write"]);
      const consent = await oauth.consent("alice", req.id, true);
      const exchange = {
        grant_type: "authorization_code", client_id: client.client_id,
        redirect_uri: redirect, resource: settings.MCP_RESOURCE_URL,
        code: new URL(consent.redirectUrl).searchParams.get("code"), code_verifier: req.verifier,
      };
      await expect(oauth.exchange({ ...exchange, scope: "data:read account:read career:read career:write" }))
        .rejects.toMatchObject({ response: { error: "invalid_scope" } });
      const token = await oauth.exchange(exchange);
      expect(token.scope).toBe("account:read career:read career:write");
      const refresh = { grant_type: "refresh_token", client_id: client.client_id,
        resource: settings.MCP_RESOURCE_URL, refresh_token: token.refresh_token };
      await expect(oauth.exchange({ ...refresh, scope: token.scope + " account:write" }))
        .rejects.toMatchObject({ response: { error: "invalid_scope" } });
      const next = await oauth.exchange({ ...refresh, scope: "career:write account:read career:read" });
      expect((await oauth.identity("Bearer " + next.access_token)).scopes).toEqual(info.scopes);
      const legacy = await oauth.exchange(await approved());
      const rotated = await oauth.exchange({ ...refresh, refresh_token: legacy.refresh_token });
      expect((await oauth.identity("Bearer " + rotated.access_token)).scopes).toEqual(["data:read"]);
    });
    it("rejects unknown, empty or malformed scopes without creating authorization intents", async () => {
      for (const scope of ["career:admin", "", "   ", "career:read\tcareer:write", ["data:read"], null])
        await expect(request({ scope })).rejects.toMatchObject({ response: { error: "invalid_scope" } });
      const [count] = await db.query("SELECT count(*)::int AS count FROM mcp_authorizations");
      expect(count.count).toBe(0);
    });
    it("uses the selected consent frontend without replacing an operator-configured origin", async () => {
      const career = new CareerRepository(db);
      const recruiterConfig = { ...settings, RECRUITERS_PUBLIC_ORIGIN: "http://localhost:3001" };
      const original = oauth;
      try {
        oauth = new McpOAuthService(db, career, new ConfigService(recruiterConfig));
        const legacy = await request({ scope: "account:read" });
        expect(new URL(legacy.next).origin).toBe(settings.MCP_FRONTEND_URL);
        expect(new URL(legacy.next).pathname).toBe("/connections/authorize");
        expect((await oauth.consentInfo("alice", legacy.id)).scope).toBe("account:read");
        oauth = new McpOAuthService(db, career, new ConfigService({
          ...recruiterConfig, MCP_FRONTEND_URL: recruiterConfig.RECRUITERS_PUBLIC_ORIGIN,
        }));
        const verifier = randomBytes(32).toString("base64url");
        const next = new URL(await oauth.authorize({
          client_id: client.client_id, redirect_uri: redirect, state: "signup",
          resource: settings.MCP_RESOURCE_URL, scope: "account:read account:write",
          response_type: "code", code_challenge_method: "S256",
          code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        }));
        expect(next.origin).toBe(recruiterConfig.RECRUITERS_PUBLIC_ORIGIN);
        expect(next.pathname).toBe("/connections/authorize");
        expect(await oauth.connections("alice")).toEqual([]);
      } finally {
        oauth = original;
      }
    });
    it("rotates refresh tokens and revokes the connection on reuse", async () => {
      const first = await oauth.exchange(await approved());
      const params = {
        grant_type: "refresh_token",
        client_id: client.client_id,
        resource: settings.MCP_RESOURCE_URL,
        refresh_token: first.refresh_token,
      };
      const next = await oauth.exchange(params);
      expect(next.refresh_token).not.toBe(first.refresh_token);
      await expect(oauth.exchange(params)).rejects.toThrow();
      await expect(
        oauth.identity("Bearer " + next.access_token),
      ).rejects.toThrow();
    });
    it("prevents another account disconnecting a grant and supports owner revocation", async () => {
      const token = await oauth.exchange(await approved());
      const [grant] = await oauth.connections("alice");
      await oauth.disconnect("bob", String(grant.id));
      await expect(
        oauth.identity("Bearer " + token.access_token),
      ).resolves.toHaveProperty("wallet", "alice");
      await oauth.disconnect("alice", String(grant.id));
      await expect(
        oauth.identity("Bearer " + token.access_token),
      ).rejects.toThrow();
    });
    it("rejects expired authorizations and expired access tokens", async () => {
      const input = await approved();
      await db.query(
        "UPDATE mcp_authorizations SET expires_at=now()-interval '1 second'",
      );
      await expect(oauth.exchange(input)).rejects.toThrow();
      const token = await oauth.exchange(await approved());
      await db.query(
        "UPDATE mcp_tokens SET expires_at=now()-interval '1 second'",
      );
      await expect(
        oauth.identity("Bearer " + token.access_token),
      ).rejects.toThrow();
    });
  },
);
