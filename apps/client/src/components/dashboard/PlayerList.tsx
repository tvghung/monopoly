import PlayerHud from '../../game/ui/hud/PlayerHud';

export default function PlayerList({ activePlayerId }: { activePlayerId: string }) {
  return <PlayerHud activePlayerId={activePlayerId} />;
}
