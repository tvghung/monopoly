import type { CharacterId, PlayerColorId } from '@monopoly/shared';

export interface LobbyPlayerView {
  id: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  ready: boolean;
  connected: boolean;
}
