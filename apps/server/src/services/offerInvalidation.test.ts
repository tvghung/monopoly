import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InMemoryPersistenceStore } from '../persistence/inMemory.js';
import type { TradeOfferRecord } from '../persistence/types.js';
import { ROOM_SNAPSHOT_SCHEMA_VERSION, createRoomSnapshot, type RoomSnapshot } from '../rooms.js';
import { privatePlayerRoomName } from '../socket/broadcast.js';
import type { AppServer } from '../socket/types.js';
import { emitCancelledOffers } from './offerInvalidation.js';

describe('private cancellation event characterization', () => {
  it('preserves the OfferResult wire shape, persisted timestamp and fallback for both private recipients', async () => {
    const persistence = new InMemoryPersistenceStore<RoomSnapshot>();
    const now = new Date('2026-10-22T03:04:05.006Z');
    const proposerPlayerId = randomUUID();
    const recipientPlayerId = randomUUID();
    const room = await persistence.rooms.create({
      id: randomUUID(),
      code: 'A4-CANCEL',
      status: 'LOBBY',
      hostPlayerId: null,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: createRoomSnapshot(),
      nextActionAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const resolvedAt = new Date('2026-10-22T03:03:00.000Z');
    const records: TradeOfferRecord[] = [
      {
        id: 'offer-with-resolution-time',
        roomId: room.id,
        proposerPlayerId,
        recipientPlayerId,
        offered: { cash: 987_654, propertyIds: [1], jailFreeCardIds: [] },
        requested: { cash: 0, propertyIds: [2], jailFreeCardIds: ['chance-card-a4'] },
        status: 'CANCELLED',
        createdAt: new Date('2026-10-22T03:00:00.000Z'),
        expiresAt: new Date('2026-10-22T03:01:00.000Z'),
        resolvedAt,
      },
      {
        id: 'offer-without-resolution-time',
        roomId: room.id,
        proposerPlayerId: recipientPlayerId,
        recipientPlayerId: proposerPlayerId,
        offered: { cash: 876_543, propertyIds: [], jailFreeCardIds: [] },
        requested: { cash: 0, propertyIds: [3], jailFreeCardIds: [] },
        status: 'CANCELLED',
        createdAt: new Date('2026-10-22T03:00:01.000Z'),
        expiresAt: new Date('2026-10-22T03:01:01.000Z'),
        resolvedAt: null,
      },
    ];
    const emissions: Array<{ roomName: string; event: string; payload: unknown }> = [];
    const io = {
      to(roomName: string) {
        return {
          emit(event: string, payload: unknown) {
            emissions.push({ roomName, event, payload });
            return true;
          },
        };
      },
    } as unknown as AppServer;

    emitCancelledOffers(io, room, records, now);

    const expectedPayloads = [
      {
        offerId: records[0].id,
        status: 'CANCELLED',
        proposerPlayerId,
        recipientPlayerId,
        proposerName: 'Người chơi',
        recipientName: 'Người chơi',
        offered: records[0].offered,
        requested: records[0].requested,
        resolvedAt: resolvedAt.toISOString(),
      },
      {
        offerId: records[1].id,
        status: 'CANCELLED',
        proposerPlayerId: recipientPlayerId,
        recipientPlayerId: proposerPlayerId,
        proposerName: 'Người chơi',
        recipientName: 'Người chơi',
        offered: records[1].offered,
        requested: records[1].requested,
        resolvedAt: now.toISOString(),
      },
    ];
    expect(emissions).toEqual([
      { roomName: privatePlayerRoomName(proposerPlayerId), event: 'offer cancelled', payload: expectedPayloads[0] },
      { roomName: privatePlayerRoomName(recipientPlayerId), event: 'offer cancelled', payload: expectedPayloads[0] },
      { roomName: privatePlayerRoomName(recipientPlayerId), event: 'offer cancelled', payload: expectedPayloads[1] },
      { roomName: privatePlayerRoomName(proposerPlayerId), event: 'offer cancelled', payload: expectedPayloads[1] },
    ]);
    expect(Object.keys(emissions[0].payload as object).sort()).toEqual([
      'offerId', 'status', 'proposerPlayerId', 'recipientPlayerId', 'proposerName',
      'recipientName', 'offered', 'requested', 'resolvedAt',
    ].sort());
    expect(JSON.stringify(emissions.map(({ payload }) => payload)))
      .toBe(JSON.stringify([expectedPayloads[0], expectedPayloads[0], expectedPayloads[1], expectedPayloads[1]]));
  });
});
