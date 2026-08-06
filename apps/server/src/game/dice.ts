import type { GameState, DiceValue, Die } from '@monopoly/shared';
import { sendToLog } from './text';

const diceFaces: Record<number, Die> = {
  1: ['⚀', 1],
  2: ['⚁', 2],
  3: ['⚂', 3],
  4: ['⚃', 4],
  5: ['⚄', 5],
  6: ['⚅', 6],
};

// Roll two dice server-side (the only source of truth for a roll).
export const rollDice = (): DiceValue => {
  const rollOne = (): Die => diceFaces[Math.floor(Math.random() * 6) + 1];
  return { dice1: rollOne(), dice2: rollOne() };
};

// Advance a player `steps` tiles forward, granting the pass-GO bonus on wrap.
export const movePlayer = (state: GameState, playerId: string, steps: number): void => {
  const player = state.players[playerId];
  if (!player) return;
  const from = player.currentTile;
  if (from + steps < 40) {
    player.currentTile = from + steps;
  } else {
    player.currentTile = from + steps - 40;
    player.accountBalance += 200;
    sendToLog(state, `${player.name} has passed start and received $200M`);
  }
};
