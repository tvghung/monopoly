/**
 * The random id of the Host process that serves `roomCode` at `endpoint` (`/_otb/room`), or undefined when the address does not
 * answer or has no such room. The id is public; comparing it with the one the resume ACK gave tells a new address of the same
 * Host (after a tunnel change) from another Host that happens to use the same room code.
 */
export async function fetchHostInstanceId(
  endpoint: string,
  roomCode: string,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): Promise<string | undefined> {
  try {
    const response = await fetcher(`${endpoint}/_otb/room?code=${encodeURIComponent(roomCode)}`, {
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { instanceId?: unknown };
    return typeof body.instanceId === 'string' && /^[0-9a-f-]{36}$/u.test(body.instanceId) ? body.instanceId : undefined;
  } catch {
    return undefined;
  }
}
