import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadError, downloadVerifiedFile, hashFile, type DownloadErrorCode } from '../src/update/downloader';
import { openResponse, readTextLimited, UpdateHttpError } from '../src/update/http';

// A slow or busy machine must not turn "late" into "failed" (the timeouts under test are set per test, in milliseconds).
vi.setConfig({ testTimeout: 30_000 });

const body = randomBytes(300_000);
const sha256 = createHash('sha256').update(body).digest('hex');

interface TestServer {
  url: string;
  port: number;
}

let servers: http.Server[] = [];
let workspace: string;

async function serve(handler: http.RequestListener): Promise<TestServer> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, port };
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'own-the-block-download-'));
});

afterEach(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>(resolve => { server.close(() => resolve()); });
  }
  servers = [];
  await rm(workspace, { recursive: true, force: true });
});

function request(url: string, overrides: Partial<Parameters<typeof downloadVerifiedFile>[0]> = {}) {
  return {
    url,
    destination: path.join(workspace, 'update', 'Setup.exe'),
    size: body.length,
    sha256,
    fetch: globalThis.fetch,
    isUrlAllowed: (candidate: URL) => candidate.hostname === '127.0.0.1',
    ...overrides,
  };
}

async function failureOf(promise: Promise<unknown>): Promise<DownloadErrorCode> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DownloadError);
    return (error as DownloadError).code;
  }
  throw new Error('The download was expected to fail.');
}

/** Nothing of a failed download may stay behind: no installer, no partial file. */
async function expectNothingLeft(): Promise<void> {
  const left = await readdir(path.join(workspace, 'update')).catch(() => [] as string[]);
  expect(left).toEqual([]);
}

describe('verified download', () => {
  it('writes exactly the announced file, reports progress up to its size and leaves no partial file', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.end(body);
    });
    const progress: number[] = [];

    await downloadVerifiedFile(request(url, { onProgress: received => progress.push(received) }));

    const destination = path.join(workspace, 'update', 'Setup.exe');
    expect((await readFile(destination)).equals(body)).toBe(true);
    expect(await readdir(path.join(workspace, 'update'))).toEqual(['Setup.exe']);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(body.length);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    expect(await hashFile(destination)).toBe(sha256);
  });

  it('replaces an installer and a partial file that an earlier run left', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.end(body);
    });
    const directory = path.join(workspace, 'update');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'Setup.exe'), 'old installer');
    await writeFile(path.join(directory, 'Setup.exe.part'), 'half of something');

    await downloadVerifiedFile(request(url));

    expect((await readFile(path.join(directory, 'Setup.exe'))).equals(body)).toBe(true);
    expect(await readdir(directory)).toEqual(['Setup.exe']);
  });

  it('refuses a file whose checksum differs, and keeps nothing', async () => {
    const altered = Buffer.from(body);
    altered[1_000] ^= 0xff;
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': altered.length });
      response.end(altered);
    });

    expect(await failureOf(downloadVerifiedFile(request(url)))).toBe('INTEGRITY');
    await expectNothingLeft();
  });

  it('refuses a body shorter than the manifest says when the server announces no length', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200);
      response.end(body.subarray(0, 1_000));
    });

    expect(await failureOf(downloadVerifiedFile(request(url)))).toBe('INTEGRITY');
    await expectNothingLeft();
  });

  it('stops a body that grows past the manifest size instead of filling the disk', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200);
      response.end(Buffer.concat([body, randomBytes(50_000)]));
    });

    expect(await failureOf(downloadVerifiedFile(request(url)))).toBe('INTEGRITY');
    await expectNothingLeft();
  });

  it('refuses a server that announces another size than the manifest', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length + 1 });
      response.end(Buffer.concat([body, Buffer.from([0])]));
    });

    expect(await failureOf(downloadVerifiedFile(request(url)))).toBe('INTEGRITY');
    await expectNothingLeft();
  });

  it('reports an HTTP status that is not 200', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(404);
      response.end('missing');
    });

    expect(await failureOf(downloadVerifiedFile(request(url)))).toBe('HTTP_STATUS');
    await expectNothingLeft();
  });

  it('refuses a redirect to a host that is not trusted', async () => {
    const elsewhere = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.end(body);
    });
    const trusted = await serve((_request, response) => {
      response.writeHead(302, { location: `${elsewhere.url}/Setup.exe` });
      response.end();
    });

    const code = await failureOf(downloadVerifiedFile(request(`${trusted.url}/Setup.exe`, {
      isUrlAllowed: candidate => candidate.port === String(trusted.port),
    })));

    expect(code).toBe('UNTRUSTED_URL');
    await expectNothingLeft();
  });

  it('follows a redirect between trusted hosts', async () => {
    const storage = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.end(body);
    });
    const front = await serve((_request, response) => {
      response.writeHead(302, { location: `${storage.url}/blob` });
      response.end();
    });

    await downloadVerifiedFile(request(`${front.url}/Setup.exe`));

    expect((await readFile(path.join(workspace, 'update', 'Setup.exe'))).equals(body)).toBe(true);
  });

  it('refuses a URL that is not trusted before sending any request', async () => {
    let requests = 0;
    const { url } = await serve((_request, response) => {
      requests += 1;
      response.end();
    });

    expect(await failureOf(downloadVerifiedFile(request(url, { isUrlAllowed: () => false })))).toBe('UNTRUSTED_URL');
    expect(requests).toBe(0);
  });

  it('can be cancelled while the body is arriving, and keeps nothing', async () => {
    const controller = new AbortController();
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.write(body.subarray(0, 100_000));
      // The rest never comes.
    });

    const outcome = failureOf(downloadVerifiedFile(request(url, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })));

    expect(await outcome).toBe('CANCELLED');
    await expectNothingLeft();
  });

  it('refuses to start when it was cancelled beforehand', async () => {
    const controller = new AbortController();
    controller.abort();
    const { url } = await serve((_request, response) => response.end());

    expect(await failureOf(downloadVerifiedFile(request(url, { signal: controller.signal })))).toBe('CANCELLED');
  });

  it('gives up on a body that stops arriving', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.write(body.subarray(0, 10_000));
    });

    expect(await failureOf(downloadVerifiedFile(request(url, { stallTimeoutMs: 150 })))).toBe('TIMEOUT');
    await expectNothingLeft();
  });

  it('gives up on a server that never sends the headers', async () => {
    const { url } = await serve(() => undefined);

    expect(await failureOf(downloadVerifiedFile(request(url, { connectTimeoutMs: 150 })))).toBe('TIMEOUT');
    await expectNothingLeft();
  });

  it('reports a server that cannot be reached', async () => {
    const { url } = await serve((_request, response) => response.end());
    const closed = servers.pop() as http.Server;
    await new Promise<void>(resolve => { closed.close(() => resolve()); });

    expect(await failureOf(downloadVerifiedFile(request(url)))).toBe('NETWORK');
  });

  it('reports a destination that cannot be written', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': body.length });
      response.end(body);
    });
    // The parent of the destination is a file, so the folder cannot be created.
    const blocker = path.join(workspace, 'blocker');
    await writeFile(blocker, 'a file where a folder is needed');

    expect(await failureOf(downloadVerifiedFile(request(url, { destination: path.join(blocker, 'Setup.exe') })))).toBe('DISK_WRITE');
  });
});

describe('update http helpers', () => {
  it('reads a small text body', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });

    const opened = await openResponse({
      url, fetch: globalThis.fetch, isUrlAllowed: () => true, timeoutMs: 2_000,
    });
    expect(await readTextLimited(opened, 1_000)).toBe('{"ok":true}');
    opened.dispose();
  });

  it('refuses a body larger than the limit, announced or not', async () => {
    const large = 'x'.repeat(5_000);
    const announced = await serve((_request, response) => {
      response.writeHead(200, { 'content-length': large.length });
      response.end(large);
    });
    const chunked = await serve((_request, response) => {
      response.writeHead(200);
      response.write(large.slice(0, 2_500));
      setTimeout(() => response.end(large.slice(2_500)), 20);
    });

    for (const { url } of [announced, chunked]) {
      const opened = await openResponse({ url, fetch: globalThis.fetch, isUrlAllowed: () => true, timeoutMs: 2_000 });
      await expect(readTextLimited(opened, 1_000)).rejects.toMatchObject({ code: 'TOO_LARGE' });
      opened.dispose();
    }
  });

  it('refuses a body that is not UTF-8 text', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(200);
      response.end(Buffer.from([0xff, 0xfe, 0xfd]));
    });
    const opened = await openResponse({ url, fetch: globalThis.fetch, isUrlAllowed: () => true, timeoutMs: 2_000 });

    await expect(readTextLimited(opened, 1_000)).rejects.toBeInstanceOf(TypeError);
    opened.dispose();
  });

  it('maps a status other than 200 to an HTTP error that carries the status', async () => {
    const { url } = await serve((_request, response) => {
      response.writeHead(503);
      response.end();
    });

    await expect(openResponse({ url, fetch: globalThis.fetch, isUrlAllowed: () => true, timeoutMs: 2_000 }))
      .rejects.toMatchObject({ code: 'HTTP_STATUS', status: 503 });
  });

  it('reports a malformed URL as untrusted rather than throwing a TypeError', async () => {
    await expect(openResponse({ url: 'not a url', fetch: globalThis.fetch, isUrlAllowed: () => true, timeoutMs: 100 }))
      .rejects.toBeInstanceOf(UpdateHttpError);
  });
});
