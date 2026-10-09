import { describe, expect, it, vi } from 'vitest';
import { hostInstanceId } from './hostInstance';

const ID = '00000000-0000-4000-8000-000000000042';

describe('host instance id lookup', () => {
  it('reads the id the room probe answers with, and nothing for a missing room, a bad body or a network error', async () => {
    const answer = (response: Response | Error) => vi.fn(() => (
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
    ));
    expect(await hostInstanceId('http://192.168.1.5:43123', 'OTB-ABC234', answer(Response.json({ instanceId: ID })))).toBe(ID);
    expect(await hostInstanceId('http://192.168.1.5:43123', 'OTB-ABC234', answer(new Response(null, { status: 404 })))).toBeUndefined();
    expect(await hostInstanceId('http://192.168.1.5:43123', 'OTB-ABC234', answer(Response.json({ instanceId: 'x' })))).toBeUndefined();
    expect(await hostInstanceId('http://192.168.1.5:43123', 'OTB-ABC234', answer(new Error('ECONNREFUSED')))).toBeUndefined();
    const fetcher = answer(Response.json({ instanceId: ID }));
    await hostInstanceId('https://room.trycloudflare.com', 'OTB ABC', fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://room.trycloudflare.com/_otb/room?code=OTB%20ABC', expect.objectContaining({ redirect: 'error' }));
  });
});
