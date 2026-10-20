import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";

/** Object storage for shared CVs; the JobStash resume bucket in production. */
export interface CvObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
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
    async put(key, body, contentType): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async delete(key): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
