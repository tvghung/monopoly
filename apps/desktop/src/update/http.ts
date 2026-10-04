/**
 * The two network steps the updater takes (read the manifest, download an installer) share the same rules: a deadline
 * for the response headers, cancellation that also stops a body that is still being read, and a check that the final URL
 * (after GitHub's redirect to its object storage) is on a host the endpoints trust. The fetch itself is injected: the app
 * passes Electron's `net.fetch` (the system proxy and certificates apply, as for a browser), the tests pass fakes or the
 * global `fetch` against a local server.
 */
export type UpdateHttpErrorCode = 'NETWORK' | 'HTTP_STATUS' | 'TIMEOUT' | 'CANCELLED' | 'UNTRUSTED_URL' | 'TOO_LARGE';

export class UpdateHttpError extends Error {
  public constructor(
    public readonly code: UpdateHttpErrorCode,
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UpdateHttpError';
  }
}

type AbortReason = 'CANCELLED' | 'TIMEOUT';

export interface OpenRequest {
  url: string;
  fetch: typeof globalThis.fetch;
  isUrlAllowed: (url: URL) => boolean;
  /** Cancels the request and any body that is still being read. */
  signal?: AbortSignal;
  /** The response headers must arrive within this long. */
  timeoutMs: number;
  accept?: string;
}

export interface OpenedResponse {
  response: Response;
  /** Stops the body read; the reason is what `abortReason()` reports afterwards. */
  abort(reason: AbortReason): void;
  abortReason(): AbortReason | undefined;
  /** Releases the listeners; call once the body is finished or has failed. */
  dispose(): void;
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export async function openResponse(request: OpenRequest): Promise<OpenedResponse> {
  const requested = parseUrl(request.url);
  if (!requested || !request.isUrlAllowed(requested)) {
    throw new UpdateHttpError('UNTRUSTED_URL', 'The update URL is not on a trusted host.');
  }
  if (request.signal?.aborted) throw new UpdateHttpError('CANCELLED', 'The request was cancelled before it started.');

  const controller = new AbortController();
  let reason: AbortReason | undefined;
  const abort = (why: AbortReason): void => {
    reason ??= why;
    controller.abort();
  };
  const onExternalAbort = (): void => abort('CANCELLED');
  request.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = setTimeout(() => abort('TIMEOUT'), request.timeoutMs);
  const dispose = (): void => {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onExternalAbort);
  };

  let response: Response;
  try {
    response = await request.fetch(request.url, {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: { accept: request.accept ?? '*/*' },
    });
  } catch (error) {
    dispose();
    if (reason) throw new UpdateHttpError(reason, 'The request was stopped.', undefined, { cause: error });
    throw new UpdateHttpError('NETWORK', 'The update server could not be reached.', undefined, { cause: error });
  }
  // The deadline covers the headers only: a download that is under way is watched by its own stall timer.
  clearTimeout(timer);

  const final = response.url ? parseUrl(response.url) : requested;
  if (!final || !request.isUrlAllowed(final)) {
    controller.abort();
    dispose();
    throw new UpdateHttpError('UNTRUSTED_URL', 'The update server redirected to a host that is not trusted.');
  }
  if (response.status !== 200) {
    controller.abort();
    dispose();
    throw new UpdateHttpError('HTTP_STATUS', `The update server answered ${response.status}.`, response.status);
  }
  return { response, abort, abortReason: () => reason, dispose };
}

/** Reads a small text body. A body larger than `maxBytes` is refused rather than buffered. */
export async function readTextLimited(opened: OpenedResponse, maxBytes: number): Promise<string> {
  const { response } = opened;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    opened.abort('CANCELLED');
    throw new UpdateHttpError('TOO_LARGE', 'The update manifest is larger than allowed.');
  }
  if (!response.body) throw new UpdateHttpError('NETWORK', 'The update server sent no body.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        opened.abort('CANCELLED');
        throw new UpdateHttpError('TOO_LARGE', 'The update manifest is larger than allowed.');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof UpdateHttpError) throw error;
    const reason = opened.abortReason();
    throw new UpdateHttpError(reason ?? 'NETWORK', 'The update manifest could not be read.', undefined, { cause: error });
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}
