import { describe, expect, it, vi } from 'vitest';
import { HttpRoomDiscovery, registryBaseUrl } from './discovery';

describe('HTTP room discovery', () => {
  it('validates configured registry origins', () => {
    expect(registryBaseUrl('https://rooms.example.com/')).toBe('https://rooms.example.com');
    expect(() => registryBaseUrl('http://rooms.example.com')).toThrow();
    expect(() => registryBaseUrl('https://user:pass@rooms.example.com')).toThrow();
  });

  it('keeps the ownership credential in Authorization and checks lookup identity', async () => {
    const fetcher = vi.fn((_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ proof: '12345678-1234-1234-1234-123456789012' }), { status: 201 }));
      return Promise.resolve(new Response(JSON.stringify({ roomCode: 'OTHER', target: { kind: 'socket-io-https', endpoint: 'https://host.trycloudflare.com' } })));
    });
    const discovery = new HttpRoomDiscovery('https://rooms.example.com', fetcher as typeof fetch);
    const reservation = await discovery.reserve('OTB-ABC234');
    expect(reservation.credential).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(fetcher.mock.calls[0][0]).toBe('https://rooms.example.com/v1/rooms/OTB-ABC234/reserve');
    expect(String(fetcher.mock.calls[0][1]?.headers &&
      (fetcher.mock.calls[0][1]?.headers as Record<string, string>).authorization)).toContain(reservation.credential);
    await expect(discovery.resolve('OTB-ABC234')).rejects.toThrow('REGISTRY_INVALID_RESPONSE');
  });

  it('rejects a public lookup that points outside the supported tunnel origin', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      roomCode: 'OTB-ABC234',
      target: { kind: 'socket-io-https', endpoint: 'https://attacker.example.com' },
    }))));
    const discovery = new HttpRoomDiscovery('https://rooms.example.com', fetcher);
    await expect(discovery.resolve('OTB-ABC234')).rejects.toThrow('REGISTRY_INVALID_RESPONSE');
  });
});
