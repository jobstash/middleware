import {
  GetObjectCommand, GetObjectCommandOutput, HeadObjectCommand, HeadObjectCommandOutput,
  PutObjectCommand, PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, parse } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export interface CandidateDocumentObjectTransport {
  send(command: HeadObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<HeadObjectCommandOutput>;
  send(command: GetObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<GetObjectCommandOutput>;
  send(command: PutObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<PutObjectCommandOutput>;
}
interface PrivateMetadata {
  Metadata: { owner: string; "content-hash": string; filename: string };
  ContentType: string;
  ContentLength: number;
}
const MAX_BYTES = 5 * 1024 * 1024;
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/resume$/;
function storageError(status: number) {
  return Object.assign(new Error("Private document storage rejected the operation"), { $metadata: { httpStatusCode: status } });
}
function metadata(value: unknown): PrivateMetadata {
  if (!value || typeof value !== "object") throw storageError(500);
  const data = value as Partial<PrivateMetadata>;
  if (!data.Metadata || typeof data.Metadata.owner !== "string" || !/^[a-f0-9]{64}$/.test(data.Metadata.owner) ||
      typeof data.Metadata["content-hash"] !== "string" || !/^[a-f0-9]{64}$/.test(data.Metadata["content-hash"]) ||
      typeof data.Metadata.filename !== "string" || data.Metadata.filename.length > 4096 ||
      !["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(data.ContentType ?? "") ||
      !Number.isSafeInteger(data.ContentLength) || data.ContentLength! <= 0 || data.ContentLength! > MAX_BYTES)
    throw storageError(500);
  return data as PrivateMetadata;
}

/** Explicit development storage. No network, public paths, fallback bucket or client-chosen keys. */
export class LocalCandidateDocumentStorage implements CandidateDocumentObjectTransport {
  private readonly root: string;
  constructor(directory: string) {
    if (!isAbsolute(directory) || directory !== normalize(directory) || directory === parse(directory).root)
      throw new Error("Configure an absolute private document directory");
    this.root = directory;
  }

  private async directory(path: string) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.())
      throw storageError(500);
  }

  private async prepare() {
    // Reject symlink ancestors too; resolving an otherwise-private leaf through a link is unsafe.
    let parent = dirname(this.root);
    while (true) {
      const stat = await lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw storageError(500);
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    await mkdir(this.root, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    await this.directory(this.root);
    if (await realpath(this.root) !== this.root) throw storageError(500);
  }

  private async readFile(path: string, limit: number) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() ||
          (stat.mode & 0o777) !== 0o600 || stat.size > limit) throw storageError(500);
      const bytes = await handle.readFile();
      if (bytes.length > limit || bytes.length !== stat.size) throw storageError(500);
      return bytes;
    } finally { await handle.close(); }
  }

  send(command: HeadObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<HeadObjectCommandOutput>;
  send(command: GetObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<GetObjectCommandOutput>;
  send(command: PutObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<PutObjectCommandOutput>;
  async send(command: HeadObjectCommand | GetObjectCommand | PutObjectCommand, options?: { abortSignal?: AbortSignal }) {
    options?.abortSignal?.throwIfAborted();
    if (!keyPattern.test(command.input.Key ?? "")) throw storageError(400);
    await this.prepare();
    const objectDirectory = join(this.root, command.input.Key!.split("/")[0]);
    if (command instanceof PutObjectCommand) {
      if (!Buffer.isBuffer(command.input.Body) || command.input.Body.length > MAX_BYTES ||
          command.input.Body.length !== command.input.ContentLength || command.input.IfNoneMatch !== "*") throw storageError(400);
      const info = metadata({ Metadata: command.input.Metadata, ContentType: command.input.ContentType, ContentLength: command.input.ContentLength });
      const temporary = join(this.root, `.write-${randomUUID()}`);
      await mkdir(temporary, { mode: 0o700 });
      try {
        for (const [name, bytes] of [["content", command.input.Body], ["metadata.json", Buffer.from(JSON.stringify(info))]] as const) {
          const handle = await open(join(temporary, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        }
        options?.abortSignal?.throwIfAborted();
        await rename(temporary, objectDirectory).catch(error => {
          if (["EEXIST", "ENOTEMPTY", "ENOTDIR", "EISDIR"].includes(error.code)) throw storageError(412);
          throw error;
        });
        const root = await open(this.root, constants.O_RDONLY | constants.O_NOFOLLOW);
        try { await root.sync(); } finally { await root.close(); }
      } finally { await rm(temporary, { recursive: true, force: true }); }
      return { $metadata: {} };
    }
    try {
      await this.directory(objectDirectory);
      const info = metadata(JSON.parse((await this.readFile(join(objectDirectory, "metadata.json"), 8192)).toString("utf8")));
      options?.abortSignal?.throwIfAborted();
      if (command instanceof HeadObjectCommand) return { ...info, $metadata: {} };
      if (!(command instanceof GetObjectCommand)) throw storageError(400);
      const bytes = await this.readFile(join(objectDirectory, "content"), MAX_BYTES);
      if (bytes.length !== info.ContentLength) throw storageError(500);
      // SDK streams carry transform helpers; this internal consumer uses only the Node async iterator.
      const body = Readable.from([bytes]) as GetObjectCommandOutput["Body"];
      return { ...info, Body: body, $metadata: {} };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") throw storageError(404);
      throw error;
    }
  }
}
