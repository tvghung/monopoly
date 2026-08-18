import { useContext } from 'react';
import './style/Dashboard.css';
import stateContext from '../internal';
import PlayerList from './dashboard/PlayerList';
import JailPanel from './dashboard/JailPanel';
import BuyPrompt from './dashboard/BuyPrompt';
import DevelopmentPrompt from './dashboard/DevelopmentPrompt';
import TradeOfferModal from './dashboard/TradeOfferModal';
import IncomingOffers from './dashboard/IncomingOffers';
import WinnerBanner from './dashboard/WinnerBanner';
import DebtPanel from './dashboard/DebtPanel';
import ForcedSaleProposalPanel from './dashboard/ForcedSaleProposalPanel';
import { usePresentation } from '../game/presentation/PresentationProvider';

export default function Dashboard() {
  const { state, playerId } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const settledPositions = presentationState.settledPositions;

  // The buy prompt is driven by authoritative server state, which updates the
  // instant the move resolves — but the token is still walking there. Hold the
  // prompt until our token has actually reached its destination tile.
  const myPlayer = typeof playerId === 'string' ? state.players[playerId] : undefined;
  const tokenArrived = !myPlayer
    || (settledPositions[playerId as string] ?? myPlayer.currentTile) === myPlayer.currentTile;

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
          <TradeOfferModal />
          <IncomingOffers />
          <WinnerBanner />
        </section>
      </section>
    </section>
  );
}
