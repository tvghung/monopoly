/**
 * The shape of the how-to-play guide. The guide is a plain data model built from the shared game data (`model.ts`) and drawn
 * by `HowToPlayModal`; nothing here knows about React, and every string is already player-facing Vietnamese.
 */

export const HOW_TO_PLAY_TITLE = 'Hướng dẫn chơi';

export type HowToPlaySectionId =
  | 'goal'
  | 'buying'
  | 'rent'
  | 'building'
  | 'jail'
  | 'tiles'
  | 'chance-cards'
  | 'chest-cards'
  | 'trading'
  | 'debt'
  | 'ending';

/** The one place a section is named, so a sentence that points at another section never drifts from its title. */
export const SECTION_TITLES: Readonly<Record<HowToPlaySectionId, string>> = {
  goal: 'Mục tiêu và lượt chơi',
  buying: 'Mua đất',
  rent: 'Thu tiền thuê',
  building: 'Xây nhà và công trình',
  jail: 'Nhà Tù',
  tiles: 'Thuế và ô đặc biệt',
  'chance-cards': 'Thẻ Cơ Hội',
  'chest-cards': 'Thẻ Khí Vận',
  trading: 'Giao dịch mua bán',
  debt: 'Nợ và phá sản',
  ending: 'Bỏ cuộc và chiến thắng',
};

/** What a card mostly does to the player who draws it. */
export type CardEffectKind = 'gain' | 'pay' | 'move' | 'jail' | 'keep';

export interface HowToPlayCard {
  id: string;
  /** Short name from the card art manifest. */
  title: string;
  /** The text printed on the card, straight from the shared card data. */
  message: string;
  kind: CardEffectKind;
  /** Words for the kind, so the meaning never depends on a color. */
  kindLabel: string;
  /** What the printed text leaves out (who pays, whether Xuất Phát pays), only when there is something to add. */
  note?: string;
}

export interface HowToPlayTableRow {
  /** The first cell is the row header. */
  cells: readonly string[];
  /** District color of the row, drawn as a small decorative swatch beside the row header. */
  accent?: string;
}

export type HowToPlayBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'steps'; items: readonly string[] }
  | {
    kind: 'table';
    caption: string;
    columns: readonly string[];
    rows: readonly HowToPlayTableRow[];
  }
  | { kind: 'cards'; label: string; cards: readonly HowToPlayCard[] };

export interface HowToPlaySection {
  id: HowToPlaySectionId;
  title: string;
  blocks: readonly HowToPlayBlock[];
}

export interface HowToPlayModel {
  title: string;
  /** A short friendly opening, shown above the collapsed sections. */
  intro: string;
  sections: readonly HowToPlaySection[];
}
