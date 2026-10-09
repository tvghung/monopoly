import {
  areTeammates,
  BAIL_AMOUNT,
  colorGroupOfTile,
  colorGroups,
  colorSetRentPercent,
  effectiveRailroadOwnershipCount,
  effectiveUtilityOwnershipCount,
  forcedSaleGrossValue,
  railroadRentForCount,
  RAILROAD_TILE_INDICES,
  REVIVE_COST,
  tileState,
  UTILITY_TILE_INDICES,
  utilityRentMultiplier,
  type PlayerId,
  type PrivateOffer,
  type PublicGameState,
  type TradeBundle,
  BOT_THINKING_PAUSE_MS,
  estimateRollPresentationMs,
} from '@monopoly/shared';
import { seededRandom, type BotRandom } from './rng';
import type { BotView } from './view';

/**
 * The one Balanced bot policy: plain rules over public state, no network, no learning, no difficulty levels. It only reads a
 * `BotView`, and it only names a command and a payload; the server runs that command through the same rules as a human's.
 */

export type BotCommandName =
  | 'roll dice'
  | 'buy property'
  | 'do not buy'
  | 'resolve development'
  | 'draw card'
  | 'dismiss card'
  | 'pay bail'
  | 'use jail card'
  | 'wait in jail'
  | 'sell property to bank'
  | 'accept forced sale'
  | 'reject forced sale'
  | 'accept rescue'
  | 'decline rescue'
  | 'accept offer'
  | 'decline offer'
  | 'revive teammate';

export interface BotAction {
  command: BotCommandName;
  payload: unknown;
}

export type BotTaskKind =
  | 'TURN'
  | 'PURCHASE'
  | 'DEVELOP'
  | 'CARD'
  | 'DRAW_CARD'
  | 'DEBT'
  | 'RESCUE'
  | 'FORCED_SALE'
  | 'OFFER';

export interface BotTask {
  botId: PlayerId;
  kind: BotTaskKind;
  /** The public identity of the wait the bot answers; a different key means a different (or no longer open) question. */
  key: string;
}

export interface BotDecision {
  task: BotTask;
  action: BotAction;
  /** Always legal while the task is open; used when the first choice is refused. */
  fallback: BotAction;
  reason: string;
}

// ---- What the state is waiting for ----

/** The first wait any bot of the room must answer, in the order the server resolves them, or null. */
export function findBotTask(views: readonly BotView[]): BotTask | null {
  for (const view of views) {
    const task = botTaskOf(view);
    if (task) return task;
  }
  return null;
}

export function botTaskOf(view: BotView): BotTask | null {
  const { room, botId } = view;
  const game = room.gameState;
  const board = game.boardState;
  if (room.status !== 'IN_PROGRESS' || board.winner || !game.players[botId]) return null;
  const match = board.matchId ?? 'match';
  const task = (kind: BotTaskKind, identity: string): BotTask => ({ botId, kind, key: `${match}|${kind}|${identity}` });

  const shortfall = board.paymentShortfall;
  if (shortfall?.rescue) {
    return shortfall.rescue.rescuerPlayerId === botId ? task('RESCUE', shortfall.rescue.rescueId) : null;
  }
  // An offer is answered first: for a debtor a buyer's cash may beat the Bank's price, so it is weighed before selling.
  const offer = view.offers[0];
  if (offer) return task('OFFER', offer.offerId);
  if (shortfall && shortfall.debtorPlayerId === botId) {
    const sellable = shortfall.sellableProperties ?? [];
    if (sellable.length === 0 || !shortfall.paymentOperationId || !shortfall.claimId) return null;
    return task('DEBT', `${shortfall.paymentOperationId}|${shortfall.claimId}|${String(shortfall.remainingAmount)}|${String(sellable.length)}`);
  }
  const proposal = view.self.forcedSaleProposal;
  if (proposal && proposal.buyerPlayerId === botId) return task('FORCED_SALE', proposal.proposalId);
  if (shortfall || board.currentPlayer.id !== botId) return null;

  const card = game.turnInfo.pendingCardInteraction;
  if (card) {
    if (card.playerId !== botId) return null;
    return card.stage === 'REVEALED' ? task('CARD', card.operationId) : task('DRAW_CARD', card.operationId);
  }
  const landing = game.turnInfo.pendingLandingDecision;
  if (landing) {
    if (landing.playerId !== botId) return null;
    return task(landing.kind === 'PURCHASE' ? 'PURCHASE' : 'DEVELOP', landing.operationId);
  }
  if (board.currentPlayer.hasMoved) return null;
  const self = game.players[botId];
  const reviveWindows = board.teamPlay.reviveWindows.filter(window => window.survivorPlayerId === botId).length;
  return task('TURN', `${String(board.turnNumber)}|${String(board.rollSequence)}|${self.isJail ? 'jail' : 'free'}|${String(reviveWindows)}`);
}

// ---- Board knowledge from public state ----

const isAlly = (game: PublicGameState, botId: PlayerId, playerId: PlayerId): boolean => (
  playerId === botId || areTeammates(game, botId, playerId)
);

/** The rent a visitor would pay on an owned tile right now (utilities at an average roll of 7). */
export function currentRent(game: PublicGameState, tileID: number): number {
  const owned = game.boardState.ownedProps[tileID];
  const tile = tileState[tileID];
  if (!owned || !tile) return 0;
  if (tile.tileType === 'railroad') return railroadRentForCount(effectiveRailroadOwnershipCount(game, owned.id));
  if (tile.tileType === 'company') return 7 * utilityRentMultiplier(effectiveUtilityOwnershipCount(game, owned.id));
  const base = owned.houses > 0 ? tile.rentTiers?.[owned.houses - 1] ?? 0 : tile.rent ?? 0;
  return Math.floor(base * colorSetRentPercent(game, owned.id, tileID) / 100);
}

/** The highest rent an opponent of the bot could charge it on its next landing. */
export function maxOpponentRent(game: PublicGameState, botId: PlayerId): number {
  return Object.entries(game.boardState.ownedProps).reduce((highest, [tileKey, owned]) => (
    isAlly(game, botId, owned.id) ? highest : Math.max(highest, currentRent(game, Number(tileKey)))
  ), 0);
}

/** Cash the bot keeps for the rent it may meet: grows with the most dangerous opponent tile. */
export function cashReserve(game: PublicGameState, botId: PlayerId): number {
  return Math.min(650, Math.max(120, Math.round(120 + 0.6 * maxOpponentRent(game, botId))));
}

interface TileOutlook {
  value: number;
  completesSet: boolean;
  blocksSet: boolean;
}

/** What one tile is worth to the bot: its price (plus buildings) scaled by what owning it does to colour sets and stations. */
export function tileOutlook(game: PublicGameState, botId: PlayerId, tileID: number): TileOutlook {
  const tile = tileState[tileID];
  const owned = game.boardState.ownedProps[tileID];
  const base = (tile?.price ?? 0) + (owned?.houses ?? 0) * (tile?.houseCost ?? 0);
  let bonus = 0;
  let completesSet = false;
  let blocksSet = false;
  const group = colorGroupOfTile(tileID);
  if (group) {
    const others = colorGroups[group].filter(id => id !== tileID);
    const allyHeld = others.filter(id => {
      const holder = game.boardState.ownedProps[id]?.id;
      return holder !== undefined && isAlly(game, botId, holder);
    }).length;
    const opponentHolders = new Set(others
      .map(id => game.boardState.ownedProps[id]?.id)
      .filter((holder): holder is PlayerId => holder !== undefined && !isAlly(game, botId, holder)));
    if (allyHeld === others.length) {
      completesSet = true;
      bonus += 0.9;
    } else if (allyHeld >= 1 && opponentHolders.size === 0) {
      bonus += 0.35;
    }
    const opponentHeld = others.length - allyHeld
      - others.filter(id => game.boardState.ownedProps[id] === undefined).length;
    if (opponentHolders.size === 1 && opponentHeld === others.length) {
      blocksSet = true;
      bonus += 0.5;
    }
  } else if ((RAILROAD_TILE_INDICES as readonly number[]).includes(tileID)) {
    bonus += 0.25 * RAILROAD_TILE_INDICES.filter(id => id !== tileID
      && game.boardState.ownedProps[id] !== undefined
      && isAlly(game, botId, game.boardState.ownedProps[id].id)).length;
  } else if ((UTILITY_TILE_INDICES as readonly number[]).includes(tileID)) {
    const otherHeld = UTILITY_TILE_INDICES.some(id => id !== tileID
      && game.boardState.ownedProps[id] !== undefined
      && isAlly(game, botId, game.boardState.ownedProps[id].id));
    bonus += otherHeld ? 0.2 : -0.2;
  }
  return { value: Math.round(base * (1 + bonus)), completesSet, blocksSet };
}

/**
 * Whether giving `tileIDs` to `receiverId` would hand that opponent (with their team) a complete colour set. `leaving` are the
 * tiles the receiver gives the bot in the same trade: they no longer count as theirs.
 */
function completesOpponentSet(
  game: PublicGameState,
  botId: PlayerId,
  receiverId: PlayerId,
  tileIDs: number[],
  leaving: number[] = [],
): boolean {
  if (isAlly(game, botId, receiverId)) return false;
  const groups = new Set(tileIDs.map(colorGroupOfTile).filter((group): group is string => group !== null));
  return [...groups].some(group => colorGroups[group].every(id => {
    if (tileIDs.includes(id)) return true;
    if (leaving.includes(id)) return false;
    const holder = game.boardState.ownedProps[id]?.id;
    return holder !== undefined && (holder === receiverId || areTeammates(game, receiverId, holder));
  }));
}

const JAIL_CARD_VALUE = 50;

const bundleValue = (game: PublicGameState, botId: PlayerId, bundle: TradeBundle): number => (
  bundle.cash
  + bundle.propertyIds.reduce((total, tileID) => total + tileOutlook(game, botId, tileID).value, 0)
  + bundle.jailFreeCardIds.length * JAIL_CARD_VALUE
);

const bankSaleValue = (game: PublicGameState, tileID: number): number => {
  const tile = tileState[tileID];
  const houses = game.boardState.ownedProps[tileID]?.houses ?? 0;
  return forcedSaleGrossValue(tile?.price ?? 0, houses * (tile?.houseCost ?? 0));
};

// ---- Decisions ----

const action = (command: BotCommandName, payload: unknown = undefined): BotAction => ({ command, payload });

/** Near the threshold, comparable choices are broken by the seeded random value; far from it the rule decides alone. */
const nearThreshold = (margin: number, scale: number): boolean => Math.abs(margin) <= 0.08 * Math.max(scale, 1);

export function decideBotAction(view: BotView, task: BotTask, random?: BotRandom): BotDecision | null {
  const { room, botId } = view;
  const game = room.gameState;
  const board = game.boardState;
  const self = game.players[botId];
  if (!self) return null;
  const rng = random ?? seededRandom(room.roomId, board.matchId ?? '', board.turnNumber, board.rollSequence, botId, task.kind);
  const cash = self.accountBalance;
  const reserve = cashReserve(game, botId);
  const decision = (chosen: BotAction, fallback: BotAction, reason: string): BotDecision => ({
    task, action: chosen, fallback, reason,
  });

  switch (task.kind) {
    case 'TURN': {
      const window = board.teamPlay.reviveWindows.find(candidate => candidate.survivorPlayerId === botId);
      if (window && board.turnNumber > window.openedAtTurnNumber && cash - REVIVE_COST >= reserve + 200) {
        return decision(action('revive teammate'), action('roll dice'), `revive cash=${String(cash)} reserve=${String(reserve)}`);
      }
      if (!self.isJail) return decision(action('roll dice'), action('roll dice'), 'roll');
      const developedOpponentStreets = Object.entries(board.ownedProps).filter(([, owned]) => (
        owned.houses > 0 && !isAlly(game, botId, owned.id)
      )).length;
      const dangerous = developedOpponentStreets >= 3;
      const heldCards = view.self.heldJailFreeCardIds.length;
      if (dangerous) return decision(action('wait in jail'), action('roll dice'), `jail wait: ${String(developedOpponentStreets)} developed opponent streets`);
      if (heldCards > 0) return decision(action('use jail card'), action('roll dice'), 'jail card');
      if (cash - BAIL_AMOUNT >= reserve) return decision(action('pay bail'), action('roll dice'), `bail cash=${String(cash)}`);
      return decision(action('roll dice'), action('roll dice'), 'jail roll: keep cash');
    }
    case 'PURCHASE': {
      const landing = game.turnInfo.pendingLandingDecision;
      if (!landing || landing.kind !== 'PURCHASE') return null;
      const decline = action('do not buy', { operationId: landing.operationId });
      const price = landing.price ?? tileState[landing.tileID]?.price ?? 0;
      if (price <= 0 || cash < price) return decision(decline, decline, `cannot afford ${String(price)}`);
      const outlook = tileOutlook(game, botId, landing.tileID);
      const threshold = outlook.completesSet || outlook.blocksSet ? 0.5 * reserve : reserve;
      const margin = cash - price - threshold;
      const buy = nearThreshold(margin, threshold) ? rng() < 0.5 : margin >= 0;
      return decision(
        buy ? action('buy property', { operationId: landing.operationId }) : decline,
        decline,
        `${buy ? 'buy' : 'decline'} tile=${String(landing.tileID)} price=${String(price)} cash=${String(cash)} reserve=${String(reserve)} value=${String(outlook.value)}`,
      );
    }
    case 'DEVELOP': {
      const landing = game.turnInfo.pendingLandingDecision;
      if (!landing || landing.kind === 'PURCHASE') return null;
      const skip = action('resolve development', { operationId: landing.operationId, action: 'SKIP' });
      const unit = landing.unitCost ?? tileState[landing.tileID]?.houseCost ?? 0;
      if (unit <= 0) return decision(skip, skip, 'nothing to build');
      const owner = board.ownedProps[landing.tileID]?.id;
      const group = colorGroupOfTile(landing.tileID);
      const completeSet = group !== null && colorGroups[group].every(id => {
        const holder = board.ownedProps[id]?.id;
        return holder !== undefined && isAlly(game, botId, holder);
      });
      const factor = owner !== botId ? 1.1 : completeSet ? 0.8 : 1;
      const keep = reserve * factor;
      if (landing.kind === 'UPGRADE_HOTEL') {
        const build = cash - unit >= keep;
        return decision(
          build ? action('resolve development', { operationId: landing.operationId, action: 'UPGRADE_HOTEL' }) : skip,
          skip,
          `${build ? 'hotel' : 'skip hotel'} cost=${String(unit)} cash=${String(cash)} keep=${String(Math.round(keep))}`,
        );
      }
      const maxQuantity = Math.max(0, Math.min(4, landing.maxQuantity ?? 0));
      let quantity = 0;
      for (let candidate = maxQuantity; candidate >= 1; candidate -= 1) {
        if (cash - candidate * unit >= keep + 40) {
          quantity = candidate;
          break;
        }
      }
      return decision(
        quantity > 0
          ? action('resolve development', { operationId: landing.operationId, action: 'BUILD_HOUSES', quantity })
          : skip,
        skip,
        `build ${String(quantity)}/${String(maxQuantity)} unit=${String(unit)} cash=${String(cash)} keep=${String(Math.round(keep))}`,
      );
    }
    case 'CARD': {
      const card = game.turnInfo.pendingCardInteraction;
      if (!card) return null;
      const dismiss = action('dismiss card', { operationId: card.operationId });
      return decision(dismiss, dismiss, `card ${card.revealedCardId ?? ''}`);
    }
    case 'DRAW_CARD': {
      const card = game.turnInfo.pendingCardInteraction;
      if (!card) return null;
      const draw = action('draw card', { operationId: card.operationId });
      return decision(draw, draw, 'draw');
    }
    case 'DEBT': {
      const shortfall = board.paymentShortfall;
      const sellable = shortfall?.sellableProperties ?? [];
      if (!shortfall?.paymentOperationId || !shortfall.claimId || sellable.length === 0) return null;
      const sell = (tileID: number): BotAction => action('sell property to bank', {
        paymentOperationId: shortfall.paymentOperationId,
        claimId: shortfall.claimId,
        tileID,
      });
      const scored = sellable.map(candidate => ({
        tileID: candidate.tileID,
        gross: candidate.grossPrice,
        value: tileOutlook(game, botId, candidate.tileID).value,
      }));
      const covering = scored.filter(candidate => candidate.gross >= shortfall.remainingAmount);
      const choice = covering.length > 0
        ? covering.sort((left, right) => left.value - right.value || left.tileID - right.tileID)[0]
        : scored.sort((left, right) => (left.value / Math.max(1, left.gross)) - (right.value / Math.max(1, right.gross))
          || left.tileID - right.tileID)[0];
      const first = [...sellable].sort((left, right) => left.tileID - right.tileID)[0];
      return decision(sell(choice.tileID), sell(first.tileID), `sell tile=${String(choice.tileID)} raises=${String(choice.gross)} owes=${String(shortfall.remainingAmount)}`);
    }
    case 'RESCUE': {
      const rescue = board.paymentShortfall?.rescue;
      if (!rescue) return null;
      const decline = action('decline rescue', { rescueId: rescue.rescueId });
      const accept = cash - rescue.amount >= Math.max(100, 0.5 * reserve);
      return decision(
        accept ? action('accept rescue', { rescueId: rescue.rescueId }) : decline,
        decline,
        `${accept ? 'rescue' : 'no rescue'} amount=${String(rescue.amount)} cash=${String(cash)}`,
      );
    }
    case 'FORCED_SALE': {
      const proposal = view.self.forcedSaleProposal;
      if (!proposal) return null;
      const reject = action('reject forced sale', { proposalId: proposal.proposalId });
      const { value } = tileOutlook(game, botId, proposal.tileID);
      const accept = proposal.grossPrice <= 0.9 * value && cash - proposal.grossPrice >= reserve;
      return decision(
        accept ? action('accept forced sale', { proposalId: proposal.proposalId }) : reject,
        reject,
        `${accept ? 'buy' : 'reject'} forced sale tile=${String(proposal.tileID)} price=${String(proposal.grossPrice)} value=${String(value)}`,
      );
    }
    case 'OFFER': {
      const offer = view.offers.find(candidate => `${board.matchId ?? 'match'}|OFFER|${candidate.offerId}` === task.key);
      if (!offer) return null;
      const decline = action('decline offer', { offerId: offer.offerId });
      const accept = acceptsOffer(game, botId, offer, cash, reserve);
      return decision(
        accept.accept ? action('accept offer', { offerId: offer.offerId }) : decline,
        decline,
        `${accept.accept ? 'accept' : 'decline'} offer ${accept.reason}`,
      );
    }
    default:
      return null;
  }
}

/** A trade offered to the bot: accepted only when it clearly gains, keeps a cash cushion and hands no opponent a full set. */
export function acceptsOffer(
  game: PublicGameState,
  botId: PlayerId,
  offer: PrivateOffer,
  cash: number,
  reserve: number,
): { accept: boolean; reason: string } {
  if (offer.requested.cash > cash) return { accept: false, reason: 'not enough cash' };
  const shortfall = game.boardState.paymentShortfall;
  if (shortfall && shortfall.debtorPlayerId === botId) return acceptsDebtOffer(game, botId, offer, cash, shortfall);
  const gain = bundleValue(game, botId, offer.offered);
  const loss = bundleValue(game, botId, offer.requested);
  const cashAfter = cash - offer.requested.cash + offer.offered.cash;
  const handsSet = completesOpponentSet(game, botId, offer.proposerPlayerId, offer.requested.propertyIds, offer.offered.propertyIds);
  const enough = loss === 0 ? gain > 0 : gain >= 1.15 * loss;
  const accept = enough && cashAfter >= 0.5 * reserve && (!handsSet || gain >= 2 * loss);
  return { accept, reason: `gain=${String(gain)} loss=${String(loss)} cashAfter=${String(cashAfter)} handsSet=${String(handsSet)}` };
}

/**
 * A trade offered to the bot while it owes money. The whole bundle counts, both ways: cash it receives and pays, properties
 * and Get-Out-of-Jail cards it receives and gives, what they are worth to it, what they would raise from the Bank, the debt
 * still owed and whether an opponent completes a colour set. Accepted only when:
 * - it raises at least what selling the requested properties to the Bank would (liquidity, incoming tiles at Bank value);
 * - afterwards the debt can be paid (cash plus what is left to sell), so it never trades into bankruptcy anyway;
 * - when the debt could be paid without giving these items, it is also a fair trade by worth;
 * - it hands no opponent a full set unless paid at least twice what the items are worth to the bot.
 */
function acceptsDebtOffer(
  game: PublicGameState,
  botId: PlayerId,
  offer: PrivateOffer,
  cash: number,
  shortfall: NonNullable<PublicGameState['boardState']['paymentShortfall']>,
): { accept: boolean; reason: string } {
  const listedOrBank = (tileID: number): number => (
    shortfall.sellableProperties?.find(candidate => candidate.tileID === tileID)?.grossPrice ?? bankSaleValue(game, tileID)
  );
  const sum = (tileIDs: number[], value: (tileID: number) => number): number => tileIDs.reduce((total, id) => total + value(id), 0);
  const netCash = offer.offered.cash - offer.requested.cash;
  const outgoingBank = sum(offer.requested.propertyIds, listedOrBank);
  const liquid = netCash + sum(offer.offered.propertyIds, tileID => bankSaleValue(game, tileID));
  const outgoingWorth = bundleValue(game, botId, { ...offer.requested, cash: 0 });
  const incomingWorth = bundleValue(game, botId, { ...offer.offered, cash: 0 });
  // What the bot could still sell to the Bank without giving away the requested properties.
  const otherSellable = Object.entries(game.boardState.ownedProps)
    .filter(([tileKey, owned]) => owned.id === botId && !offer.requested.propertyIds.includes(Number(tileKey)))
    .reduce((total, [tileKey]) => total + listedOrBank(Number(tileKey)), 0);
  const paysAfter = cash + liquid + otherSellable >= shortfall.remainingAmount;
  const paysWithout = cash + otherSellable >= shortfall.remainingAmount;
  const fair = netCash + incomingWorth >= outgoingWorth;
  const handsSet = completesOpponentSet(game, botId, offer.proposerPlayerId, offer.requested.propertyIds, offer.offered.propertyIds);
  const accept = liquid > 0
    && liquid >= outgoingBank
    && paysAfter
    && (!paysWithout || fair)
    && (!handsSet || netCash + incomingWorth >= 2 * outgoingWorth);
  return {
    accept,
    reason: `debt net=${String(netCash)} liquid=${String(liquid)} bank=${String(outgoingBank)} worth=${String(incomingWorth)}/${String(outgoingWorth)} owed=${String(shortfall.remainingAmount)} paysAfter=${String(paysAfter)} paysWithout=${String(paysWithout)} handsSet=${String(handsSet)}`,
  };
}

// ---- Presentation timing ----

/**
 * How long the bot "thinks" before acting, in milliseconds at scale 1. Presentation only: after a roll it waits for what
 * clients show at normal speed (dice, walk, landing, GO moment; `estimateRollPresentationMs`) plus a thinking pause, so a
 * purchase follows the landing players see. Nothing waits for a client to finish animating.
 */
export function botActionDelayMs(view: BotView, task: BotTask): number {
  const dice = view.room.gameState.boardState.diceValue;
  const steps = Math.max(0, dice.dice1 + dice.dice2);
  const tile = view.room.gameState.players[view.botId]?.currentTile ?? 0;
  const passesGo = steps > 0 && tile < steps;
  const afterMove = Math.min(6000, estimateRollPresentationMs(steps, passesGo) + BOT_THINKING_PAUSE_MS);
  switch (task.kind) {
    case 'TURN': return view.room.gameState.players[view.botId]?.isJail ? 1300 : 1500;
    case 'PURCHASE':
    case 'DEVELOP': return afterMove;
    case 'CARD': return afterMove + 2200;
    case 'DRAW_CARD': return 800;
    case 'DEBT': return 1300;
    default: return 1500;
  }
}
