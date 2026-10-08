/**
 * Which public origins may serve an Online Host, in one place. The connectivity adapter that opened the route (today the
 * bundled Cloudflare Quick Tunnel) is the only code that knows how it is created; everything that only needs to accept or
 * refuse an origin (invitation links, CORS, the registry answer, the page a browser loaded) asks this module. A new adapter
 * means one new provider entry here, nothing in gameplay, lobby or domain code.
 */
// The WHATWG URL parser exists in every runtime of this package (browsers, Node); `types: []` keeps DOM and Node typings out
// of it, so the part used here is declared for this module only.
interface ParsedUrl {
  protocol: string;
  username: string;
  password: string;
  port: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
}
declare const URL: new (input: string) => ParsedUrl;

export interface PublicEndpointProvider {
  id: string;
  label: string;
  /** Exact hostname rule of a public origin this provider issues. */
  hostname: RegExp;
  /**
   * `experimental`: no uptime guarantee, temporary hostnames (Cloudflare documents Quick Tunnels as development/testing
   * infrastructure). A supportable production route (for example a named tunnel on the owner's domain) would be `supported`.
   */
  support: 'experimental' | 'supported';
}

export const PUBLIC_ENDPOINT_PROVIDERS: readonly PublicEndpointProvider[] = [
  {
    id: 'cloudflare-quick-tunnel',
    label: 'Cloudflare Quick Tunnel',
    // `api.trycloudflare.com` is Cloudflare's own service host, never a tunnel.
    hostname: /^(?!api\.)[a-z0-9-]+\.trycloudflare\.com$/,
    support: 'experimental',
  },
];

/** The provider of an https origin, or undefined. */
export function publicEndpointProvider(origin: string): PublicEndpointProvider | undefined {
  let url: ParsedUrl;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
  return PUBLIC_ENDPOINT_PROVIDERS.find(provider => provider.hostname.test(url.hostname));
}

/**
 * The canonical origin of a public Online Host endpoint: https, a provider hostname, no port, credentials, path, query or
 * fragment. Anything else (other schemes, other hosts, a path) is undefined.
 */
export function publicEndpointOrigin(value: string): string | undefined {
  let url: ParsedUrl;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  // Checked on the parsed URL: `origin` would drop credentials and so hide them.
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return undefined;
  return publicEndpointProvider(url.origin) ? url.origin : undefined;
}

/** Whether a browser `Origin` header (exactly an origin) names a public Online Host endpoint. */
export function isPublicEndpointOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === origin && publicEndpointOrigin(origin) === origin;
  } catch {
    return false;
  }
}
