import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { randomUUID } from "node:crypto";
import { PostgresService } from "src/postgres/postgres.service";
import { ProfileRepository } from "src/postgres/profile.repository";
import { CustomLogger } from "src/shared/utils/custom-logger";
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

/** Consented CV share from a paired companion: the document is stored like a JobStash resume upload,
 * then the CV showcase, CV-derived employment edges and consent are written in one transaction. */
@Injectable()
export class CvShareService {
  private readonly logger = new CustomLogger(CvShareService.name);
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
    if (!this.storage)
      throw new ServiceUnavailableException(
        "CV sharing is unavailable: CV storage is not configured",
      );
    const origin = this.config
      .getOrThrow<string>("FE_DOMAIN")
      .replace(/\/+$/, "");
    // Unknown or banned employers reject the whole share before any storage write.
    await assertCvEmploymentRefs(this.db, input.employment);
    const documentId = randomUUID();
    const key = `${documentId}/${object.filename}`;
    await this.storage.put(key, object.body, object.contentType);
    const sharedAt = new Date().toISOString();
    try {
      await this.db.transaction(async db => {
        const [owner] = await db.query(
          "SELECT id FROM graph_nodes WHERE id=$1 AND label='User' AND properties->>'privyId' LIKE 'did:privy:%' FOR UPDATE",
          [device.owner],
        );
        // Holding the device row keeps a concurrent revocation from interleaving with the write.
        const [paired] = await db.query(
          "SELECT id FROM candidate_devices WHERE id=$1 AND user_node_id=$2 AND status='active' FOR SHARE",
          [device.id, device.owner],
        );
        if (!owner || !paired)
          throw new ForbiddenException("Device is no longer paired");
        const memberships = await db.query(
          "SELECT checkout_id FROM candidate_subscriptions WHERE user_node_id=$1 AND status='active' AND paid_until>clock_timestamp() FOR SHARE",
          [device.owner],
        );
        if (!memberships.length)
          throw new ForbiddenException("An active paid membership is required");
        await assertCvEmploymentRefs(db, input.employment, true);
        await this.profiles.replaceCvShowcase(
          db,
          device.owner,
          `${origin}/api/resume/${documentId}`,
        );
        await replaceCvEmployment(
          db,
          device.owner,
          input,
          documentId,
          sharedAt,
        );
        await recordCvShareConsent(db, device.owner, input, sharedAt);
      });
    } catch (error) {
      // Nothing references the object once the transaction rolled back.
      await this.storage.delete(key).catch(cleanup => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "cv-share-cleanup",
            source: "cv-share.service",
          });
          Sentry.captureException(cleanup);
        });
        this.logger.error(
          `CvShareService::share orphaned object ${key}: ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`,
        );
      });
      throw error;
    }
    return { documentId, attached: true, employment: input.employment.length };
  }
}
