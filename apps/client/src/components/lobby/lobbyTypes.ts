import type { CharacterId, PlayerColorId, TeamId } from '@monopoly/shared';

export interface LobbyPlayerView {
  id: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  /** The player's team; only meaningful while the room is in 2v2 mode. */
  teamId: TeamId;
  ready: boolean;
  connected: boolean;
}
