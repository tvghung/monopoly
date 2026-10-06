import { describe, expect, it } from 'vitest';
import {
  BAIL_AMOUNT,
  chanceCards,
  chestCards,
  colorGroups,
  DEFAULT_EMERGENCY_RESCUE_SECONDS,
  DEFAULT_PAYMENT_SHORTFALL_SECONDS,
  DEFAULT_RECONNECT_GRACE_SECONDS,
  FORCED_SALE_PERCENT,
  FORCED_SALE_PROPOSAL_SECONDS,
  forcedSaleGrossValue,
  formatMoney,
  GO_REWARD,
  HOUSES_BEFORE_HOTEL,
  houseSaleRefund,
  JAIL_ROUND_LIMIT,
  MAX_PLAYERS_PER_GAME,
  MIN_PLAYERS_PER_GAME,
  OFFER_LIFETIME_SECONDS,
  RAILROAD_RENT_BY_COUNT,
  REVIVE_COST,
  REVIVE_STARTING_CASH,
  REVIVE_WINDOW_SURVIVOR_TURNS,
  SOLO_COLOR_SET_RENT_PERCENT,
  STARTING_CASH,
  TEAM_2V2_PLAYER_COUNT,
  TEAM_COLOR_SET_RENT_PERCENT,
  TEAM_NAME_MAX_LENGTH,
  tileState,
  UTILITY_RENT_MULTIPLIER_BOTH,
  UTILITY_RENT_MULTIPLIER_SINGLE,
  type GameCard,
} from '@monopoly/shared';
import { cardVisualFor } from '../game/ui/events/cardVisuals';
import { JAIL_ROUND_LIMIT as HUD_JAIL_ROUND_LIMIT } from '../game/ui/hud/playerCardText';
import { buildCardList, classifyCard, describeCardNote, summarizeDeck } from './cards';
import { buildHowToPlayModel, formatDuration, rentMultiplierText } from './model';
import {
  HOW_TO_PLAY_TITLE,
  SECTION_TITLES,
  type HowToPlayBlock,
  type HowToPlayModel,
  type HowToPlaySection,
  type HowToPlaySectionId,
} from './modelTypes';

const model = buildHowToPlayModel();

const section = (id: HowToPlaySectionId): HowToPlaySection => {
  const found = model.sections.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing section ${id}`);
  return found;
};

/** Every sentence of a block, flattened, so a test can search the text a player would read. */
function blockText(block: HowToPlayBlock): string[] {
  switch (block.kind) {
    case 'paragraph':
    case 'heading':
      return [block.text];
    case 'list':
    case 'steps':
      return [...block.items];
    case 'table':
      return [block.caption, ...block.columns, ...block.rows.flatMap((row) => row.cells)];
    case 'cards':
      return [block.label, ...block.cards.flatMap((card) => [
        card.title, card.message, card.kindLabel, ...(card.note ? [card.note] : []),
      ])];
  }
}

const sectionText = (id: HowToPlaySectionId): string => section(id).blocks.flatMap(blockText).join('\n');

const modelStrings = (candidate: HowToPlayModel): string[] => [
  candidate.title,
  candidate.intro,
  ...candidate.sections.flatMap((entry) => [entry.title, ...entry.blocks.flatMap(blockText)]),
];

const allText = modelStrings(model).join('\n');

describe('how-to-play model structure', () => {
  it('names the guide and has the eleven topics of the owner request plus the 2v2 chapter, in reading order', () => {
    expect(model.title).toBe('Hướng dẫn chơi');
    expect(model.title).toBe(HOW_TO_PLAY_TITLE);
    expect(model.sections.map((entry) => entry.title)).toEqual([
      'Mục tiêu và lượt chơi',
      'Mua đất',
      'Thu tiền thuê',
      'Xây nhà và công trình',
      'Nhà Tù',
      'Thuế và ô đặc biệt',
      'Thẻ Cơ Hội',
      'Thẻ Khí Vận',
      'Giao dịch mua bán',
      'Nợ và phá sản',
      'Bỏ cuộc và chiến thắng',
      'Chơi đội 2v2',
    ]);
    expect(model.sections.map((entry) => entry.id)).toEqual([
      'goal', 'buying', 'rent', 'building', 'jail', 'tiles', 'chance-cards', 'chest-cards', 'trading', 'debt', 'ending', 'team-play',
    ]);
    for (const entry of model.sections) expect(entry.title).toBe(SECTION_TITLES[entry.id]);
  });

  it('opens with a short friendly introduction', () => {
    expect(model.intro.length).toBeGreaterThan(20);
    expect(model.intro.length).toBeLessThan(200);
    expect(model.intro).toContain('Cờ Tỷ Phú Việt Nam');
  });

  it('is pure: building it twice gives the same guide', () => {
    expect(buildHowToPlayModel()).toEqual(model);
  });

  it('has real content in every section and no empty sentence anywhere', () => {
    for (const entry of model.sections) expect(entry.blocks.length).toBeGreaterThan(0);
    for (const text of modelStrings(model)) expect(text.trim().length, text).toBeGreaterThan(0);
  });

  it('gives every table a caption, a header cell per column and a full row of cells', () => {
    for (const entry of model.sections) {
      for (const block of entry.blocks) {
        if (block.kind !== 'table') continue;
        expect(block.caption.length).toBeGreaterThan(0);
        expect(block.rows.length).toBeGreaterThan(0);
        for (const row of block.rows) expect(row.cells).toHaveLength(block.columns.length);
      }
    }
  });

  it('points to other sections only by their real titles', () => {
    const titles = new Set<string>(Object.values(SECTION_TITLES));
    const references = [...allText.matchAll(/xem mục “([^”]+)”/gu)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(titles.has(reference), reference).toBe(true);
  });

  it('keeps the text plain: Vietnamese, no technical or English words', () => {
    expect(allText).not.toMatch(/\b(?:server|socket|token|api|json|websocket|client|bug|click|button|player|room|turn)\b/iu);
    expect(allText).not.toMatch(/\$|USD|undefined|NaN|\[object/u);
  });
});

describe('every number in the text comes from the shared data', () => {
  it('only mentions amounts that exist in the shared board data, cards or rules', () => {
    const units = new Set<number>([STARTING_CASH, GO_REWARD, BAIL_AMOUNT]);
    for (const tile of tileState) {
      for (const value of [tile.price, tile.rent, tile.houseCost, tile.expenseAmount, ...(tile.rentTiers ?? [])]) {
        if (typeof value === 'number') units.add(value);
      }
      if (tile.tileType === 'normal') {
        for (let houses = 0; houses <= HOUSES_BEFORE_HOTEL + 1; houses += 1) {
          units.add(forcedSaleGrossValue(tile.price ?? 0, houses * (tile.houseCost ?? 0)));
        }
        units.add(houseSaleRefund(tile.houseCost ?? 0));
      }
    }
    for (const card of [...chanceCards, ...chestCards]) {
      for (const value of [card.reward, card.penalty, card.payEachPlayer, card.collectFromEachPlayer]) {
        if (typeof value === 'number') units.add(value);
      }
    }
    for (const rent of RAILROAD_RENT_BY_COUNT) units.add(rent);
    // The Công Ty example rolls a 7.
    units.add(7 * UTILITY_RENT_MULTIPLIER_SINGLE);
    units.add(7 * UTILITY_RENT_MULTIPLIER_BOTH);
    const allowed = new Set([...units].map((unit) => formatMoney(unit)));

    const amounts = [...allText.matchAll(/\d{1,3}(?:\.\d{3})*\s₫/gu)].map((match) => match[0]);
    expect(amounts.length).toBeGreaterThan(60);
    for (const amount of amounts) expect(allowed.has(amount), amount).toBe(true);
  });

  it('formats money with the shared formatter, never a hand-written currency', () => {
    expect(formatMoney(STARTING_CASH)).toBe('1.500.000 ₫');
    expect(allText).not.toMatch(/\d\s?(?:đồng|vnđ|vnd|k\b|nghìn)/iu);
    // A number written with thousands separators is money, so it always carries the symbol.
    expect(allText).not.toMatch(/\d{1,3}(?:\.\d{3})+(?!\.?\d)(?!\s₫)/u);
  });

  it('goal: players, starting cash, the Xuất Phát reward and the disconnect wait', () => {
    const text = sectionText('goal');
    expect(text).toContain(`từ ${MIN_PLAYERS_PER_GAME} đến ${MAX_PLAYERS_PER_GAME} người chơi`);
    expect(text).toContain(`ô ${tileState[0].streetName} với ${formatMoney(STARTING_CASH)}`);
    expect(text).toContain(`nhận ${formatMoney(GO_REWARD)}`);
    expect(text).toContain(`khoảng ${formatDuration(DEFAULT_RECONNECT_GRACE_SECONDS)} (mặc định)`);
    expect(text).toContain('không được đi thêm lượt');
  });

  it('buying: the price range and one row per district with every street price', () => {
    const text = sectionText('buying');
    const streetPrices = tileState.filter((tile) => tile.tileType === 'normal').map((tile) => tile.price ?? 0);
    expect(text).toContain(
      `Ô đất giá từ ${formatMoney(Math.min(...streetPrices))} đến ${formatMoney(Math.max(...streetPrices))}`,
    );
    expect(text).toContain(`mỗi Ga giá ${formatMoney(tileState[5].price ?? 0)}`);
    expect(text).toContain(`mỗi Công Ty giá ${formatMoney(tileState[12].price ?? 0)}`);
    expect(text).toContain('không có đấu giá');

    const districts = section('buying').blocks.find((block) => block.kind === 'table');
    if (districts?.kind !== 'table') throw new Error('Expected the district table');
    expect(districts.rows).toHaveLength(Object.keys(colorGroups).length);
    Object.values(colorGroups).forEach((indices, rowIndex) => {
      const cell = districts.rows[rowIndex].cells[1];
      for (const index of indices) {
        expect(cell).toContain(`${tileState[index].streetName} ${formatMoney(tileState[index].price ?? 0)}`);
      }
      expect(districts.rows[rowIndex].accent).toMatch(/^#[0-9a-f]{6}$/iu);
    });
  });

  it('rent: the Ga ladder, the Công Ty multipliers and a street example from tile data', () => {
    const text = sectionText('rent');
    RAILROAD_RENT_BY_COUNT.forEach((rent, index) => {
      expect(text).toContain(`${index + 1} Ga\n${formatMoney(rent)}`);
    });
    expect(text).toContain(`nhân ${UTILITY_RENT_MULTIPLIER_SINGLE}`);
    expect(text).toContain(`nhân ${UTILITY_RENT_MULTIPLIER_BOTH}`);
    expect(text).toContain(`bạn trả ${formatMoney(7 * UTILITY_RENT_MULTIPLIER_SINGLE)} hoặc ${formatMoney(7 * UTILITY_RENT_MULTIPLIER_BOTH)}`);
    // Solo: a completed colour set multiplies every rent of the district; it no longer says the set changes nothing.
    expect(text).toContain(`Sở hữu cả khu màu: tiền thuê của mọi ô trong khu nhân ${rentMultiplierText(SOLO_COLOR_SET_RENT_PERCENT)}`);
    expect(text).not.toContain('không làm tiền thuê tăng thêm');
    expect(text).toContain('Chủ ô vẫn nhận tiền thuê dù đang ở tù');

    const example = section('rent').blocks.find((block) => block.kind === 'table' && block.columns.length === 3);
    if (example?.kind !== 'table') throw new Error('Expected the rent example table');
    const cheapest = tileState[1];
    const dearest = tileState[39];
    expect(example.columns).toEqual(['Mức thuê', cheapest.streetName, dearest.streetName]);
    // Base rent, then the five tiers: the same numbers the deed card shows.
    expect(example.rows).toHaveLength(1 + (cheapest.rentTiers?.length ?? 0));
    expect(example.rows[0].cells).toEqual(['Tiền thuê cơ bản', formatMoney(cheapest.rent ?? 0), formatMoney(dearest.rent ?? 0)]);
    expect(example.rows[1].cells).toEqual(['Có 1 Nhà', formatMoney(cheapest.rentTiers?.[0] ?? 0), formatMoney(dearest.rentTiers?.[0] ?? 0)]);
    expect(example.rows[5].cells).toEqual(['Có Khách Sạn', formatMoney(cheapest.rentTiers?.[4] ?? 0), formatMoney(dearest.rentTiers?.[4] ?? 0)]);
  });

  it('building: the Nhà limit, the Khách Sạn upgrade, the cost of each district and the half refund', () => {
    const text = sectionText('building');
    expect(text).toContain(`chưa đủ ${HOUSES_BEFORE_HOTEL} Nhà`);
    expect(text).toContain(`đã đủ ${HOUSES_BEFORE_HOTEL} Nhà: bạn có thể nâng cấp lên Khách Sạn`);
    expect(text).toContain('không bắt buộc để được xây');
    expect(text).toContain('Trò chơi không có thế chấp');
    expect(text).toContain(`bán một Nhà nhận lại ${formatMoney(houseSaleRefund(tileState[1].houseCost ?? 0))}`);

    const costs = section('building').blocks.find((block) => block.kind === 'table');
    if (costs?.kind !== 'table') throw new Error('Expected the build cost table');
    Object.values(colorGroups).forEach((indices, rowIndex) => {
      const costsInGroup = new Set(indices.map((index) => tileState[index].houseCost));
      // One cost per district, or the table could not say it.
      expect(costsInGroup.size).toBe(1);
      expect(costs.rows[rowIndex].cells[1]).toBe(formatMoney(tileState[indices[0]].houseCost ?? 0));
    });
  });

  it('jail: the bail, the three ways out and the automatic release', () => {
    const text = sectionText('jail');
    expect(text).toContain(`Trả ${formatMoney(BAIL_AMOUNT)} tiền bảo lãnh`);
    expect(text).toContain('Dùng Thẻ Thoát Tù Miễn Phí');
    expect(text).toContain('Nếu ra đôi, bạn ra tù');
    expect(text).toContain(`Vòng chờ: 1/${JAIL_ROUND_LIMIT}`);
    expect(text).toContain(`${JAIL_ROUND_LIMIT}/${JAIL_ROUND_LIMIT} và bạn được thả tự động`);
    expect(text).toContain('không nhận tiền Xuất Phát');
    expect(text).toContain(tileState[30].streetName);
  });

  it('tiles: the tax tiles charge the amount in the tile data (they are not free)', () => {
    const text = sectionText('tiles');
    const taxTiles = tileState.filter((tile) => tile.tileType === 'expense');
    expect(taxTiles).toHaveLength(2);
    for (const tile of taxTiles) {
      expect(text).toContain(`${tile.streetName}\nNộp ${formatMoney(tile.expenseAmount ?? 0)} cho Ngân hàng.`);
    }
    expect(taxTiles.map((tile) => tile.expenseAmount)).toEqual([200, 100]);
    expect(text).toContain(`Nhận ${formatMoney(GO_REWARD)} khi đi qua hoặc dừng ở đây`);
    expect(text).toContain('Nghỉ ngơi. Không nhận và không mất gì.');
  });

  it('trading: the offer lifetime and the pause during a debt', () => {
    const text = sectionText('trading');
    expect(text).toContain(`${formatDuration(OFFER_LIFETIME_SECONDS)}`);
    expect(text).toContain('Nhà và Khách Sạn đi cùng ô đất');
    expect(text).toContain('đề nghị mua tài sản của chính người đang nợ');
  });

  it('debt: the bank share, the deadline, the player-set price, the buy offers and bankruptcy', () => {
    const text = sectionText('debt');
    const example = tileState[1];
    expect(text).toContain(`${FORCED_SALE_PERCENT}%`);
    expect(text).toContain(`khoảng ${formatDuration(DEFAULT_PAYMENT_SHORTFALL_SECONDS)} (mặc định)`);
    expect(text).toContain(`${formatMoney(forcedSaleGrossValue(example.price ?? 0, 0))}`);
    expect(text).toContain(formatMoney(forcedSaleGrossValue(example.price ?? 0, 2 * (example.houseCost ?? 0))));
    expect(text).toContain('tự đặt giá');
    expect(text).toContain('Giá gợi ý ban đầu bằng giá Ngân hàng');
    expect(text).toContain('chỉ có ' + formatDuration(FORCED_SALE_PROPOSAL_SECONDS) + ' để trả lời');
    expect(text).toContain('gửi đề nghị mua một hoặc nhiều tài sản của bạn bằng tiền mặt');
    expect(text).toContain('Bạn chấp nhận hoặc từ chối ngay trong cửa sổ “Cần thanh toán”');
    expect(text).toContain('lần lượt theo thứ tự các ô trên bàn cờ');
    expect(text).toContain('bạn phá sản');
  });

  it('ending: forfeiting loses the assets to the bank and the player may keep watching or leave', () => {
    const text = sectionText('ending');
    expect(text).toContain('tiền và tài sản của bạn trả về Ngân hàng');
    expect(text).toContain('ở lại xem tiếp ván chơi hoặc rời phòng');
    expect(text).toContain('Khi chỉ còn một người chơi trong ván, người đó thắng ngay');
    expect(text).toContain('không phải là bỏ cuộc');
  });
});

describe('copies of a rule number that still live elsewhere in the client', () => {
  it('keeps the HUD jail wait limit equal to the shared rule the guide prints', () => {
    expect(HUD_JAIL_ROUND_LIMIT).toBe(JAIL_ROUND_LIMIT);
  });
});

describe('formatDuration', () => {
  it('uses minutes for whole minutes and seconds otherwise', () => {
    expect(formatDuration(60)).toBe('1 phút');
    expect(formatDuration(120)).toBe('2 phút');
    expect(formatDuration(20)).toBe('20 giây');
    expect(formatDuration(90)).toBe('90 giây');
  });
});

describe('the card lists', () => {
  const chance = section('chance-cards').blocks.find((block) => block.kind === 'cards');
  const chest = section('chest-cards').blocks.find((block) => block.kind === 'cards');
  if (chance?.kind !== 'cards' || chest?.kind !== 'cards') throw new Error('Expected a card list in each deck section');

  it('lists all 13 Cơ Hội and all 15 Khí Vận cards, in the order of the shared data', () => {
    expect(chance.cards).toHaveLength(13);
    expect(chest.cards).toHaveLength(15);
    expect(chance.cards.map((card) => card.id)).toEqual(chanceCards.map((card) => card.id));
    expect(chest.cards.map((card) => card.id)).toEqual(chestCards.map((card) => card.id));
  });

  it('shows each card with the title of its artwork and the exact printed text from the shared data', () => {
    for (const card of [...chanceCards, ...chestCards]) {
      const entry = [...chance.cards, ...chest.cards].find((candidate) => candidate.id === card.id);
      expect(entry?.message).toBe(card.message);
      expect(entry?.title).toBe(cardVisualFor(card.id)?.title);
      expect(entry?.title.length).toBeGreaterThan(0);
    }
  });

  it('says what each kind of card does in words, never by color alone', () => {
    for (const card of [...chance.cards, ...chest.cards]) {
      expect(['Nhận tiền', 'Trả tiền', 'Di chuyển', 'Vào tù', 'Giữ lại']).toContain(card.kindLabel);
    }
  });

  it('counts each deck by kind in one sentence', () => {
    expect(sectionText('chance-cards')).toContain(
      'Bộ Cơ Hội có 13 thẻ: 2 thẻ nhận tiền, 4 thẻ phải trả tiền, 5 thẻ di chuyển, 1 thẻ vào tù, 1 thẻ Thoát Tù Miễn Phí.',
    );
    expect(sectionText('chest-cards')).toContain(
      'Bộ Khí Vận có 15 thẻ: 9 thẻ nhận tiền, 3 thẻ phải trả tiền, 1 thẻ di chuyển, 1 thẻ vào tù, 1 thẻ Thoát Tù Miễn Phí.',
    );
    expect(summarizeDeck('chance', buildCardList('chance'))).toBe(
      'Bộ Cơ Hội có 13 thẻ: 2 thẻ nhận tiền, 4 thẻ phải trả tiền, 5 thẻ di chuyển, 1 thẻ vào tù, 1 thẻ Thoát Tù Miễn Phí.',
    );
  });

  it('explains when a card is drawn and that its effect waits for "Đóng"', () => {
    for (const id of ['chance-cards', 'chest-cards'] as const) {
      const text = sectionText(id);
      expect(text).toContain('thẻ trên cùng của bộ bài được lật ra ngay');
      expect(text).toContain('Bạn đọc thẻ rồi bấm “Đóng”: nội dung thẻ được thực hiện ngay sau đó');
      expect(text).toContain('Thứ tự rút thẻ là ngẫu nhiên');
    }
    expect(sectionText('chance-cards')).toContain('một trong 3 ô Cơ Hội');
    expect(sectionText('chest-cards')).toContain('một trong 3 ô Khí Vận');
  });
});

describe('card classification and notes', () => {
  const card = (effects: Partial<GameCard>): GameCard => ({
    id: 'test-card', sourceDeck: 'chance', message: 'Thẻ thử.', ...effects,
  });

  it('classifies a card by its main typed effect', () => {
    expect(classifyCard(card({ reward: 10 }))).toBe('gain');
    expect(classifyCard(card({ collectFromEachPlayer: 10 }))).toBe('gain');
    expect(classifyCard(card({ penalty: 10 }))).toBe('pay');
    expect(classifyCard(card({ payEachPlayer: 10 }))).toBe('pay');
    expect(classifyCard(card({ moveToTile: 5 }))).toBe('move');
    expect(classifyCard(card({ moveBy: -3 }))).toBe('move');
    expect(classifyCard(card({ goToJail: true }))).toBe('jail');
    expect(classifyCard(card({ getOutOfJailFree: true }))).toBe('keep');
    expect(() => classifyCard(card({}))).toThrow(RangeError);
  });

  it('classifies every shared card and the kinds add up to the deck', () => {
    const byId = (id: string) => [...chanceCards, ...chestCards].find((candidate) => candidate.id === id) as GameCard;
    expect(classifyCard(byId('chance-back-three'))).toBe('move');
    expect(classifyCard(byId('chance-community-event'))).toBe('pay');
    expect(classifyCard(byId('chest-birthday'))).toBe('gain');
    expect(classifyCard(byId('chance-jail-free'))).toBe('keep');
    expect(classifyCard(byId('chest-go-to-jail'))).toBe('jail');
    for (const deck of ['chance', 'chest'] as const) {
      const list = buildCardList(deck);
      const counts = ['gain', 'pay', 'move', 'jail', 'keep'].map(
        (kind) => list.filter((entry) => entry.kind === kind).length,
      );
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(list.length);
    }
  });

  it('adds a note only where the printed text leaves something out', () => {
    expect(describeCardNote(card({ moveToTile: 0 }))).toBe(`Về tới Xuất Phát, bạn nhận ${formatMoney(GO_REWARD)}.`);
    expect(describeCardNote(card({ moveToTile: 24 }))).toContain(`bạn nhận ${formatMoney(GO_REWARD)}`);
    expect(describeCardNote(card({ moveBy: -3 }))).toContain('không nhận tiền Xuất Phát');
    expect(describeCardNote(card({ goToJail: true }))).toContain('không nhận tiền Xuất Phát');
    expect(describeCardNote(card({ getOutOfJailFree: true }))).toContain('đưa thẻ vào giao dịch');
    expect(describeCardNote(card({ payEachPlayer: 50 }))).toContain('từng người chơi khác');
    expect(describeCardNote(card({ collectFromEachPlayer: 10 }))).toContain('Mỗi người chơi khác trả');
    expect(describeCardNote(card({ reward: 10 }))).toBeUndefined();
    expect(describeCardNote(card({ penalty: 10 }))).toBeUndefined();
  });
});

describe('how-to-play 2v2 chapter', () => {
  const team = () => sectionText('team-play');

  it('writes a rent percentage as the Vietnamese multiplier', () => {
    expect(rentMultiplierText(150)).toBe('1,5');
    expect(rentMultiplierText(200)).toBe('2');
  });

  it('explains the lobby setup with the exact limits the server enforces', () => {
    expect(team()).toContain(`đúng ${TEAM_2V2_PLAYER_COUNT} người chơi`);
    expect(team()).toContain(`tối đa ${TEAM_NAME_MAX_LENGTH} chữ`);
    expect(team()).toContain('mọi người phải bấm lại “Sẵn sàng”');
    expect(team()).toContain('hai đồng đội phải chọn mascot khác nhau');
    expect(team()).toContain('Hai đội không được dùng cùng một màu');
    expect(team()).toContain('Chuyển sang');
    expect(team()).toContain('chỉ khi người đó đồng ý thì hai người mới đổi chỗ');
    expect(team()).toContain('Chủ phòng không đổi chỗ thay người khác được');
    expect(team()).toContain('không ai đổi được tên hay màu của đội kia');
    expect(team()).not.toContain('Đổi đội');
  });

  it('states the rent rules: teammate exemption, the set bonuses and the shared Ga and Công Ty count', () => {
    expect(team()).toContain('không phải trả tiền thuê');
    expect(team()).toContain('Thẻ Cơ Hội và Khí Vận vẫn có thể bắt bạn trả tiền cho đồng đội');
    expect(team()).toContain(`nhân ${rentMultiplierText(SOLO_COLOR_SET_RENT_PERCENT)} khi một người giữ đủ khu`);
    expect(team()).toContain(`tiền thuê nhân ${rentMultiplierText(TEAM_COLOR_SET_RENT_PERCENT)}`);
    expect(team()).toContain('Số Ga và Công Ty của cả đội được cộng chung');
  });

  it('explains Team Investment: own cash, the owner unchanged and the refund going to the owner', () => {
    expect(team()).toContain('dùng tiền của mình để xây thêm Nhà');
    expect(team()).toContain('Ô đất vẫn thuộc về đồng đội');
    expect(team()).toContain('tiền hoàn lại về cho chủ ô');
  });

  it('explains revive and Emergency Rescue with the real amounts and time limits', () => {
    expect(team()).toContain(`${REVIVE_WINDOW_SURVIVOR_TURNS} lượt của mình`);
    expect(team()).toContain(`trả ${formatMoney(REVIVE_COST)} cho Ngân hàng`);
    expect(team()).toContain(`với ${formatMoney(REVIVE_STARTING_CASH)}, không có tài sản và không có thẻ`);
    expect(team()).toContain('Mỗi người chỉ được hồi sinh một lần');
    expect(team()).toContain('Người chọn bỏ cuộc thì không hồi sinh được');
    expect(team()).toContain(`trong ${formatDuration(DEFAULT_EMERGENCY_RESCUE_SECONDS)}`);
    expect(team()).toContain('không vào ví của bạn');
    expect(team()).toContain('thì bạn phá sản như bình thường');
  });

  it('says the whole winning team wins, eliminated member included, and what Play Again keeps', () => {
    expect(team()).toContain('kể cả người đã bị loại trước đó');
    expect(team()).toContain('giữ nguyên chế độ, các đội, tên đội và màu đội');
  });

  it('is pointed to from the goal, trading and debt chapters by its real title', () => {
    expect(sectionText('goal')).toContain('Xem mục “Chơi đội 2v2”');
    expect(sectionText('debt')).toContain('xem mục “Chơi đội 2v2”');
    expect(sectionText('trading')).toContain('giao dịch với đồng đội như với bất kỳ người nào khác');
  });
});
