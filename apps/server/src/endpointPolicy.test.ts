import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isPublicEndpointOrigin,
  PUBLIC_ENDPOINT_PROVIDERS,
  publicEndpointOrigin,
} from '@monopoly/shared';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('public endpoint policy', () => {
  it('accepts only a bare https origin of a known provider', () => {
    expect(publicEndpointOrigin('https://room-1.trycloudflare.com')).toBe('https://room-1.trycloudflare.com');
    expect(publicEndpointOrigin('https://room-1.trycloudflare.com/')).toBe('https://room-1.trycloudflare.com');
    for (const value of [
      'https://api.trycloudflare.com', 'http://room.trycloudflare.com', 'https://room.trycloudflare.com:8443',
      'https://user:pw@room.trycloudflare.com', 'https://room.trycloudflare.com/x', 'https://room.trycloudflare.com/?room=OTB-ABC234',
      'https://room.trycloudflare.com/#x', 'https://room.trycloudflare.com.evil.test', 'javascript:alert(1)', 'file:///etc/passwd',
      'data:text/html,x', 'https://192.0.2.1', '',
    ]) {
      expect(publicEndpointOrigin(value), value).toBeUndefined();
    }
    expect(isPublicEndpointOrigin('https://room.trycloudflare.com')).toBe(true);
    expect(isPublicEndpointOrigin('https://room.trycloudflare.com/')).toBe(false);
  });

  it('labels the shipped Quick Tunnel provider as experimental, never as a production route', () => {
    expect(PUBLIC_ENDPOINT_PROVIDERS.map((provider) => [provider.id, provider.support]))
      .toEqual([['cloudflare-quick-tunnel', 'experimental']]);
  });

  it('keeps provider hostnames out of gameplay, lobby and domain code', () => {
    // Only the policy, the adapter that starts the tunnel and the separately deployed registry may name the provider host.
    const allowed = new Set([
      'packages/shared/src/endpointPolicy.ts',
      'apps/desktop/src/online/connectivity.ts',
      'services/room-registry/src/index.js',
    ]);
    const offenders: string[] = [];
    for (const root of ['apps/server/src', 'apps/client/src', 'apps/desktop/src', 'packages/shared/src', 'services/room-registry/src']) {
      for (const entry of readdirSync(path.join(repositoryRoot, root), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || /\.(?:test|spec|check)\./.test(entry.name) || !/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) continue;
        const file = path.relative(repositoryRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
        if (file.includes('/dev/')) continue;
        if (readFileSync(path.join(repositoryRoot, file), 'utf8').includes('trycloudflare') && !allowed.has(file)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
