import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileRepository } from "src/postgres/profile.repository";
import {
  assertCvEmploymentRefs,
  cvShareObject,
  recordCvShareConsent,
  replaceCvEmployment,
} from "./cv-sharing";
import { CV_OBJECT_STORAGE, CvObjectStorage } from "./cv-storage";
import { DeviceIdentity, deviceInput } from "./device-execution.protocol";
import { DeviceExecutionService } from "./device-execution.service";

export interface CvShareResult {
  documentId: string;
  attached: true;
  employment: number;
}
interface CvDocument {
  user_node_id: string;
  object_keys: string[] | null;
  showcase_url: string | null;
  request_hash: string | null;
  employment_count: number;
  state: "pending" | "attached" | "deleting" | "deleted";
}

/** Reservations commit before external writes; deletion intent commits before external erasure.
 * All mutations lock the owner (also used by profile replacement), then the immutable identifier.
 * Failed/ambiguous storage operations keep their durable keys and can always be deleted again. */
@Injectable()
export class CvShareService {
  constructor(
    private readonly db: PostgresService,
    private readonly devices: DeviceExecutionService,
    private readonly profiles: ProfileRepository,
    private readonly config: ConfigService,
    @Inject(CV_OBJECT_STORAGE) private readonly storage: CvObjectStorage | null,
  ) {}

  async share(device: DeviceIdentity, raw: unknown): Promise<CvShareResult> {
    const input = deviceInput("cv", raw);
    const object = cvShareObject(input.document);
    await this.devices.authorize(device, true);
    const storage = this.requireStorage();
    const documentId = (input.documentId ?? randomUUID()).toLowerCase();
    const key = `${documentId}/${object.filename}`;
    const url = this.resumeUrl(documentId);
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          filename: object.filename,
          contentType: object.contentType,
          employment: input.employment,
          consent: input.consent,
        }),
      )
      .update(object.body)
      .digest("hex");
    await assertCvEmploymentRefs(this.db, input.employment);
    // A committed reservation is the ownership proof even when the upload response is lost.
    await this.db.transaction(async db => {
      await this.lock(db, device, documentId);
      const record = await this.document(db, documentId);
      if (record) {
        this.assertShare(record, device, hash);
        return;
      }
      if ((await this.storageCall(() => storage.list(`${documentId}/`))).length)
        throw new ConflictException(
          "CV identifier already has unregistered objects",
        );
      await db.query(
        `INSERT INTO candidate_cv_documents
         (document_id,user_node_id,object_keys,showcase_url,request_hash,employment_count,state)
         VALUES($1,$2,$3,$4,$5,$6,'pending')`,
        [documentId, device.owner, [key], url, hash, input.employment.length],
      );
    });
    return this.db.transaction<CvShareResult>(async db => {
      await this.lock(db, device, documentId);
      const record = (await this.document(db, documentId))!;
      this.assertShare(record, device, hash);
      // A retry must not restore a CV that a subsequent share has replaced.
      if (record.state === "attached")
        return {
          documentId,
          attached: true,
          employment: record.employment_count,
        };
      await this.membership(db, device.owner);
      await assertCvEmploymentRefs(db, input.employment, true);
      const uploaded = await this.storageCall(() =>
        storage.put(key, object.body, object.contentType, hash),
      );
      if (!uploaded)
        throw new ConflictException(
          "CV identifier has been deleted; use a new documentId",
        );
      await this.membership(db, device.owner);
      const sharedAt = new Date().toISOString();
      await this.profiles.replaceCvShowcase(db, device.owner, url);
      await replaceCvEmployment(db, device.owner, input, documentId, sharedAt);
      await recordCvShareConsent(db, device.owner, input, sharedAt);
      await db.query(
        "UPDATE candidate_cv_documents SET state='attached' WHERE document_id=$1",
        [documentId],
      );
      return {
        documentId,
        attached: true,
        employment: input.employment.length,
      };
    });
  }

  async delete(
    device: DeviceIdentity,
    raw: unknown,
  ): Promise<{ deleted: true; documentId: string }> {
    const documentId = deviceInput("cvDelete", raw).documentId.toLowerCase();
    const storage = this.requireStorage();
    // Do not call membership authorization/Stripe refresh: deletion needs only active pairing.
    await this.db.transaction(async db => {
      await this.lock(db, device, documentId);
      const record = await this.document(db, documentId);
      if (record && record.user_node_id !== device.owner)
        throw new ForbiddenException("CV belongs to another account");
      if (record?.state === "deleted" || record?.state === "deleting") return;
      if (!record) {
        const proof = await db.query(
          `SELECT DISTINCT source_id::text AS owner FROM graph_relationships
           WHERE type='CV_EMPLOYMENT' AND properties->>'source'='companion_cv'
             AND lower(properties->>'documentId')=$1`,
          [documentId],
        );
        if (
          proof.length &&
          (proof.length !== 1 || proof[0].owner !== device.owner)
        )
          throw new ForbiddenException(
            "CV ownership cannot be established for this account",
          );
        const keys = await this.storageCall(() =>
          storage.list(`${documentId}/`),
        );
        if (!proof.length && keys.length)
          throw new ConflictException({
            statusCode: 409,
            code: "cv_ownership_unknown",
            message:
              "Historical CV ownership cannot be established; no objects were deleted",
          });
        // An absent prefix can safely be tombstoned, preventing a delayed first upload.
        await db.query(
          `INSERT INTO candidate_cv_documents(document_id,user_node_id,object_keys,showcase_url,state)
           VALUES($1,$2,$3,$4,'deleting')`,
          [documentId, device.owner, keys, this.resumeUrl(documentId)],
        );
        return;
      }
      if (record.object_keys === null) {
        const keys = await this.storageCall(() =>
          storage.list(`${documentId}/`),
        );
        await db.query(
          "UPDATE candidate_cv_documents SET object_keys=$2,showcase_url=COALESCE(showcase_url,$3) WHERE document_id=$1",
          [documentId, keys, this.resumeUrl(documentId)],
        );
      }
      await db.query(
        "UPDATE candidate_cv_documents SET state='deleting' WHERE document_id=$1",
        [documentId],
      );
    });
    await this.db.transaction(async db => {
      await this.lock(db, device, documentId);
      const record = (await this.document(db, documentId))!;
      if (record.state === "deleted") return;
      for (const key of record.object_keys!) {
        // Defense in depth against corrupt/imported records: never delete a neighboring prefix.
        if (!key.startsWith(`${documentId}/`))
          throw new ConflictException("Invalid stored CV object key");
        await this.storageCall(() => storage.delete(key));
      }
      await this.profiles.removeCvShowcase(
        db,
        device.owner,
        record.showcase_url!,
      );
      await db.query(
        `DELETE FROM graph_relationships WHERE source_id=$1 AND type='CV_EMPLOYMENT'
         AND properties->>'source'='companion_cv' AND lower(properties->>'documentId')=$2`,
        [device.owner, documentId],
      );
      await db.query(
        `UPDATE candidate_cv_documents SET state='deleted',deleted_at=clock_timestamp(),
         showcase_url=NULL,request_hash=NULL,employment_count=0 WHERE document_id=$1`,
        [documentId],
      );
    });
    return { deleted: true, documentId };
  }

  private async lock(
    db: EntityManager,
    device: DeviceIdentity,
    documentId: string,
  ): Promise<void> {
    const [owner] = await db.query(
      "SELECT id FROM graph_nodes WHERE id=$1 AND label='User' AND properties->>'privyId' LIKE 'did:privy:%' FOR UPDATE",
      [device.owner],
    );
    const [paired] = await db.query(
      "SELECT id FROM candidate_devices WHERE id=$1 AND user_node_id=$2 AND status='active' FOR SHARE",
      [device.id, device.owner],
    );
    if (!owner || !paired)
      throw new ForbiddenException("Device is no longer paired");
    // Global per-ID exclusion covers two different owners racing to reserve an absent UUID.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `companion-cv:${documentId}`,
    ]);
  }

  private async document(
    db: EntityManager,
    documentId: string,
  ): Promise<CvDocument | undefined> {
    const [record] = await db.query(
      "SELECT * FROM candidate_cv_documents WHERE document_id=$1",
      [documentId],
    );
    return record;
  }

  private assertShare(
    record: CvDocument,
    device: DeviceIdentity,
    hash: string,
  ): void {
    if (record.user_node_id !== device.owner)
      throw new ForbiddenException("CV belongs to another account");
    if (record.state === "deleting" || record.state === "deleted")
      throw new ConflictException(
        "CV identifier has been deleted; use a new documentId",
      );
    if (record.request_hash !== hash)
      throw new ConflictException(
        "CV identifier is already registered to another share payload",
      );
  }

  private async membership(db: EntityManager, owner: string): Promise<void> {
    const memberships = await db.query(
      "SELECT checkout_id FROM candidate_subscriptions WHERE user_node_id=$1 AND status='active' AND paid_until>clock_timestamp() FOR SHARE",
      [owner],
    );
    if (!memberships.length)
      throw new ForbiddenException("An active paid membership is required");
  }

  private resumeUrl(documentId: string): string {
    return `${this.config.getOrThrow<string>("FE_DOMAIN").replace(/\/+$/, "")}/api/resume/${documentId}`;
  }

  private requireStorage(): CvObjectStorage {
    if (!this.storage)
      throw new ServiceUnavailableException("CV storage is not configured");
    return this.storage;
  }

  private async storageCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ServiceUnavailableException(
        "CV storage operation failed; retry with the same documentId",
      );
    }
  }
}
