import path from 'node:path';
import { stat } from 'node:fs/promises';

const DEV_RENDERER_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function isAllowedRendererNavigation(rawUrl: string, development: boolean): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'app:') return url.hostname === 'own-the-block';
    return development
      && url.protocol === 'http:'
      && DEV_RENDERER_HOSTS.has(url.hostname)
      && url.port === '5173';
  } catch {
    return false;
  }
}

export function isSafeExternalUrl(rawUrl: string, development = false): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'https:') return !url.username && !url.password;
    return development
      && url.protocol === 'http:'
      && DEV_RENDERER_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function resolveRendererPath(
  rendererRoot: string,
  rawUrl: string,
): Promise<string | null> {
  let requestPath: string;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'app:' || url.hostname !== 'own-the-block') return null;
    requestPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (requestPath.includes('\0')) return null;
  const root = path.resolve(rendererRoot);
  const candidate = path.resolve(root, `.${requestPath || '/index.html'}`);
  const insideRoot = candidate === root || candidate.startsWith(`${root}${path.sep}`);
  if (!insideRoot) return null;

  try {
    const metadata = await stat(candidate);
    if (metadata.isDirectory()) return path.join(candidate, 'index.html');
    return metadata.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

