import {
  BAIL_AMOUNT,
  CHANCE_TILE_INDICES,
  CHEST_TILE_INDICES,
  colorGroups,
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
  START_TILE_INDEX,
  STARTING_CASH,
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
import { buildCardList, DECK_NAMES, summarizeDeck } from './cards';
import {
  HOW_TO_PLAY_TITLE,
  SECTION_TITLES,
  type HowToPlayBlock,
  type HowToPlayModel,
  type HowToPlaySection,
  type HowToPlaySectionId,
  type HowToPlayTableRow,
} from './modelTypes';

/*
 * The guide is built from the shared game data, never from numbers typed here: board data (prices, rents, build costs, tax
 * amounts, card text) comes from `tileState` and the card files, and the rules that only the server used to know come from
 * `rules.ts`. The only literals in the sentences below are illustrations (a dice total of 7, "2 Nhà") and plain words.
 * Players do not read technical text: short sentences, "bạn", real amounts, and every button or window named in quotes
 * exactly as it is written on screen.
 */

/** A dice total used in the Công Ty example. */
const EXAMPLE_DICE_TOTAL = 7;
/** How many Nhà the debt example sells together with the land. */
const EXAMPLE_HOUSES = 2;

const money = formatMoney;

/** A button, window or section name as the player reads it on screen. */
const label = (text: string): string => `“${text}”`;
/** The title of another section, quoted, for sentences that point to it. */
const see = (id: HowToPlaySectionId): string => label(SECTION_TITLES[id]);

const paragraph = (text: string): HowToPlayBlock => ({ kind: 'paragraph', text });
const heading = (text: string): HowToPlayBlock => ({ kind: 'heading', text });
const list = (items: readonly string[]): HowToPlayBlock => ({ kind: 'list', items });
const steps = (items: readonly string[]): HowToPlayBlock => ({ kind: 'steps', items });
const table = (
  caption: string,
  columns: readonly string[],
  rows: readonly HowToPlayTableRow[],
): HowToPlayBlock => ({
  kind: 'table', caption, columns, rows,
});

/** 60 → "1 phút", 120 → "2 phút", 20 → "20 giây". */
export function formatDuration(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} phút` : `${seconds} giây`;
}

const tileName = (index: number): string => tileState[index].streetName;

const tilesOfType = (type: TileType): Tile[] => tileState.filter((tile) => tile.tileType === type);

/** "200.000 ₫" when every tile costs the same, otherwise "từ 60.000 ₫ đến 400.000 ₫". */
function priceRange(tiles: readonly Tile[]): string {
  const prices = tiles.map((tile) => tile.price ?? 0);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low) : `từ ${money(low)} đến ${money(high)}`;
}

/** Street tile indices from the cheapest to the dearest (ties by board position). */
function streetIndicesByPrice(): number[] {
  return tileState
    .flatMap((tile, index) => (tile.tileType === 'normal' ? [index] : []))
    .sort((a, b) => (tileState[a].price ?? 0) - (tileState[b].price ?? 0) || a - b);
}

/** One row per district, in board order, with its color as a decorative swatch. */
function districtRows(describe: (indices: readonly number[]) => string): HowToPlayTableRow[] {
  return Object.entries(colorGroups).map(([color, indices]) => {
    const style = getPropertyGroupVisualStyle(color);
    return { cells: [style.label, describe(indices)], accent: style.color };
  });
}

// 1. Mục tiêu và lượt chơi.
function goalSection(): HowToPlaySection {
  const start = tileName(START_TILE_INDEX);
  return {
    id: 'goal',
    title: SECTION_TITLES.goal,
    blocks: [
      paragraph(
        'Mục tiêu của bạn là trở thành người chơi cuối cùng còn lại trong ván. '
        + 'Ai hết tiền, không còn tài sản để bán mà vẫn còn nợ sẽ phá sản và ra khỏi ván.',
      ),
      list([
        `Mỗi ván có từ ${MIN_PLAYERS_PER_GAME} đến ${MAX_PLAYERS_PER_GAME} người chơi. `
        + `Ai cũng bắt đầu ở ô ${start} với ${money(STARTING_CASH)}.`,
        'Trò chơi đổ xúc xắc để chọn người đi trước. Sau đó mọi người đi lần lượt theo vòng tròn.',
        `Đến lượt bạn, bấm ${label('Đổ xúc xắc')}. `
        + 'Trò chơi đổ hai viên xúc xắc, quân của bạn tiến lên đúng số ô bằng tổng hai viên.',
        'Đổ được hai viên giống nhau (đổ đôi) thì bạn không được đi thêm lượt. Đổ đôi chỉ giúp bạn ra khỏi Nhà Tù.',
        'Quân dừng ở ô nào, bạn làm theo ô đó: mua đất, trả tiền thuê, nộp thuế, rút thẻ... '
        + 'Xong việc, lượt tự chuyển sang người kế tiếp. Bạn không cần bấm kết thúc lượt.',
        `Mỗi lần đi qua hoặc dừng ở ô ${start}, bạn nhận ${money(GO_REWARD)}. `
        + 'Bạn không nhận khoản này khi bị đưa thẳng vào Nhà Tù hoặc khi bị lùi lại.',
        'Không có đồng hồ đếm giờ cho mỗi lượt. '
        + `Nếu người đến lượt bị mất kết nối, trò chơi chờ họ khoảng ${formatDuration(DEFAULT_RECONNECT_GRACE_SECONDS)} `
        + '(mặc định) rồi bỏ qua lượt đó.',
      ]),
    ],
  };
}

// 2. Mua đất.
function buyingSection(): HowToPlaySection {
  return {
    id: 'buying',
    title: SECTION_TITLES.buying,
    blocks: [
      paragraph('Khi quân của bạn dừng ở một ô đất, Ga hoặc Công Ty chưa có chủ, bạn được chọn:'),
      list([
        `${label('Mua tài sản')}: trả đúng giá ghi trên ô. Bạn cần có đủ tiền.`,
        `${label('Không mua')}: bỏ qua. Ô vẫn chưa có chủ và người khác có thể mua khi họ dừng ở đó. `
        + 'Trò chơi không có đấu giá.',
      ]),
      paragraph(
        `Giá mua ghi ngay trên mỗi ô. Ô đất giá ${priceRange(tilesOfType('normal'))}, `
        + `mỗi Ga giá ${priceRange(tilesOfType('railroad'))}, `
        + `mỗi Công Ty giá ${priceRange(tilesOfType('company'))}.`,
      ),
      table(
        'Các khu đất và giá mua',
        ['Khu', 'Ô đất và giá mua'],
        districtRows((indices) => indices
          .map((index) => `${tileName(index)} ${money(tileState[index].price ?? 0)}`)
          .join(' · ')),
      ),
      list([
        'Tài sản bạn mua là của bạn đến hết ván, trừ khi bạn bán hoặc đổi cho người khác.',
        'Bấm vào bất kỳ ô nào trên bàn cờ để xem giá, tiền thuê và chủ sở hữu. '
        + `Nút ${label('Tài sản của tôi')} liệt kê mọi ô bạn đang có.`,
      ]),
    ],
  };
}

// 3. Thu tiền thuê.
function rentSection(): HowToPlaySection {
  const byPrice = streetIndicesByPrice();
  const cheapest = byPrice[0];
  const dearest = byPrice[byPrice.length - 1];
  // The base rent, then 1 to 4 Nhà, then the Khách Sạn; the build cost belongs to the building section.
  const ladder = (index: number) => getTileDetails(tileState[index])
    .slice(0, (tileState[index].rentTiers?.length ?? 0) + 1);
  const cheapestLadder = ladder(cheapest);
  const dearestLadder = ladder(dearest);
  const railroads = RAILROAD_TILE_INDICES.map(tileName).join(', ');
  const utilities = UTILITY_TILE_INDICES.map(tileName).join(', ');

  return {
    id: 'rent',
    title: SECTION_TITLES.rent,
    blocks: [
      paragraph(
        'Khi quân của bạn dừng ở ô đã có chủ khác, bạn phải trả tiền thuê cho chủ ô. Tiền được trừ tự động. '
        + 'Chủ ô vẫn nhận tiền thuê dù đang ở tù. Dừng ở ô của chính bạn thì bạn không phải trả gì.',
      ),
      heading('Ô đất'),
      list([
        'Chưa có Nhà: bạn trả tiền thuê gốc của ô.',
        `Có từ 1 đến ${HOUSES_BEFORE_HOTEL} Nhà: bạn trả theo bảng giá của số Nhà đó.`,
        'Có Khách Sạn: bạn trả mức thuê cao nhất của ô.',
        'Sở hữu cả khu màu không làm tiền thuê tăng thêm.',
      ]),
      table(
        'Ví dụ tiền thuê của hai ô đất',
        ['Mức thuê', tileName(cheapest), tileName(dearest)],
        cheapestLadder.map((detail, index) => ({
          cells: [detail.label, detail.value ?? '', dearestLadder[index]?.value ?? ''],
        })),
      ),
      paragraph('Mỗi ô đất có bảng tiền thuê riêng. Bấm vào ô trên bàn cờ để xem.'),
      heading('Ga'),
      paragraph(
        `Trên bàn cờ có ${RAILROAD_TILE_INDICES.length} Ga (${railroads}). `
        + 'Tiền thuê tăng theo số Ga mà chủ ô đang có.',
      ),
      table(
        'Tiền thuê Ga',
        ['Chủ ô đang có', 'Bạn trả'],
        RAILROAD_RENT_BY_COUNT.map((rent, index) => ({ cells: [`${index + 1} Ga`, money(rent)] })),
      ),
      heading('Công Ty'),
      paragraph(
        `Trên bàn cờ có ${UTILITY_TILE_INDICES.length} Công Ty (${utilities}). `
        + 'Tiền thuê tính theo tổng hai viên xúc xắc bạn vừa đổ.',
      ),
      list([
        `Chủ ô có 1 Công Ty: bạn trả tổng xúc xắc nhân ${UTILITY_RENT_MULTIPLIER_SINGLE}.`,
        `Chủ ô có cả ${UTILITY_TILE_INDICES.length} Công Ty: bạn trả tổng xúc xắc nhân ${UTILITY_RENT_MULTIPLIER_BOTH}.`,
        `Ví dụ bạn đổ được ${EXAMPLE_DICE_TOTAL}: bạn trả ${money(EXAMPLE_DICE_TOTAL * UTILITY_RENT_MULTIPLIER_SINGLE)} `
        + `hoặc ${money(EXAMPLE_DICE_TOTAL * UTILITY_RENT_MULTIPLIER_BOTH)}.`,
      ]),
      paragraph(`Không đủ tiền trả thuê? Xem mục ${see('debt')}.`),
    ],
  };
}

// 4. Xây nhà và công trình.
function buildingSection(): HowToPlaySection {
  const example = tileState[streetIndicesByPrice()[0]];
  return {
    id: 'building',
    title: SECTION_TITLES.building,
    blocks: [
      paragraph(
        'Bạn chỉ xây được khi quân của bạn dừng ở một ô đất của chính bạn. Lúc đó trò chơi hỏi bạn có muốn xây không.',
      ),
      list([
        `Ô đất chưa đủ ${HOUSES_BEFORE_HOTEL} Nhà: bạn xây thêm Nhà, nhiều nhất là cho đủ ${HOUSES_BEFORE_HOTEL} Nhà. `
        + `Ví dụ ô còn trống xây được tối đa ${HOUSES_BEFORE_HOTEL} Nhà, `
        + `ô đã có ${HOUSES_BEFORE_HOTEL - 1} Nhà chỉ xây thêm được 1 Nhà.`,
        `Ô đất đã đủ ${HOUSES_BEFORE_HOTEL} Nhà: bạn có thể nâng cấp lên Khách Sạn. `
        + 'Nâng cấp Khách Sạn có giá bằng một Nhà.',
        'Ô đất đã có Khách Sạn: không xây thêm được nữa.',
        `Chọn ${label('Bỏ qua')} nếu bạn không muốn xây. Lần sau quân của bạn dừng ở ô đó, bạn mới được xây tiếp.`,
        'Ga và Công Ty không xây được công trình.',
      ]),
      paragraph('Giá xây phụ thuộc vào khu màu của ô đất:'),
      table(
        'Giá xây theo khu',
        ['Khu', 'Giá mỗi Nhà hoặc Khách Sạn'],
        districtRows((indices) => money(tileState[indices[0]].houseCost ?? 0)),
      ),
      paragraph(
        `Nhà và Khách Sạn làm tiền thuê của ô tăng mạnh (xem bảng ở mục ${see('rent')}). `
        + 'Sở hữu cả khu màu không bắt buộc để được xây.',
      ),
      heading('Bán lại công trình'),
      list([
        `Bạn có thể bán lại từng cấp công trình cho Ngân hàng, mỗi lần một cấp, bằng nút ${label('Bán Nhà')} `
        + 'khi xem ô đất của mình. Bạn nhận lại một nửa giá xây. '
        + `Ví dụ ở ${example.streetName}, bán một Nhà nhận lại ${money(houseSaleRefund(example.houseCost ?? 0))}.`,
        'Khi đang có khoản nợ chờ trả, bạn không bán lẻ công trình được. '
        + `Lúc đó bạn bán cả ô đất (xem mục ${see('debt')}).`,
        'Trò chơi không có thế chấp.',
      ]),
    ],
  };
}

// 5. Nhà Tù.
function jailSection(): HowToPlaySection {
  return {
    id: 'jail',
    title: SECTION_TITLES.jail,
    blocks: [
      paragraph(
        `Bạn bị đưa vào tù khi dừng ở ô ${tileName(GO_TO_JAIL_TILE_INDEX)} hoặc rút thẻ Vào Tù. `
        + 'Quân của bạn đi thẳng đến Nhà Tù, không nhận tiền Xuất Phát, và lượt của bạn kết thúc.',
      ),
      paragraph(
        `Dừng ở ô ${tileName(JAIL_TILE_INDEX)} khi đang đi bình thường chỉ là ghé thăm: không có gì xảy ra.`,
      ),
      heading('Cách ra tù'),
      list([
        'Đổ xúc xắc. Nếu ra đôi, bạn ra tù và đi tiếp đúng số ô vừa đổ, lượt kết thúc sau khi bạn đi xong. '
        + 'Nếu không ra đôi, bạn vẫn ở tù và lượt kết thúc.',
        `Trả ${money(BAIL_AMOUNT)} tiền bảo lãnh rồi đổ xúc xắc đi bình thường. Bạn cần trả trước khi đổ.`,
        'Dùng Thẻ Thoát Tù Miễn Phí rồi đổ xúc xắc đi bình thường.',
        `Chờ: bảng Nhà Tù hiện ${label(`Vòng chờ: 1/${JAIL_ROUND_LIMIT}`)} ở lượt tù đầu tiên. `
        + `Đến lượt kế tiếp, vòng chờ đủ ${JAIL_ROUND_LIMIT}/${JAIL_ROUND_LIMIT} và bạn được thả tự động `
        + 'trước khi đổ xúc xắc.',
      ]),
      paragraph('Khi ở tù, bạn vẫn nhận tiền thuê từ người khác và vẫn có thể giao dịch.'),
    ],
  };
}

// 6. Thuế và ô đặc biệt.
function tilesSection(): HowToPlaySection {
  const taxRows: HowToPlayTableRow[] = tilesOfType('expense').map((tile) => ({
    cells: [tile.streetName, `Nộp ${money(tile.expenseAmount ?? 0)} cho Ngân hàng.`],
  }));
  const first = (type: TileType): string => tilesOfType(type)[0].streetName;
  return {
    id: 'tiles',
    title: SECTION_TITLES.tiles,
    blocks: [
      table(
        'Các ô đặc biệt',
        ['Ô', 'Khi quân của bạn dừng ở đây'],
        [
          { cells: [first('start'), `Nhận ${money(GO_REWARD)} khi đi qua hoặc dừng ở đây.`] },
          ...taxRows,
          { cells: [first('chance'), 'Rút thẻ Cơ Hội trên cùng và làm theo thẻ.'] },
          { cells: [first('chest'), 'Rút thẻ Khí Vận trên cùng và làm theo thẻ.'] },
          { cells: [first('jail'), 'Chỉ ghé thăm: không có gì xảy ra.'] },
          { cells: [first('gojail'), 'Bị đưa thẳng vào Nhà Tù. Không nhận tiền Xuất Phát và lượt kết thúc.'] },
          { cells: [first('parking'), 'Nghỉ ngơi. Không nhận và không mất gì.'] },
        ],
      ),
      paragraph(
        'Tiền thuế nộp cho Ngân hàng, không người chơi nào nhận được. '
        + `Không đủ tiền nộp thuế? Xem mục ${see('debt')}.`,
      ),
    ],
  };
}

// 7 and 8. Thẻ Cơ Hội, Thẻ Khí Vận.
function deckSection(deck: CardDeck): HowToPlaySection {
  const id: HowToPlaySectionId = deck === 'chance' ? 'chance-cards' : 'chest-cards';
  const tileCount = (deck === 'chance' ? CHANCE_TILE_INDICES : CHEST_TILE_INDICES).length;
  const name = DECK_NAMES[deck];
  const cards = buildCardList(deck);
  return {
    id,
    title: SECTION_TITLES[id],
    blocks: [
      paragraph(
        `Khi quân của bạn dừng ở một trong ${tileCount} ô ${name}, thẻ trên cùng của bộ bài được lật ra ngay. `
        + `Bạn đọc thẻ rồi bấm ${label('Đóng')}: nội dung thẻ được thực hiện ngay sau đó.`,
      ),
      paragraph(
        'Thứ tự rút thẻ là ngẫu nhiên. Thẻ dùng xong được xếp xuống cuối bộ bài. '
        + 'Riêng Thẻ Thoát Tù Miễn Phí được bạn giữ lại cho đến khi bạn dùng.',
      ),
      paragraph(summarizeDeck(deck, cards)),
      { kind: 'cards', label: `Danh sách thẻ ${name}`, cards },
    ],
  };
}

// 9. Giao dịch mua bán.
function tradingSection(): HowToPlaySection {
  return {
    id: 'trading',
    title: SECTION_TITLES.trading,
    blocks: [
      paragraph(
        'Bạn có thể mua, bán hoặc đổi tài sản với người chơi khác bất cứ lúc nào trong ván, không cần chờ đến lượt.',
      ),
      steps([
        `Bấm vào một ô đã có chủ trên bàn cờ, rồi chọn ${label('Đề nghị mua')}.`,
        'Chọn thứ bạn giao (tiền, đất, Thẻ Thoát Tù của bạn) và thứ bạn nhận (tiền, đất của họ).',
        `Bấm ${label('Gửi đề nghị')}. Người kia chọn ${label('Chấp nhận')} hoặc ${label('Từ chối')}.`,
      ]),
      list([
        `Mỗi đề nghị chỉ có hiệu lực ${formatDuration(OFFER_LIFETIME_SECONDS)}. `
        + 'Hết giờ mà chưa trả lời thì đề nghị tự hủy.',
        'Khi người kia chấp nhận, hai bên đổi ngay và không hoàn lại. Cả hai bên cần có đủ tiền.',
        'Nhà và Khách Sạn đi cùng ô đất, không bán riêng cho người chơi khác được.',
        'Bạn chỉ đưa được Thẻ Thoát Tù của chính mình vào đề nghị.',
        'Trong lúc có người đang thiếu tiền trả nợ, các giao dịch thông thường tạm dừng. '
        + `Lúc đó chỉ có thể gửi đề nghị mua tài sản của chính người đang nợ (xem mục ${see('debt')}).`,
      ]),
    ],
  };
}

// 10. Nợ và phá sản.
function debtSection(): HowToPlaySection {
  const example = tileState[streetIndicesByPrice()[0]];
  const price = example.price ?? 0;
  const houseCost = example.houseCost ?? 0;
  return {
    id: 'debt',
    title: SECTION_TITLES.debt,
    blocks: [
      paragraph(
        'Khi bạn phải trả tiền (thuê, thuế, thẻ) mà không đủ tiền mặt, trò chơi lấy hết tiền mặt của bạn để trả trước. '
        + 'Phần còn thiếu trở thành khoản nợ. Ván chơi tạm dừng cho đến khi khoản nợ được giải quyết.',
      ),
      paragraph(
        `Cửa sổ ${label('Cần thanh toán')} hiện ra. `
        + `Bạn có khoảng ${formatDuration(DEFAULT_PAYMENT_SHORTFALL_SECONDS)} (mặc định) để có thêm tiền bằng các cách sau:`,
      ),
      list([
        `${label('Bán cho Ngân hàng')}: bạn nhận ${FORCED_SALE_PERCENT}% của (giá đất + tiền đã xây Nhà). `
        + `Ví dụ ${example.streetName} chưa có Nhà bán được ${money(forcedSaleGrossValue(price, 0))}, `
        + `có ${EXAMPLE_HOUSES} Nhà bán được ${money(forcedSaleGrossValue(price, EXAMPLE_HOUSES * houseCost))}.`,
        `${label('Đề nghị người chơi mua')}: bạn chọn người mua và tự đặt giá. `
        + 'Giá gợi ý ban đầu bằng giá Ngân hàng. '
        + `Người mua cần đủ tiền và chỉ có ${formatDuration(FORCED_SALE_PROPOSAL_SECONDS)} để trả lời.`,
        'Nhận đề nghị mua từ người chơi khác: trong lúc bạn đang nợ, người khác có thể gửi đề nghị mua '
        + 'một hoặc nhiều tài sản của bạn bằng tiền mặt. '
        + `Bạn chấp nhận hoặc từ chối ngay trong cửa sổ ${label('Cần thanh toán')}.`,
      ]),
      paragraph('Khi đã đủ tiền, khoản nợ được trả xong và ván chơi tiếp tục.'),
      list([
        'Hết thời gian mà vẫn chưa đủ: trò chơi tự bán tài sản của bạn cho Ngân hàng, lần lượt theo thứ tự '
        + 'các ô trên bàn cờ, cho đến khi đủ tiền trả nợ.',
        'Bán hết tài sản mà vẫn còn nợ: bạn phá sản và ra khỏi ván. '
        + 'Người bạn nợ chỉ nhận được số tiền bạn đã trả được. '
        + 'Nếu bạn không có tài sản nào để bán, bạn phá sản ngay.',
      ]),
    ],
  };
}

// 11. Bỏ cuộc và chiến thắng.
function endingSection(): HowToPlaySection {
  return {
    id: 'ending',
    title: SECTION_TITLES.ending,
    blocks: [
      list([
        `Bấm nút ${label('Bỏ cuộc')} (hình lá cờ ở góc trên bên phải) nếu bạn muốn dừng chơi. `
        + 'Trò chơi hỏi lại một lần để bạn xác nhận.',
        'Khi bỏ cuộc, tiền và tài sản của bạn trả về Ngân hàng. '
        + 'Nếu lúc đó bạn đang nợ, tiền và tài sản của bạn được dùng để trả nợ trước.',
        'Sau khi bỏ cuộc, bạn có thể ở lại xem tiếp ván chơi hoặc rời phòng.',
        'Bị mất kết nối hoặc đóng cửa sổ không phải là bỏ cuộc. Bạn vào lại phòng bằng cùng thiết bị là chơi tiếp được.',
        'Khi chỉ còn một người chơi trong ván, người đó thắng ngay.',
        `Sau ván, chủ phòng có thể bấm ${label('Chơi lại')} để mở ván mới trong cùng phòng.`,
      ]),
    ],
  };
}

/** The whole guide, in reading order. Pure: the same shared data always gives the same model. */
export function buildHowToPlayModel(): HowToPlayModel {
  return {
    title: HOW_TO_PLAY_TITLE,
    intro: 'Cờ Tỷ Phú Việt Nam là trò chơi mua đất, thu tiền thuê và xây nhà cùng bạn bè. '
      + 'Bấm vào từng mục bên dưới để mở ra đọc.',
    sections: [
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
    ],
  };
}
