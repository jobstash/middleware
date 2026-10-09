import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { SubscriptionService } from "./subscription.service";
import {
  canonicalJSON,
  DeviceIdentity,
  deviceCanonicalRequest,
  deviceInput,
  devicePublicKey,
  sha256,
  verifyDeviceSignature,
} from "./device-execution.protocol";
import { matchingCatalogue, matchingJobs } from "./device-matching";

export interface DeviceAccount {
  id: string;
  label: string;
}
export interface DevicePairing {
  deviceId: string;
  challenge: string;
  expiresAt: string;
  account: DeviceAccount;
}
export type DeviceRecord = {
  id: string;
  label: string;
  status: "pending" | "active" | "revoked";
  lastSeenAt: Date | null;
  createdAt: Date;
};
export interface DeviceRevocation {
  id: string;
  status: "revoked";
}
export interface DeviceActivation {
  deviceId: string;
  status: "active";
  account: DeviceAccount;
}
export interface DeviceHeartbeat {
  deviceId: string;
  status: "active";
  lastSeenAt: Date;
}

@Injectable()
export class DeviceExecutionService {
  constructor(
    private readonly db: PostgresService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  async pair(wallet: string, raw: unknown): Promise<DevicePairing> {
    const input = deviceInput("pair", raw);
    devicePublicKey(input.publicKey);
    const owner = await this.subscriptions.owner(wallet);
    return this.db.transaction(async db => {
      await db.query(
        "SELECT id FROM graph_nodes WHERE id=$1 AND label='User' FOR UPDATE",
        [owner],
      );
      const [existing] = await db.query(
        "SELECT * FROM candidate_devices WHERE id=$1 OR public_key=$2 FOR UPDATE",
        [input.deviceId, input.publicKey],
      );
      if (
        existing &&
        (String(existing.user_node_id) !== owner ||
          existing.id !== input.deviceId ||
          existing.public_key !== input.publicKey ||
          existing.status !== "pending")
      )
        throw new ConflictException("Device identity is already registered");
      const challenge =
        existing?.pairing_request_id === input.requestId &&
        new Date(existing.challenge_expires_at).getTime() > Date.now()
          ? existing.challenge
          : randomBytes(32).toString("base64url");
      const expiresAt =
        challenge === existing?.challenge
          ? new Date(existing.challenge_expires_at)
          : new Date(Date.now() + 300000);
      const [saved] = await db.query(
        `INSERT INTO candidate_devices(id,user_node_id,public_key,label,status,pairing_request_id,challenge,challenge_expires_at)
        VALUES($1,$2,$3,$4,'pending',$5,$6,$7) ON CONFLICT(id) DO UPDATE SET label=$4,pairing_request_id=$5,challenge=$6,challenge_expires_at=$7
        WHERE candidate_devices.user_node_id=$2 AND candidate_devices.public_key=$3 AND candidate_devices.status='pending' RETURNING id`,
        [
          input.deviceId,
          owner,
          input.publicKey,
          input.label,
          input.requestId,
          challenge,
          expiresAt,
        ],
      );
      if (!saved)
        throw new ConflictException("Device identity is already registered");
      const [account] = await db.query(
        "SELECT COALESCE(NULLIF(btrim(properties->>'name'),''),NULLIF(btrim(properties->>'email'),''),'Your account') AS label FROM graph_nodes WHERE id=$1 AND label='User'",
        [owner],
      );
      return {
        deviceId: input.deviceId,
        challenge,
        expiresAt: expiresAt.toISOString(),
        account: {
          id: owner,
          label: String(account.label)
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .slice(0, 200),
        },
      };
    });
  }
  async devices(wallet: string): Promise<DeviceRecord[]> {
    return this.db.query<DeviceRecord>(
      `SELECT id,label,status,last_seen_at AS "lastSeenAt",created_at AS "createdAt" FROM candidate_devices WHERE user_node_id=$1 ORDER BY created_at`,
      [await this.subscriptions.owner(wallet)],
    );
  }
  async revoke(
    wallet: string,
    id: string,
    raw: unknown,
  ): Promise<DeviceRevocation> {
    deviceInput("revoke", raw);
    if (
      id.length !== 36 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new BadRequestException("Invalid device ID");
    const owner = await this.subscriptions.owner(wallet);
    const [row] = await this.db.query(
      "WITH revoked AS (UPDATE candidate_devices SET status='revoked',revoked_at=COALESCE(revoked_at,now()),challenge=NULL WHERE id=$1 AND user_node_id=$2 RETURNING id) SELECT id FROM revoked",
      [id, owner],
    );
    if (!row) throw new NotFoundException("Device not found");
    return { id, status: "revoked" };
  }
  async authenticate(input: {
    id: string;
    time: string;
    nonce: string;
    signature: string;
    method: string;
    path: string;
    body: Buffer;
  }): Promise<DeviceIdentity> {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      input.id.length !== 36 ||
      input.nonce.length !== 36 ||
      input.time.length !== 13 ||
      !uuid.test(input.id) ||
      !uuid.test(input.nonce) ||
      !/^\d{13}$/.test(input.time) ||
      Math.abs(Date.now() - Number(input.time)) > 30000 ||
      !["/device/activate", "/device/heartbeat", "/device/platform"].includes(
        input.path,
      ) ||
      input.method !== "POST" ||
      input.body.length > 16 * 1024
    )
      throw new ForbiddenException("Invalid device request");
    return this.db.transaction(async db => {
      const [row] = await db.query(
        "SELECT * FROM candidate_devices WHERE id=$1 FOR SHARE",
        [input.id],
      );
      if (Math.abs(Date.now() - Number(input.time)) > 30000)
        throw new ForbiddenException("Device request expired");
      if (
        !row ||
        (row.status !== "active" &&
          !(
            row.status === "pending" &&
            input.path === "/device/activate" &&
            new Date(row.challenge_expires_at).getTime() > Date.now()
          ))
      )
        throw new ForbiddenException("Device is not active");
      verifyDeviceSignature(
        row.public_key,
        deviceCanonicalRequest(
          input.time,
          input.nonce,
          input.method,
          input.path,
          input.body,
        ),
        input.signature,
      );
      const inserted = await db.query(
        "INSERT INTO candidate_device_nonces(device_id,nonce) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING nonce",
        [input.id, input.nonce],
      );
      if (!inserted.length)
        throw new ForbiddenException("Device request was already received");
      await db.query(
        "DELETE FROM candidate_device_nonces WHERE device_id=$1 AND received_at<now()-interval '5 minutes'",
        [input.id],
      );
      return { id: row.id, owner: String(row.user_node_id) };
    });
  }
  async activate(
    device: DeviceIdentity,
    raw: unknown,
  ): Promise<DeviceActivation> {
    const input = deviceInput("activate", raw);
    return this.db.transaction<DeviceActivation>(async db => {
      const [owner] = await db.query(
        "SELECT COALESCE(NULLIF(btrim(properties->>'name'),''),NULLIF(btrim(properties->>'email'),''),'Your account') AS label FROM graph_nodes WHERE id=$1 AND label='User' FOR UPDATE",
        [device.owner],
      );
      const account = {
        id: device.owner,
        label: String(owner?.label ?? "")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .slice(0, 200),
      };
      if (
        !owner ||
        input.account.id !== account.id ||
        input.account.label !== account.label
      )
        throw new ForbiddenException(
          "The account shown for approval does not match this pairing",
        );
      const [row] = await db.query(
        "WITH activated AS (UPDATE candidate_devices SET status='active',challenge=NULL,last_seen_at=now() WHERE id=$1 AND user_node_id=$2 AND status='pending' AND challenge=$3 AND challenge_expires_at>now() RETURNING id) SELECT id FROM activated",
        [device.id, device.owner, input.challenge],
      );
      if (!row)
        throw new ForbiddenException(
          "Pairing challenge expired or was already used",
        );
      return { deviceId: row.id, status: "active", account };
    });
  }
  async heartbeat(
    device: DeviceIdentity,
    raw: unknown,
  ): Promise<DeviceHeartbeat> {
    deviceInput("empty", raw);
    const [row] = await this.db.query<{ last_seen_at: Date }>(
      "WITH seen AS (UPDATE candidate_devices SET last_seen_at=now() WHERE id=$1 AND user_node_id=$2 AND status='active' RETURNING last_seen_at) SELECT last_seen_at FROM seen",
      [device.id, device.owner],
    );
    if (!row) throw new ForbiddenException("Device is not active");
    return {
      deviceId: device.id,
      status: "active",
      lastSeenAt: row.last_seen_at,
    };
  }
  async platform(device: DeviceIdentity, raw: unknown): Promise<unknown> {
    const { operation, args } = deviceInput("platform", raw);
    if (Buffer.byteLength(JSON.stringify(raw)) > 16 * 1024)
      throw new PayloadTooLargeException("Platform request exceeds limit");
    const authorize = async (): Promise<DeviceAccount> => {
      const [account] = await this.db.query<{ label: string }>(
        `SELECT COALESCE(NULLIF(btrim(u.properties->>'name'),''),NULLIF(btrim(u.properties->>'email'),''),'Your account') AS label
        FROM candidate_devices d JOIN graph_nodes u ON u.id=d.user_node_id AND u.label='User' WHERE d.id=$1 AND d.user_node_id=$2 AND d.status='active'`,
        [device.id, device.owner],
      );
      if (!account) throw new ForbiddenException("Device is no longer paired");
      if (
        operation !== "status" &&
        !(await this.subscriptions.entitled(device.owner))
      )
        throw new ForbiddenException("An active paid membership is required");
      return {
        id: device.owner,
        label: String(account.label)
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .slice(0, 200),
      };
    };
    // Reject revoked devices before contacting the merchant, then verify live payment.
    const [paired] = await this.db.query(
      "SELECT id FROM candidate_devices WHERE id=$1 AND user_node_id=$2 AND status='active'",
      [device.id, device.owner],
    );
    if (!paired) throw new ForbiddenException("Device is no longer paired");
    await this.subscriptions.refresh(device.owner);
    const account = await authorize();
    let result: unknown;
    if (operation === "status")
      return {
        mode: "direct-app",
        deviceId: device.id,
        account,
        membership: { active: await this.subscriptions.entitled(device.owner) },
        providerRequired: false,
      };
    if (operation === "matching_catalogue")
      result = await matchingCatalogue(this.db);
    else if (operation === "matching_jobs")
      result = await matchingJobs(this.db, args.ids);
    else {
      const batch = await matchingJobs(this.db, [args.id]);
      const job = batch.jobs[0];
      if (!job) throw new NotFoundException("Job not found");
      const value = {
        ...job,
        company: job.company.name,
        organization: job.company,
        description: job.ad ?? "",
      };
      result = { ...value, contentHash: sha256(canonicalJSON(value)) };
    }
    // Never truncate the original ad. An oversized batch is rejected as a whole.
    if (Buffer.byteLength(JSON.stringify(result)) > 8 * 1024 * 1024)
      throw new PayloadTooLargeException(
        "Platform response exceeds limit; request fewer jobs",
      );
    await this.subscriptions.refresh(device.owner);
    await authorize();
    return result;
  }
}
