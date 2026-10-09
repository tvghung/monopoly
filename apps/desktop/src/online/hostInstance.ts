/**
 * Which Host process answers for a room at an endpoint: `/_otb/room` returns the helper's random per-process `instanceId`
 * (not a credential: it only tells two addresses of the same Host apart from two different Hosts). An Online Host is also
 * reachable on its LAN, so a joiner on that LAN finds the same room twice; equal ids mean one Host, not an ambiguity.
 */
export async function hostInstanceId(
  endpoint: string,
  roomCode: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await fetcher(`${endpoint}/_otb/room?code=${encodeURIComponent(roomCode)}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { instanceId?: unknown };
    return typeof body.instanceId === 'string' && /^[0-9a-f-]{36}$/u.test(body.instanceId) ? body.instanceId : undefined;
  } catch {
    return undefined;
  }
}
