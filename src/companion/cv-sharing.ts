import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import {
  CV_DOCX,
  CV_PDF,
  CvEmploymentItem,
  cvEmploymentKey,
  cvEmploymentKinds,
  CvShareDocument,
  CvShareInput,
  DEVICE_CV_DOCUMENT_BYTES,
} from "./device-execution.protocol";

type Executor = {
  query(sql: string, parameters?: unknown[]): Promise<unknown[]>;
};
export const CV_EMPLOYMENT = "CV_EMPLOYMENT";

/** The bytes, filename and content type stored for a shared CV, as for a JobStash resume upload. */
export function cvShareObject(document: CvShareDocument): {
  body: Buffer;
  filename: string;
  contentType: string;
} {
  const filename = document.filename.trim();
  if ("text" in document)
    return {
      body: Buffer.from(document.text, "utf8"),
      filename: /\.txt$/i.test(filename) ? filename : `${filename}.txt`,
      contentType: "text/plain; charset=utf-8",
    };
  const body = Buffer.from(document.contentBase64, "base64");
  if (!body.length || body.toString("base64") !== document.contentBase64)
    throw new BadRequestException("The document encoding is invalid");
  if (body.length > DEVICE_CV_DOCUMENT_BYTES)
    throw new PayloadTooLargeException("The CV exceeds 5 MiB");
  // PDF files start with %PDF-; DOCX files are ZIP containers.
  const magic =
    document.mediaType === CV_PDF
      ? Buffer.from("%PDF-")
      : Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if (!body.subarray(0, magic.length).equals(magic))
    throw new BadRequestException(
      `The document is not a ${document.mediaType === CV_DOCX ? "DOCX" : "PDF"} file`,
    );
  return { body, filename, contentType: document.mediaType };
}

/** Every ref must name an existing, non-banned node of its stated label; otherwise nothing is written. */
export async function assertCvEmploymentRefs(
  db: Executor,
  employment: CvEmploymentItem[],
  lock = false,
): Promise<void> {
  if (!employment.length) return;
  const refs = [...new Set(employment.map(item => item.ref))].map(ref =>
    ref.split(":"),
  );
  const rows = await db.query(
    `SELECT node.id FROM graph_nodes node JOIN unnest($1::bigint[],$2::text[]) requested(id,label)
       ON node.id=requested.id AND node.label=requested.label
     WHERE NOT entity_property_is_banned(node.properties) ${lock ? "FOR SHARE OF node" : ""}`,
    [refs.map(([, id]) => id), refs.map(([kind]) => cvEmploymentKinds[kind])],
  );
  if (rows.length !== refs.length)
    throw new BadRequestException("Unknown employer reference");
}

/** Replaces the owner's CV-derived employment edges with the shared set. */
export async function replaceCvEmployment(
  db: Executor,
  owner: string,
  input: CvShareInput,
  documentId: string,
  sharedAt: string,
): Promise<void> {
  await db.query(
    "DELETE FROM graph_relationships WHERE source_id=$1 AND type=$2",
    [owner, CV_EMPLOYMENT],
  );
  if (!input.employment.length) return;
  await db.query(
    `INSERT INTO graph_relationships(source_id,target_id,type,relationship_key,properties)
     SELECT $1,item.target,$2,item.key,item.properties FROM unnest($3::bigint[],$4::text[],$5::jsonb[]) item(target,key,properties)`,
    [
      owner,
      CV_EMPLOYMENT,
      input.employment.map(item => item.ref.split(":")[1]),
      input.employment.map(cvEmploymentKey),
      input.employment.map(item =>
        JSON.stringify({
          title: item.title,
          startDate: item.startDate,
          endDate: item.endDate,
          current: item.current,
          documentId,
          source: "companion_cv",
          consentVersion: input.consent.version,
          sharedAt,
        }),
      ),
    ],
  );
}

/** Consent is recorded on the candidate; withdrawing it later stops future shares only. */
export async function recordCvShareConsent(
  db: Executor,
  owner: string,
  input: CvShareInput,
  sharedAt: string,
): Promise<void> {
  await db.query(
    `UPDATE graph_nodes SET properties=properties || jsonb_build_object('cvSharingConsent',
       jsonb_build_object('consentVersion',$2::int,'grantedAt',$3::text,'sharedAt',$4::text)),updated_at=now()
     WHERE id=$1 AND label='User'`,
    [owner, input.consent.version, input.consent.grantedAt, sharedAt],
  );
}
