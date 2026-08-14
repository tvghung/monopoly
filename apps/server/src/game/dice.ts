import type {
  DiceValue,
  Die,
  GameState,
  PlayerId,
} from '@monopoly/shared';
import { sendToLog } from './text';

export const BOARD_SIZE = 40;
export const START_TILE = 0;
export const JAIL_TILE = 10;
export const START_REWARD = 200;

export type DiceRoller = () => DiceValue;

// Roll two dice server-side (the only source of truth for a roll).
export const rollDice: DiceRoller = () => {
  const rollOne = (): Die => Math.floor(Math.random() * 6) + 1;
  return { dice1: rollOne(), dice2: rollOne() };
};

export const diceTotal = (dice: DiceValue): number => dice.dice1 + dice.dice2;
export const isDouble = (dice: DiceValue): boolean => dice.dice1 === dice.dice2;

export interface StartingRollRound {
  contenders: PlayerId[];
  rolls: Record<PlayerId, DiceValue>;
}

export interface StartingPlayerResult {
  winner: PlayerId;
  rounds: StartingRollRound[];
}

/**
 * Dice determine only the first player. Ties are rerolled only among the
 * players tied at the current high score; the caller rotates the existing seat
 * order around the winner instead of sorting everybody by their rolls.
 */
export const chooseStartingPlayer = (
  seatOrder: PlayerId[],
  roller: DiceRoller = rollDice,
): StartingPlayerResult => {
  if (seatOrder.length === 0) throw new RangeError('Không có người chơi để chọn lượt đầu.');
  let contenders = [...seatOrder];
  const rounds: StartingRollRound[] = [];

  while (contenders.length > 1) {
    const rolls = Object.fromEntries(
      contenders.map((playerId) => [playerId, roller()]),
    ) as Record<PlayerId, DiceValue>;
    rounds.push({ contenders: [...contenders], rolls });
    const highest = Math.max(...contenders.map((playerId) => diceTotal(rolls[playerId])));
    contenders = contenders.filter((playerId) => diceTotal(rolls[playerId]) === highest);
  }

  return { winner: contenders[0], rounds };
};

export const rotateSeatOrder = (
  seatOrder: PlayerId[],
  firstPlayerId: PlayerId,
): PlayerId[] => {
  const firstIndex = seatOrder.indexOf(firstPlayerId);
  if (firstIndex < 0) throw new RangeError('Người đi đầu không thuộc thứ tự ghế.');
  return [...seatOrder.slice(firstIndex), ...seatOrder.slice(0, firstIndex)];
};

const awardStartReward = (state: GameState, playerId: PlayerId): void => {
  const player = state.players[playerId];
  if (!player) return;
  player.accountBalance += START_REWARD;
  sendToLog(state, `${player.name} đi qua Xuất Phát và nhận 200.000 ₫.`);
};

/** Move a relative number of tiles. Backward movement never earns a GO reward. */
export const moveBy = (
  state: GameState,
  playerId: PlayerId,
  steps: number,
): boolean => {
  const player = state.players[playerId];
  if (!player || !Number.isSafeInteger(steps)) return false;
  const from = player.currentTile;
  const unwrapped = from + steps;
  player.currentTile = ((unwrapped % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  if (steps > 0 && unwrapped >= BOARD_SIZE) awardStartReward(state, playerId);
  return true;
};

/**
 * Move clockwise to an absolute tile. Crossing or landing on index 0 pays the
 * start reward exactly once. Resolution of the destination is owned by the
 * card/tile engine, not this positioning helper.
 */
export const moveToTile = (
  state: GameState,
  playerId: PlayerId,
  destination: number,
): boolean => {
  const player = state.players[playerId];
  if (!player || !Number.isSafeInteger(destination) || destination < 0 || destination >= BOARD_SIZE) {
    return false;
  }
  const from = player.currentTile;
  player.currentTile = destination;
  if (from !== START_TILE && destination <= from) awardStartReward(state, playerId);
  return true;
};

/** Terminal movement: no pass-start reward and no Jail/Visiting resolution. */
export const moveToJail = (state: GameState, playerId: PlayerId): boolean => {
  const player = state.players[playerId];
  if (!player) return false;
  player.currentTile = JAIL_TILE;
  player.isJail = true;
  player.jailOpponentRoundsElapsed = 0;
  delete player.jailRounds;
  delete state.boardState.currentPlayer.doublesStreak;
  return true;
};

// Compatibility export for callers/tests; dice movement is forward movement.
export const movePlayer = moveBy;
