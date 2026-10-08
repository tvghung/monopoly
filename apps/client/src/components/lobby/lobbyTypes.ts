import type { CharacterId, PlayerColorId, PlayerKind, TeamId, TeamSlot } from '@monopoly/shared';

export interface LobbyPlayerView {
  id: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  /** The player's team; only meaningful while the room is in 2v2 mode. */
  teamId: TeamId;
  /** The seat inside the team (0 or 1); only meaningful in a 2v2 lobby, where it decides which cell of the team the seat is. */
  teamSlot: TeamSlot;
  ready: boolean;
  connected: boolean;
  /** A BOT seat is played by the host; it is always Ready and present. */
  kind: PlayerKind;
}
