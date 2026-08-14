import { useContext } from 'react';
import './style/Dashboard.css';
import MarketPlace from './MarketPlace';
import stateContext from '../internal';
import displayPositionsContext from '../displayPositionsContext';
import PlayerList from './dashboard/PlayerList';
import JailPanel from './dashboard/JailPanel';
import BuyPrompt from './dashboard/BuyPrompt';
import DevelopmentPrompt from './dashboard/DevelopmentPrompt';
import SellPrompts from './dashboard/SellPrompts';
import IncomingOffers from './dashboard/IncomingOffers';
import WinnerBanner from './dashboard/WinnerBanner';
import DebtPanel from './dashboard/DebtPanel';
import ForcedSaleProposalPanel from './dashboard/ForcedSaleProposalPanel';
import { usePresentation } from '../game/presentation/PresentationProvider';

export default function Dashboard() {
  const { state, playerId } = useContext(stateContext);
  const displayPositions = useContext(displayPositionsContext);
  const { state: presentationState } = usePresentation();

  // The buy prompt is driven by authoritative server state, which updates the
  // instant the move resolves — but the token is still walking there. Hold the
  // prompt until our token has actually reached its destination tile.
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const tokenArrived = !myPlayer
    || (displayPositions[playerId as string] ?? myPlayer.currentTile) === myPlayer.currentTile;

  const serverActiveId = state.boardState.currentPlayer.id;
  const activePlayerId = presentationState.displayActivePlayerId ?? serverActiveId;

  return (
    <section className="center__dashboard--container">
      <section className="center__dashboard">
        <div className="center__dashboard--brand" aria-hidden="true">
          CỜ TỶ PHÚ
          <span>VIỆT NAM</span>
        </div>

        <PlayerList activePlayerId={activePlayerId} />

        <section className="center__dashboard__block">
          <DebtPanel />
          <ForcedSaleProposalPanel />
          <JailPanel />
          <BuyPrompt tokenArrived={tokenArrived} />
          <DevelopmentPrompt tokenArrived={tokenArrived} />
          <SellPrompts />
          <IncomingOffers />
          <WinnerBanner />
        </section>
        <MarketPlace />
      </section>
    </section>
  );
}
