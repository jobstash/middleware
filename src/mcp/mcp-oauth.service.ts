import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "src/career-agent/career.repository";
import { CandidateScope } from "src/career-agent/candidate-context";
import { EntityManager } from "typeorm";
import { mcpConfig } from "./mcp-config";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const invalid = () =>
  new BadRequestException({
    error: "invalid_request",
    error_description: "Invalid connection request",
  });
const invalidGrant = () => new BadRequestException({ error: "invalid_grant" });
const invalidToken = () => new UnauthorizedException({
  error: "invalid_token",
  error_description: "Sign in to reconnect this app",
});
const invalidScope = () => new BadRequestException({
  error: "invalid_scope",
  error_description: "Request only supported permissions",
});
export const mcpScopeDescriptions: Record<CandidateScope, string> = {
  "data:read": "Search public jobs and organizations, and research public jobs using your connected AI account. Membership and the existing data allowance apply.",
  "account:read": "Read your account, membership, public connection states and secure setup status. Provider credentials are never shared.",
  "account:write": "Open membership or secure provider setup and disconnect your reasoning or voice connection. Enter credentials only on the secure website.",
  "career:read": "Read your own CVs, source documents, saved career history, applications and curated introduction results.",
  "career:write": "Update your explicit career preferences and availability, save sources, start work funded by your connected provider, and open human review. This cannot confirm facts or submit applications or messages for you.",
};
export const mcpScopes = Object.keys(mcpScopeDescriptions) as CandidateScope[];

function normalizeScope(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || /[^a-z: ]/.test(value))
    throw invalidScope();
  const requested = value.split(" ").filter(Boolean);
  if (!requested.length || requested.some(scope => !Object.hasOwn(mcpScopeDescriptions, scope)))
    throw invalidScope();
  return mcpScopes.filter(scope => requested.includes(scope)).join(" ");
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export type McpIdentity = {
  owner: string;
  wallet: string;
  grantId: string;
  clientId: string;
  scope: string;
  scopes: CandidateScope[];
};

@Injectable()
export class McpOAuthService {
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
    private readonly config: ConfigService,
  ) {}
  settings() {
    return mcpConfig(this.config);
  }
  metadata() {
    const { issuer } = this.settings();
    return {
      issuer,
      authorization_endpoint: issuer + "/authorize",
      token_endpoint: issuer + "/token",
      registration_endpoint: issuer + "/register",
      revocation_endpoint: issuer + "/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: mcpScopes,
      authorization_response_iss_parameter_supported: true,
    };
  }
  async register(input: Record<string, unknown>) {
    this.settings();
    const name = input.client_name;
    const redirects = input.redirect_uris;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      !Array.isArray(redirects) ||
      !redirects.length ||
      redirects.length > 5 ||
      (input.token_endpoint_auth_method !== undefined &&
        input.token_endpoint_auth_method !== "none")
    )
      throw invalid();
    for (const raw of redirects) {
      if (typeof raw !== "string" || raw.length > 2048) throw invalid();
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw invalid();
      }
      const loopback =
        ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) &&
        url.protocol === "http:";
      if (
        (!loopback && url.protocol !== "https:") ||
        url.hash ||
        url.username ||
        url.password
      )
        throw invalid();
    }
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,$2,$3)",
      [id, name.trim(), JSON.stringify(redirects)],
    );
    return {
      client_id: id,
      client_name: name.trim(),
      redirect_uris: redirects,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }
  async authorize(input: Record<string, unknown>) {
    const { resource, frontend } = this.settings();
    const { client_id, redirect_uri, state, code_challenge } = input;
    const scope = normalizeScope(input.scope === undefined ? "data:read" : input.scope);
    if (
      typeof client_id !== "string" ||
      !uuid.test(client_id) ||
      typeof redirect_uri !== "string" ||
      typeof state !== "string" ||
      state.length > 2048 ||
      !state ||
      typeof code_challenge !== "string" ||
      !/^[\w-]{43}$/.test(code_challenge) ||
      input.response_type !== "code" ||
      input.code_challenge_method !== "S256" ||
      input.resource !== resource
    )
      throw invalid();
    const [client] = await this.db.query(
      "SELECT redirect_uris FROM mcp_clients WHERE id=$1",
      [client_id],
    );
    if (!client || !(client.redirect_uris as string[]).includes(redirect_uri))
      throw invalid();
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO mcp_authorizations(id,client_id,redirect_uri,resource,scope,state,challenge,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
      [id, client_id, redirect_uri, resource, scope, state, code_challenge],
    );
    return frontend + "/connections/authorize?request=" + id;
  }
  async consentInfo(wallet: string, id: string) {
    await this.career.owner(wallet);
    if (!uuid.test(id)) throw invalid();
    const [request] = await this.db.query<{ clientName: string; redirectUri: string; scope: string }>(
      `SELECT c.name AS "clientName",a.redirect_uri AS "redirectUri",a.scope FROM mcp_authorizations a JOIN mcp_clients c ON c.id=a.client_id WHERE a.id=$1 AND a.approved_at IS NULL AND a.consumed_at IS NULL AND a.expires_at>now()`,
      [id],
    );
    if (!request) throw invalid();
    const scopes = normalizeScope(request.scope).split(" ") as CandidateScope[];
    return {
      ...request,
      scopes,
      permissions: scopes.map(scope => ({ scope, description: mcpScopeDescriptions[scope] })),
    };
  }
  async consent(wallet: string, id: string, approved: boolean) {
    const owner = await this.career.owner(wallet);
    if (!uuid.test(id) || typeof approved !== "boolean") throw invalid();
    const code = secret();
    const rows = await this.db.query(
      `UPDATE mcp_authorizations SET user_node_id=$2,code_hash=$3,approved_at=now(),
      consumed_at=CASE WHEN $4 THEN NULL ELSE now() END,expires_at=now()+interval '2 minutes'
      WHERE id=$1 AND approved_at IS NULL AND consumed_at IS NULL AND expires_at>now() RETURNING redirect_uri,state`,
      [id, owner, approved ? hash(code) : null, approved],
    );
    // TypeORM returns [rows,count] for UPDATE RETURNING.
    const row = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    if (!row) throw invalid();
    const url = new URL(row.redirect_uri);
    url.searchParams.set("state", row.state);
    url.searchParams.set("iss", this.settings().issuer);
    url.searchParams.set(
      approved ? "code" : "error",
      approved ? code : "access_denied",
    );
    return { redirectUrl: url.href };
  }
  async exchange(input: Record<string, unknown>) {
    const { resource } = this.settings();
    if (
      input.resource !== resource ||
      typeof input.client_id !== "string" ||
      !uuid.test(input.client_id)
    )
      throw invalidGrant();
    const requestedScope = input.scope === undefined ? undefined : normalizeScope(input.scope);
    const access = secret(),
      refresh = secret();
    const result = await this.db.transaction(async db => {
      let grant: { id: string; scope: string };
      if (input.grant_type === "authorization_code") {
        if (
          typeof input.code !== "string" ||
          input.code.length > 128 ||
          typeof input.code_verifier !== "string" ||
          !/^[\w.~-]{43,128}$/.test(input.code_verifier)
        )
          throw invalidGrant();
        const [code] = await db.query(
          "SELECT * FROM mcp_authorizations WHERE code_hash=$1 FOR UPDATE",
          [hash(input.code)],
        );
        if (
          !code ||
          code.consumed_at ||
          new Date(code.expires_at) <= new Date() ||
          code.client_id !== input.client_id ||
          code.redirect_uri !== input.redirect_uri ||
          code.resource !== resource ||
          code.challenge !==
            createHash("sha256").update(input.code_verifier).digest("base64url")
        )
          throw invalidGrant();
        const scope = normalizeScope(code.scope);
        if (requestedScope !== undefined && requestedScope !== scope) throw invalidScope();
        grant = { id: randomUUID(), scope };
        await db.query(
          "UPDATE mcp_authorizations SET consumed_at=now() WHERE id=$1",
          [code.id],
        );
        await db.query(
          "INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '30 days')",
          [grant.id, code.user_node_id, code.client_id, resource, grant.scope],
        );
      } else if (input.grant_type === "refresh_token") {
        if (
          typeof input.refresh_token !== "string" ||
          input.refresh_token.length > 128
        )
          throw invalidGrant();
        const [token] = await db.query(
          `SELECT t.*,g.client_id,g.resource,g.scope,g.revoked_at,g.expires_at AS grant_expiry FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id WHERE t.hash=$1 AND t.kind='refresh' FOR UPDATE OF g,t`,
          [hash(input.refresh_token)],
        );
        if (
          !token ||
          token.client_id !== input.client_id ||
          token.resource !== resource ||
          token.revoked_at ||
          new Date(token.expires_at) <= new Date() ||
          new Date(token.grant_expiry) <= new Date()
        )
          throw invalidGrant();
        if (token.consumed_at) {
          await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [
            token.grant_id,
          ]);
          return null; // Commit replay revocation before reporting failure.
        }
        if (requestedScope !== undefined && requestedScope !== normalizeScope(token.scope))
          throw invalidScope();
        await db.query(
          "UPDATE mcp_tokens SET consumed_at=now() WHERE hash=$1",
          [token.hash],
        );
        grant = { id: token.grant_id, scope: normalizeScope(token.scope) };
      } else throw new BadRequestException({ error: "unsupported_grant_type" });
      await db.query(
        `INSERT INTO mcp_tokens(hash,grant_id,kind,expires_at) VALUES
        ($1,$3,'access',now()+interval '15 minutes'),($2,$3,'refresh',now()+interval '30 days')`,
        [hash(access), hash(refresh), grant.id],
      );
      return {
        access_token: access,
        refresh_token: refresh,
        token_type: "Bearer",
        expires_in: 900,
        scope: grant.scope,
      };
    });
    if (!result) throw invalidGrant();
    return result;
  }
  async identity(
    authorization?: string,
    executor?: EntityManager,
  ): Promise<McpIdentity> {
    const { resource } = this.settings();
    if (!authorization || !/^Bearer [\w-]{43}$/.test(authorization))
      throw invalidToken();
    const query = executor
      ? executor.query.bind(executor)
      : this.db.query.bind(this.db);
    const [row] = await query(
      `SELECT g.user_node_id::text AS owner,u.properties->>'wallet' AS wallet,g.id AS "grantId",g.client_id AS "clientId",g.scope
      FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id JOIN graph_nodes u ON u.id=g.user_node_id AND u.label='User'
      WHERE t.hash=$1 AND t.kind='access' AND t.consumed_at IS NULL AND t.expires_at>now() AND g.expires_at>now() AND g.revoked_at IS NULL AND g.resource=$2${executor ? " FOR SHARE OF g,t" : ""}`,
      [hash(authorization.slice(7)), resource],
    );
    if (!row?.wallet) throw invalidToken();
    let scope: string;
    try {
      scope = normalizeScope(row.scope);
    } catch {
      throw invalidToken();
    }
    return { ...row, scope, scopes: scope.split(" ") as CandidateScope[] };
  }
  requireScope(identity: McpIdentity, scope: CandidateScope): void {
    if (!identity.scopes.includes(scope))
      throw new ForbiddenException({
        error: "insufficient_scope",
        scope,
        error_description: `Reconnect this app and approve ${scope}`,
      });
  }
  async revokeToken(input: Record<string, unknown>) {
    if (
      typeof input.token !== "string" ||
      input.token.length > 128 ||
      typeof input.client_id !== "string" ||
      !uuid.test(input.client_id)
    )
      throw invalid();
    await this.db.query(
      `UPDATE mcp_grants g SET revoked_at=now() FROM mcp_tokens t WHERE t.hash=$1 AND t.grant_id=g.id AND g.client_id=$2`,
      [hash(input.token), input.client_id],
    );
  }
  async connections(wallet: string) {
    const owner = await this.career.owner(wallet);
    return this.db.query(
      `SELECT g.id,c.name AS "clientName",g.scope,g.created_at AS "createdAt",g.expires_at AS "expiresAt" FROM mcp_grants g JOIN mcp_clients c ON c.id=g.client_id WHERE g.user_node_id=$1 AND g.revoked_at IS NULL AND g.expires_at>now() ORDER BY g.created_at DESC LIMIT 100`,
      [owner],
    );
  }
  async disconnect(wallet: string, id: string) {
    const owner = await this.career.owner(wallet);
    if (!uuid.test(id)) throw invalid();
    await this.db.query(
      "UPDATE mcp_grants SET revoked_at=now() WHERE id=$1 AND user_node_id=$2",
      [id, owner],
    );
    return { disconnected: true };
  }
}
