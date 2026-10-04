import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { openResponse, UpdateHttpError, type UpdateHttpErrorCode } from './http';
import { DOWNLOAD_CONNECT_TIMEOUT_MS, DOWNLOAD_STALL_TIMEOUT_MS } from './updateConfig';

export type DownloadErrorCode = UpdateHttpErrorCode | 'INTEGRITY' | 'DISK_SPACE' | 'DISK_WRITE';

export class DownloadError extends Error {
  public constructor(public readonly code: DownloadErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

export interface DownloadRequest {
  url: string;
  /** Final path of the verified file; the bytes are written to `<destination>.part` first. */
  destination: string;
  /** The size and checksum the manifest recorded for this installer. */
  size: number;
  sha256: string;
  fetch: typeof globalThis.fetch;
  isUrlAllowed: (url: URL) => boolean;
  signal?: AbortSignal;
  onProgress?: (receivedBytes: number) => void;
  connectTimeoutMs?: number;
  stallTimeoutMs?: number;
}

const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 6;
const RENAME_DELAY_MS = 250;

/** Turns a failing disk operation into a download error the player can be told about. */
async function onDisk<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const full = code === 'ENOSPC' || code === 'EDQUOT';
    throw new DownloadError(full ? 'DISK_SPACE' : 'DISK_WRITE', 'The update could not be written to disk.', { cause: error });
  }
}

/**
 * Windows scans a file the moment it is written, and a rename over the scanned file can fail for a moment with EPERM,
 * EBUSY or EACCES; it passes a little later.
 */
async function renameWhenFree(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (attempt >= RENAME_ATTEMPTS || !RENAME_RETRY_CODES.has(code)) throw error;
      await new Promise<void>(resolve => { setTimeout(resolve, RENAME_DELAY_MS); });
    }
  }
}

export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Downloads `url` to `destination` and leaves a file there only when it is exactly the file the manifest described: the
 * byte count and the SHA-256 are checked while streaming, so a truncated, padded or altered file is never kept. On any
 * failure, including a cancel, nothing remains on disk.
 */
export async function downloadVerifiedFile(request: DownloadRequest): Promise<void> {
  const partial = `${request.destination}.part`;
  const stallMs = request.stallTimeoutMs ?? DOWNLOAD_STALL_TIMEOUT_MS;
  let handle: FileHandle | undefined;
  let stallTimer: NodeJS.Timeout | undefined;
  let opened: Awaited<ReturnType<typeof openResponse>> | undefined;

  try {
    await onDisk(() => mkdir(path.dirname(request.destination), { recursive: true }));
    await onDisk(() => rm(partial, { force: true }));

    opened = await openResponse({
      url: request.url,
      fetch: request.fetch,
      isUrlAllowed: request.isUrlAllowed,
      signal: request.signal,
      timeoutMs: request.connectTimeoutMs ?? DOWNLOAD_CONNECT_TIMEOUT_MS,
      accept: 'application/octet-stream',
    });
    const { response } = opened;
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) !== request.size) {
      opened.abort('CANCELLED');
      throw new DownloadError('INTEGRITY', 'The server announced a different size than the manifest.');
    }
    if (!response.body) throw new DownloadError('NETWORK', 'The server sent no body.');

    handle = await onDisk(() => open(partial, 'w'));
    const hash = createHash('sha256');
    const reader = response.body.getReader();
    const armStall = (): void => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => opened?.abort('TIMEOUT'), stallMs);
    };
    armStall();

    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armStall();
      received += value.byteLength;
      // More bytes than the manifest promised: stop now instead of filling the disk.
      if (received > request.size) {
        opened.abort('CANCELLED');
        throw new DownloadError('INTEGRITY', 'The download is larger than the manifest says.');
      }
      hash.update(value);
      const written = await onDisk(() => handle!.write(value));
      if (written.bytesWritten !== value.byteLength) {
        throw new DownloadError('DISK_WRITE', 'The update could not be written to disk.');
      }
      request.onProgress?.(received);
    }
    clearTimeout(stallTimer);

    if (received !== request.size) throw new DownloadError('INTEGRITY', 'The download is shorter than the manifest says.');
    if (hash.digest('hex') !== request.sha256) throw new DownloadError('INTEGRITY', 'The download does not match its checksum.');

    await onDisk(() => handle!.close());
    handle = undefined;
    await onDisk(() => renameWhenFree(partial, request.destination));
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    if (error instanceof UpdateHttpError) throw new DownloadError(error.code, error.message, { cause: error });
    // A stall or a cancel surfaces from the body as an AbortError; its real reason is what the opened response recorded.
    const reason = opened?.abortReason();
    if (reason) throw new DownloadError(reason, 'The download was stopped.', { cause: error });
    throw new DownloadError('NETWORK', 'The download was interrupted.', { cause: error });
  } finally {
    clearTimeout(stallTimer);
    opened?.dispose();
    await handle?.close().catch(() => undefined);
    await rm(partial, { force: true }).catch(() => undefined);
  }
}
