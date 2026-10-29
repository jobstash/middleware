import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";

/** Object storage for shared CVs; the JobStash resume bucket in production. */
export interface CvObjectStorage {
  /** Create-only; an identical existing request is accepted, but a deletion fence returns false. */
  put(
    key: string,
    body: Buffer,
    contentType: string,
    requestHash: string,
  ): Promise<boolean>;
  /** Erase bytes by permanently replacing the exact key with a zero-byte deletion fence. */
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
export const CV_OBJECT_STORAGE = "CV_OBJECT_STORAGE";

/** The webapp's R2 resume bucket (`${uuid}/${filename}`, served by /api/resume/:uuid).
 * Returns null when any R2 setting is missing, so CV sharing reports itself unavailable. */
export function r2CvObjectStorage(
  config: ConfigService,
): CvObjectStorage | null {
  const endpoint = config.get<string>("R2_ENDPOINT");
  const accessKeyId = config.get<string>("R2_ACCESS_KEY_ID");
  const secretAccessKey = config.get<string>("R2_SECRET_ACCESS_KEY");
  const bucket = config.get<string>("R2_BUCKET_NAME");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    async put(key, body, contentType, requestHash): Promise<boolean> {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: "private, no-store",
            IfNoneMatch: "*",
            Metadata: {
              "companion-cv-state": "document",
              "companion-cv-request": requestHash,
            },
          }),
        );
        return true;
      } catch (error) {
        if (
          !(error instanceof S3ServiceException) ||
          error.$metadata.httpStatusCode !== 412
        )
          throw error;
        // Never interpret a rejected conditional write as success without identifying
        // the existing object. In particular, a deletion fence is not an uploaded CV.
        const existing = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (existing.Metadata?.["companion-cv-state"] === "deleted")
          return false;
        if (
          existing.Metadata?.["companion-cv-state"] === "document" &&
          existing.Metadata?.["companion-cv-request"] === requestHash &&
          existing.ContentLength === body.length
        )
          return true;
        throw new Error(
          "Existing CV object does not match its registered request",
        );
      }
    },
    async delete(key): Promise<void> {
      // A DB lock cannot fence a PUT whose database session disappeared. This write
      // atomically erases existing bytes and prevents any late create-only PUT from
      // committing. Never DeleteObject this fence, including in lifecycle cleanup.
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.alloc(0),
          ContentType: "application/octet-stream",
          CacheControl: "private, no-store",
          Metadata: { "companion-cv-state": "deleted" },
        }),
      );
    },
    async list(prefix): Promise<string[]> {
      const keys: string[] = [];
      let continuation: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuation,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key?.startsWith(prefix)) keys.push(object.Key);
        }
        continuation = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
        if (page.IsTruncated && !continuation)
          throw new Error("Incomplete CV object listing");
      } while (continuation);
      return keys;
    },
  };
}
