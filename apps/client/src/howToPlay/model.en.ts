import {
  BAIL_AMOUNT,
  CHANCE_TILE_INDICES,
  CHEST_TILE_INDICES,
  colorGroups,
  DEFAULT_EMERGENCY_RESCUE_SECONDS,
  DEFAULT_PAYMENT_SHORTFALL_SECONDS,
  DEFAULT_RECONNECT_GRACE_SECONDS,
  FORCED_SALE_PERCENT,
  FORCED_SALE_PROPOSAL_SECONDS,
  forcedSaleGrossValue,
  formatMoney,
  GO_REWARD,
  GO_TO_JAIL_TILE_INDEX,
  HOUSES_BEFORE_HOTEL,
  houseSaleRefund,
  JAIL_ROUND_LIMIT,
  JAIL_TILE_INDEX,
  MAX_PLAYERS_PER_GAME,
  MIN_PLAYERS_PER_GAME,
  OFFER_LIFETIME_SECONDS,
  RAILROAD_RENT_BY_COUNT,
  RAILROAD_TILE_INDICES,
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  REVIVE_WINDOW_SURVIVOR_TURNS,
  SOLO_COLOR_SET_RENT_PERCENT,
  START_TILE_INDEX,
  STARTING_CASH,
  TEAM_2V2_PLAYER_COUNT,
  TEAM_COLOR_SET_RENT_PERCENT,
  TEAM_NAME_MAX_LENGTH,
  tileState,
  UTILITY_RENT_MULTIPLIER_BOTH,
  UTILITY_RENT_MULTIPLIER_SINGLE,
  UTILITY_TILE_INDICES,
  type CardDeck,
  type Tile,
  type TileType,
} from '@monopoly/shared';
import { getTileDetails } from '../game/ui/property/propertyDetails';
import { getPropertyGroupVisualStyle } from '../game/ui/propertyVisualColors';
import { getTileName } from '../game/ui/formatters';
import { translate } from '../i18n/I18n';
import { buildCardList, getDeckName, summarizeDeck } from './cards';
import type { HowToPlayBlock, HowToPlayModel, HowToPlaySection, HowToPlaySectionId, HowToPlayTableRow } from './modelTypes';

const money = formatMoney;
const label = (text: string) => `“${text}”`;
const sections: Record<HowToPlaySectionId, string> = {
  goal: 'Goal and turns', buying: 'Buying property', rent: 'Collecting rent', building: 'Building houses and hotels',
  jail: 'Jail', tiles: 'Taxes and special spaces', 'chance-cards': 'Chance cards', 'chest-cards': 'Community Chest cards',
  trading: 'Trading', debt: 'Debt and bankruptcy', ending: 'Forfeiting and winning', 'team-play': '2v2 team play',
};
const paragraph = (text: string): HowToPlayBlock => ({ kind: 'paragraph', text });
const heading = (text: string): HowToPlayBlock => ({ kind: 'heading', text });
const list = (items: readonly string[]): HowToPlayBlock => ({ kind: 'list', items });
const steps = (items: readonly string[]): HowToPlayBlock => ({ kind: 'steps', items });
const table = (caption: string, columns: readonly string[], rows: readonly HowToPlayTableRow[]): HowToPlayBlock => ({ kind: 'table', caption, columns, rows });
const see = (id: HowToPlaySectionId) => label(sections[id]);
const duration = (seconds: number) => seconds >= 60 && seconds % 60 === 0
  ? `${seconds / 60} ${seconds / 60 === 1 ? 'minute' : 'minutes'}`
  : `${seconds} seconds`;
const multiplier = (percent: number) => `${percent / 100}×`;
const tileName = (index: number) => getTileName(index, 'en');
const tilesOfType = (type: TileType): Tile[] => tileState.filter(tile => tile.tileType === type);
const priceRange = (tiles: readonly Tile[]) => {
  const values = tiles.map(tile => tile.price ?? 0);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
};
const streetIndices = () => tileState.flatMap((tile, index) => tile.tileType === 'normal' ? [index] : [])
  .sort((a, b) => (tileState[a].price ?? 0) - (tileState[b].price ?? 0) || a - b);
const colorGroupKeys: Record<string, Parameters<typeof translate>[0]> = {
  brown: 'property.colorGroup.brown', lightblue: 'property.colorGroup.lightblue', pink: 'property.colorGroup.pink',
  orange: 'property.colorGroup.orange', red: 'property.colorGroup.red', yellow: 'property.colorGroup.yellow',
  green: 'property.colorGroup.green', blue: 'property.colorGroup.blue',
};
const districtRows = (describe: (indices: readonly number[]) => string): HowToPlayTableRow[] => Object.entries(colorGroups).map(([color, indices]) => ({
  cells: [translate(colorGroupKeys[color] ?? 'property.colorGroup.brown', 'en'), describe(indices)],
  accent: getPropertyGroupVisualStyle(color).color,
}));

function goalSection(): HowToPlaySection {
  const start = tileName(START_TILE_INDEX);
  return { id: 'goal', title: sections.goal, blocks: [
    paragraph('The goal is to be the last player in the game. If you run out of cash, have nothing left to sell, and still owe money, you go bankrupt and leave the game.'),
    list([
      `A game has ${MIN_PLAYERS_PER_GAME}–${MAX_PLAYERS_PER_GAME} players. Everyone starts on ${start} with ${money(STARTING_CASH)}.`,
      'The game rolls the dice to choose who goes first. Turns then move clockwise.',
      `On your turn, press ${label('Roll Dice')}. Roll both dice and move your token by their total.`,
      'Rolling doubles does not give you an extra turn. It only helps you get out of Jail.',
      'Follow the instructions for the space you land on: buy property, pay rent or tax, or draw a card. When you are done, the turn passes automatically.',
      `Collect ${money(GO_REWARD)} each time you pass or land on ${start}. You do not collect it when sent directly to Jail or when moving backward.`,
      `Turns have no timer. If the player whose turn it is disconnects, the game waits about ${duration(DEFAULT_RECONNECT_GRACE_SECONDS)} (by default), then skips that turn.`,
      `Want to play as a team? The host can choose ${label('2v2')} in the lobby. See ${see('team-play')}.`,
    ]),
  ] };
}

function buyingSection(): HowToPlaySection {
  return { id: 'buying', title: sections.buying, blocks: [
    paragraph('When you land on an unowned property, station, or utility, you can choose to buy it or pass.'),
    list([
      `${label('Buy Property')}: pay the price shown on the space. You need enough cash.`,
      `${label('Skip')}: leave it unowned. Another player can buy it when they land there. There are no auctions.`,
    ]),
    paragraph(`Prices are shown on each space. Properties cost ${priceRange(tilesOfType('normal'))}, stations cost ${priceRange(tilesOfType('railroad'))}, and utilities cost ${priceRange(tilesOfType('company'))}.`),
    table('Property groups and prices', ['District', 'Properties and prices'], districtRows(indices => indices.map(index => `${tileName(index)} ${money(tileState[index].price ?? 0)}`).join(' · '))),
    list([
      'A property stays yours for the rest of the game unless you sell or trade it.',
      `Select a space on the board to see its price, rent, and owner. ${label('My Properties')} lists everything you own.`,
    ]),
  ] };
}

function rentSection(): HowToPlaySection {
  const sorted = streetIndices();
  const cheapest = sorted[0];
  const dearest = sorted[sorted.length - 1];
  const ladder = (index: number) => getTileDetails(tileState[index], 'en').slice(0, (tileState[index].rentTiers?.length ?? 0) + 1);
  const cheapRows = ladder(cheapest);
  const dearRows = ladder(dearest);
  const stations = RAILROAD_TILE_INDICES.map(tileName).join(', ');
  const utilities = UTILITY_TILE_INDICES.map(tileName).join(', ');
  return { id: 'rent', title: sections.rent, blocks: [
    paragraph('When you land on a space owned by another player, you pay rent automatically. The owner still collects rent while in Jail. You never pay rent to yourself.'),
    heading('Properties'),
    list([
      'With no houses, pay the base rent shown on the deed.',
      `With 1 to ${HOUSES_BEFORE_HOTEL} houses, pay the amount for that number of houses.`,
      'With a hotel, pay the highest rent shown for that property.',
      `Owning a complete color group multiplies rent across the group by ${multiplier(SOLO_COLOR_SET_RENT_PERCENT)} (rounded down). You can build without owning the full group.`,
    ]),
    table('Rent examples for two properties', ['Rent tier', tileName(cheapest), tileName(dearest)], cheapRows.map((row, index) => ({ cells: [row.label, row.value ?? '', dearRows[index]?.value ?? ''] }))),
    paragraph('Each property has its own rent table. Select it on the board to see the details.'),
    heading('Stations'),
    paragraph(`There are ${RAILROAD_TILE_INDICES.length} stations (${stations}). Rent increases with the number of stations the owner has.`),
    table('Station rent', ['Stations owned', 'Rent'], RAILROAD_RENT_BY_COUNT.map((rent, index) => ({ cells: [`${index + 1}`, money(rent)] }))),
    heading('Utilities'),
    paragraph(`There are ${UTILITY_TILE_INDICES.length} utilities (${utilities}). Rent is based on the total of your dice roll.`),
    list([
      `If the owner has one utility, pay your dice total × ${UTILITY_RENT_MULTIPLIER_SINGLE}.`,
      `If the owner has both utilities, pay your dice total × ${UTILITY_RENT_MULTIPLIER_BOTH}.`,
      `For example, a roll of 7 means rent of ${money(7 * UTILITY_RENT_MULTIPLIER_SINGLE)} or ${money(7 * UTILITY_RENT_MULTIPLIER_BOTH)}.`,
    ]),
    paragraph(`Can't afford rent? See ${see('debt')}.`),
  ] };
}

function buildingSection(): HowToPlaySection {
  const example = tileState[streetIndices()[0]];
  return { id: 'building', title: sections.building, blocks: [
    paragraph('You can build only when you land on a property you own. The game will ask whether you want to build.'),
    list([
      `If the property has fewer than ${HOUSES_BEFORE_HOTEL} houses, add houses up to ${HOUSES_BEFORE_HOTEL}. A property with ${HOUSES_BEFORE_HOTEL - 1} houses can add one more.`,
      `Once it has ${HOUSES_BEFORE_HOTEL} houses, you can upgrade to a hotel. An upgrade costs the same as one house.`,
      'You cannot build more on a property that already has a hotel.',
      `Choose ${label('Skip')} if you do not want to build. You can build the next time you land there.`,
      'Stations and utilities cannot be developed.',
    ]),
    paragraph('Building costs depend on the property group.'),
    table('Building costs by district', ['District', 'Cost per house or hotel'], districtRows(indices => money(tileState[indices[0]].houseCost ?? 0))),
    paragraph(`Houses and hotels raise rent (see ${see('rent')}). You do not need to own the full group to build.`),
    heading('Selling buildings'),
    list([
      `Sell one building level back to the Bank at a time using ${label('Sell House')} while viewing your property. You get half the building cost. For example, selling a house on ${tileName(streetIndices()[0])} returns ${money(houseSaleRefund(example.houseCost ?? 0))}.`,
      `You cannot sell buildings one at a time while a debt is open. You can sell the whole property instead (see ${see('debt')}).`,
      'There are no mortgages.',
    ]),
  ] };
}

function jailSection(): HowToPlaySection {
  return { id: 'jail', title: sections.jail, blocks: [
    paragraph(`You are sent to Jail if you land on ${tileName(GO_TO_JAIL_TILE_INDEX)} or draw a Go to Jail card. Move directly to Jail without collecting for passing GO, and your turn ends.`,),
    paragraph(`Landing on ${tileName(JAIL_TILE_INDEX)} during a normal move means you are just visiting. Nothing happens.`),
    heading('Getting out of Jail'),
    list([
      'Roll doubles to get out and move by the number rolled. Your turn ends after that move. If you do not roll doubles, stay in Jail and end your turn.',
      `Pay ${money(BAIL_AMOUNT)} in bail before rolling, then move normally.`,
      'Use a Get Out of Jail Free card, then roll and move normally.',
      `Wait: the Jail panel shows ${label(`Wait: 1/${JAIL_ROUND_LIMIT}`)} on your first turn in Jail. On the next turn, the counter reaches ${JAIL_ROUND_LIMIT}/${JAIL_ROUND_LIMIT} and you are released before rolling.`,
    ]),
    paragraph('You can still collect rent and trade while in Jail.'),
  ] };
}

function tilesSection(): HowToPlaySection {
  const taxes = tilesOfType('expense').map(tile => ({ cells: [tileName(tileState.indexOf(tile)), `Pay ${money(tile.expenseAmount ?? 0)} to the Bank.`] }));
  const first = (type: TileType) => tileName(tileState.findIndex(tile => tile.tileType === type));
  return { id: 'tiles', title: sections.tiles, blocks: [
    table('Special spaces', ['Space', 'What happens when you land here'], [
      { cells: [first('start'), `Collect ${money(GO_REWARD)} when you pass or land here.`] },
      ...taxes,
      { cells: [first('chance'), 'Draw the top Chance card and follow its instructions.'] },
      { cells: [first('chest'), 'Draw the top Community Chest card and follow its instructions.'] },
      { cells: [first('jail'), 'Just visiting: nothing happens.'] },
      { cells: [first('gojail'), 'Go directly to Jail. Do not collect for passing GO, and your turn ends.'] },
      { cells: [first('parking'), 'Take a break. Collect and pay nothing.'] },
    ]),
    paragraph(`Taxes go to the Bank; no player receives them. Can't afford a tax? See ${see('debt')}.`),
  ] };
}

function deckSection(deck: CardDeck): HowToPlaySection {
  const id: HowToPlaySectionId = deck === 'chance' ? 'chance-cards' : 'chest-cards';
  const count = (deck === 'chance' ? CHANCE_TILE_INDICES : CHEST_TILE_INDICES).length;
  const name = getDeckName(deck, 'en');
  const cards = buildCardList(deck, 'en');
  return { id, title: sections[id], blocks: [
    paragraph(`When you land on one of the ${count} ${name} spaces, the top card is revealed immediately. Read it and press ${label('Close')} to resolve it.`,),
    paragraph('Cards are drawn in random order. Used cards go to the bottom of the deck. You keep a Get Out of Jail Free card until you use it.'),
    paragraph(summarizeDeck(deck, cards, 'en')),
    { kind: 'cards', label: `${name} card list`, cards },
  ] };
}

function tradingSection(): HowToPlaySection {
  return { id: 'trading', title: sections.trading, blocks: [
    paragraph('You can buy, sell, or trade with other players at any time during the game. You do not need to wait for your turn.'),
    steps([
      `Select a property owned by another player, then choose ${label('Make Offer')}.`,
      'Choose what you will give (cash, properties, or your Get Out of Jail Free card) and what you want in return.',
      `Press ${label('Send Offer')}. The other player can ${label('Accept')} or ${label('Decline')}.`,
    ]),
    list([
      `An offer lasts ${duration(OFFER_LIFETIME_SECONDS)}. If there is no response before it expires, it is cancelled.`,
      'Accepted trades take effect immediately and cannot be undone. Both players must have enough cash.',
      'Houses and hotels stay with their property and cannot be traded separately.',
      'You can offer only your own Get Out of Jail Free cards.',
      `Normal trades pause while a player owes money. During that time, offers can be made to buy the debtor's property (see ${see('debt')}).`,
      'In 2v2, trading with your teammate still uses real cash. There is no shared team wallet.',
    ]),
  ] };
}

function debtSection(): HowToPlaySection {
  const example = tileState[streetIndices()[0]];
  const price = example.price ?? 0;
  const houseCost = example.houseCost ?? 0;
  return { id: 'debt', title: sections.debt, blocks: [
    paragraph('If you need to pay rent, tax, or a card effect and do not have enough cash, the game uses all your cash first. The rest becomes a debt, and the game pauses until it is resolved.'),
    paragraph(`The ${label('Payment Due')} panel gives you about ${duration(DEFAULT_PAYMENT_SHORTFALL_SECONDS)} by default to raise cash:`),
    list([
      `${label('Sell to Bank')}: receive ${FORCED_SALE_PERCENT}% of the property's price plus its building value. ${tileName(streetIndices()[0])} sells for ${money(forcedSaleGrossValue(price, 0))} without houses, or ${money(forcedSaleGrossValue(price, 2 * houseCost))} with two houses.`,
      `${label('Ask a Player to Buy')}: choose a buyer and set a price. The suggested price starts at the Bank's value. The buyer must have enough cash and has ${duration(FORCED_SALE_PROPOSAL_SECONDS)} to respond.`,
      'Other players can offer cash for one or more of your properties while you are in debt. Accept or decline inside the Payment Due panel.',
    ]),
    paragraph('Once you have enough cash, the debt is paid and the game continues.'),
    list([
      'If time runs out, the game sells your properties to the Bank in board order until the debt is paid.',
      'If all your property is sold and you still owe money, you go bankrupt and leave the game. Your creditor receives only what you could pay. If you have nothing to sell, you go bankrupt immediately.',
      `In 2v2, your teammate may rescue you, and a bankrupt player may be revived (see ${see('team-play')}).`,
    ]),
  ] };
}

function endingSection(): HowToPlaySection {
  return { id: 'ending', title: sections.ending, blocks: [list([
    `Press ${label('Forfeit')} (the flag button in the upper-right corner) to stop playing. The game asks you to confirm.`,
    'When you forfeit, your cash and property return to the Bank. If you owe money, they are used to pay your debt first.',
    'After forfeiting, you can stay and watch or leave the room.',
    'Disconnecting or closing the window is not a forfeit. Rejoin from the same device to continue playing.',
    'When only one player remains, that player wins immediately.',
    `After the game, the host can press ${label('Play Again')} to start a new game in the same room.`,
  ])] };
}

function teamSection(): HowToPlaySection {
  const start = tileName(START_TILE_INDEX);
  return { id: 'team-play', title: sections['team-play'], blocks: [
    paragraph(`2v2 has exactly ${TEAM_2V2_PLAYER_COUNT} players on two teams of two. Everyone keeps their own cash and property, but teammates win and lose together.`),
    heading('Setting up teams'),
    list([
      `The host chooses ${label('Solo')} or ${label('2v2')} in the lobby before the game starts. Changing modes resets everyone's Ready status.`,
      'New players join the team with fewer members. Each team has two seats. Move to an open seat, or request a seat swap and wait for the other player to accept. Both players must ready up again if they switch teams. The host cannot move another player.',
      `Each team has a name (up to ${TEAM_NAME_MAX_LENGTH} characters) and a color. Team members can change their own team's name and color. The two teams must use different colors.`,
      'Your token uses your team color, so teammates choose different mascots. Opponents may use the same mascot.',
      `The host can start only when all ${TEAM_2V2_PLAYER_COUNT} players are present, each team has two players, and everyone is ready.`,
    ]),
    heading('Turns and rent'),
    list([
      'Turns alternate between teams: first player on Team A, first player on Team B, second player on Team A, then second player on Team B.',
      'You do not pay rent when landing on a teammate’s property, station, or utility. A Chance or Community Chest card can still make you pay a teammate.',
      `A complete color group owned by one player multiplies rent by ${multiplier(SOLO_COLOR_SET_RENT_PERCENT)}. If teammates together own the full group, rent is multiplied by ${multiplier(TEAM_COLOR_SET_RENT_PERCENT)}.`,
      'Stations and utilities owned by either teammate count together for rent.',
    ]),
    heading('Investing for a teammate'),
    list([
      'When you land on a teammate’s property, you can spend your own cash to build houses or upgrade its hotel.',
      'The property still belongs to your teammate. If the buildings are later sold, the refund goes to the property owner.',
      'Cash always belongs to each player. Teammates cannot pay each other’s debts, except through Emergency Rescue.',
    ]),
    heading('Bankruptcy, revival, and rescue'),
    list([
      'Bankruptcy affects one player at a time. A team loses when both teammates have left the game.',
      `After a teammate goes bankrupt, the survivor has ${REVIVE_WINDOW_SURVIVOR_TURNS} of their turns to revive them. Press ${label('Revive Teammate')} and pay ${money(REVIVE_COST)} to the Bank. They return to ${start} with ${money(REVIVE_STARTING_CASH)}, no property, and no cards.`,
      'Each player can be revived once. A player who forfeits cannot be revived. While waiting, a bankrupt player can watch and chat.',
      `Emergency Rescue: if you have sold everything and still owe money, your teammate can pay the full shortfall directly to your creditor within ${duration(DEFAULT_EMERGENCY_RESCUE_SECONDS)}. If they decline or time runs out, you go bankrupt as usual.`,
    ]),
    heading('Winning'),
    list([
      'A team wins when both players on the other team have left the game. Both winning teammates count as winners, including a teammate who was eliminated earlier.',
      `After the game, the host can press ${label('Play Again')}. The room keeps its mode, teams, team names, and colors. The host can switch to Solo before starting the next game.`,
    ]),
  ] };
}

export function buildEnglishHowToPlayModel(): HowToPlayModel {
  const sectionsModel = [
    goalSection(),
    buyingSection(),
    rentSection(),
    buildingSection(),
    jailSection(),
    tilesSection(),
    deckSection('chance'),
    deckSection('chest'),
    tradingSection(),
    debtSection(),
    endingSection(),
    teamSection(),
  ];
  return {
    title: translate('guide.title', 'en'),
    intro: translate('guide.intro', 'en'),
    sections: sectionsModel,
  };
}
