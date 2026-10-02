import type { ReactNode } from 'react';
import { buildDeedCardModel } from '../../../game/ui/property/deedCardModel';
import PropertyDeedCard from '../../../game/ui/property/PropertyDeedCard';
import { makeRoom } from '../../../game/presentation/testFixtures';

/** Every deed variant on fixture state, for the review captures (plan 04 §8.2). */
export default function DeedGallery() {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = {
    1: { id: 'player-a', color: 'red', houses: 2 },
    3: { id: 'player-b', color: 'blue', houses: 0 },
    5: { id: 'player-a', color: 'red', houses: 0 },
    15: { id: 'player-a', color: 'red', houses: 0 },
    12: { id: 'player-b', color: 'blue', houses: 0 },
    37: { id: 'player-b', color: 'blue', houses: 5 },
  };
  const model = (tileId: number) => buildDeedCardModel({
    tileId, state: room.gameState, roomPlayers: room.players, theme: 'v2',
  })!;
  const cell = (label: string, children: ReactNode) => (
    <figure style={{ margin: 0, display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
      <figcaption style={{ font: 'var(--type-caption)', color: 'var(--color-text-secondary)' }}>{label}</figcaption>
      {children}
    </figure>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '1.5rem', alignItems: 'flex-start' }}>
      {cell('Street, 2 Nhà (full)', <PropertyDeedCard model={model(1)} />)}
      {cell('Railroad, 2 owned (full)', <PropertyDeedCard model={model(5)} />)}
      {cell('Utility (full)', <PropertyDeedCard model={model(12)} />)}
      {cell('Hotel street (full)', <PropertyDeedCard model={model(37)} />)}
      {cell('Street (compact)', <PropertyDeedCard model={model(1)} variant="compact" />)}
      {cell('Unowned street (compact)', <PropertyDeedCard model={model(6)} variant="compact" />)}
      {cell('Special tile (tax)', <PropertyDeedCard model={model(4)} />)}
      {cell('Chips', (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <PropertyDeedCard model={model(1)} variant="chip" />
          <PropertyDeedCard model={model(37)} variant="chip" />
          <PropertyDeedCard model={model(5)} variant="chip" />
        </div>
      ))}
    </div>
  );
}
