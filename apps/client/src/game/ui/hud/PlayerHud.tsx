import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import stateContext from '../../../internal';
import { usePresentation } from '../../presentation/PresentationProvider';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import { presentationTiming } from '../../presentation/timings';
import { formatMoney } from '../formatters';
import PlayerCard from './PlayerCard';
import { selectPlayerHudViewModels } from './playerHudSelectors';
import './PlayerHud.css';

function clearBalanceDeltaTimers(timers: Map<string, number>): void {
  timers.forEach(timer => window.clearTimeout(timer));
  timers.clear();
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function balanceAnnouncement(signal: BalanceDeltaSignal, playerName: string): string {
  return `${playerName} ${signal.delta > 0 ? 'nhận' : 'mất'} ${formatMoney(Math.abs(signal.delta))}.`;
}

export default function PlayerHud({ activePlayerId }: { activePlayerId: string }) {
  const { state, roomPlayers = [] } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const activePlayerName = state.players[activePlayerId]?.name;
  const players = state.loaded ? selectPlayerHudViewModels(state, activePlayerId, roomPlayers) : [];
  const [visibleBalanceDeltaIds, setVisibleBalanceDeltaIds] = useState<Set<string>>(() => new Set());
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const balanceDeltaTimersRef = useRef(new Map<string, number>());
  const balanceDeltaActiveUntilRef = useRef(new Map<string, number>());
  const knownBalanceDeltaIdsRef = useRef(new Set<string>());
  const resetEpochRef = useRef(presentationState.presentationResetEpoch);
  const previousActivePlayerIdRef = useRef(activePlayerId);

  useEffect(() => () => {
    clearBalanceDeltaTimers(balanceDeltaTimersRef.current);
  }, []);

  useEffect(() => {
    const signals = presentationState.balanceDeltas;
    const currentIds = new Set(signals.map(signal => signal.id));
    const now = Date.now();

    if (resetEpochRef.current !== presentationState.presentationResetEpoch) {
      resetEpochRef.current = presentationState.presentationResetEpoch;
      knownBalanceDeltaIdsRef.current = currentIds;
      balanceDeltaActiveUntilRef.current.clear();
      clearBalanceDeltaTimers(balanceDeltaTimersRef.current);
      setVisibleBalanceDeltaIds(current => current.size === 0 ? current : new Set());
      setLiveAnnouncement('');
      previousActivePlayerIdRef.current = activePlayerId;
      return;
    }

    const newlyEmitted = signals.filter(signal => !knownBalanceDeltaIdsRef.current.has(signal.id));
    knownBalanceDeltaIdsRef.current = currentIds;
    newlyEmitted.forEach(signal => {
      balanceDeltaActiveUntilRef.current.set(
        signal.id,
        now + presentationTiming.feedbackDwell,
      );
    });

    balanceDeltaActiveUntilRef.current.forEach((activeUntil, id) => {
      if (!currentIds.has(id) || activeUntil <= now) {
        balanceDeltaActiveUntilRef.current.delete(id);
        const timer = balanceDeltaTimersRef.current.get(id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          balanceDeltaTimersRef.current.delete(id);
        }
        return;
      }
      if (balanceDeltaTimersRef.current.has(id)) return;
      const timer = window.setTimeout(() => {
        balanceDeltaTimersRef.current.delete(id);
        balanceDeltaActiveUntilRef.current.delete(id);
        setVisibleBalanceDeltaIds(current => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, activeUntil - now);
      balanceDeltaTimersRef.current.set(id, timer);
    });

    const nextVisibleIds = new Set(
      [...balanceDeltaActiveUntilRef.current.entries()]
        .filter(([, activeUntil]) => activeUntil > now)
        .map(([id]) => id),
    );
    setVisibleBalanceDeltaIds(current => setsEqual(current, nextVisibleIds) ? current : nextVisibleIds);

    const latestNewSignal = newlyEmitted.at(-1);
    if (latestNewSignal && latestNewSignal.delta !== 0) {
      const playerName = state.players[latestNewSignal.playerId]?.name ?? 'Người chơi';
      setLiveAnnouncement(balanceAnnouncement(latestNewSignal, playerName));
    }
  }, [activePlayerId, presentationState.balanceDeltas, presentationState.presentationResetEpoch, state.players]);

  useEffect(() => {
    if (previousActivePlayerIdRef.current === activePlayerId) return;
    previousActivePlayerIdRef.current = activePlayerId;
    if (activePlayerName) setLiveAnnouncement(`Đến lượt ${activePlayerName}.`);
  }, [activePlayerId, activePlayerName]);

  const latestBalanceDeltas = useMemo(() => {
    const byPlayer = new Map<string, BalanceDeltaSignal>();
    presentationState.balanceDeltas
      .filter(signal => visibleBalanceDeltaIds.has(signal.id))
      .forEach(signal => byPlayer.set(signal.playerId, signal));
    return byPlayer;
  }, [presentationState.balanceDeltas, visibleBalanceDeltaIds]);

  return (
    <section className="player-hud" aria-label="Trạng thái người chơi">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveAnnouncement}</p>
      {state.loaded
        ? (
          <ul className="player-list">
            {players.map(player => (
              <PlayerCard
                key={player.playerId}
                player={player}
                balanceDelta={latestBalanceDeltas.get(player.playerId)}
              />
            ))}
          </ul>
        )
        : 'Đang tải…'}
    </section>
  );
}
