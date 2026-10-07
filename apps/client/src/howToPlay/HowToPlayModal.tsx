import Chip, { type ChipTone } from '../design-system/components/Chip/Chip';
import Modal from '../design-system/components/Modal/Modal';
import { buildHowToPlayModel } from './model';
import {
  type CardEffectKind,
  type HowToPlayBlock,
  type HowToPlayCard,
  type HowToPlaySection,
} from './modelTypes';
import './howToPlay.css';
import { useMemo } from 'react';
import { useTranslation } from '../i18n/I18n';

/** Keeps "60.000 ₫" on one line: the shared formatter writes the symbol after an ordinary space, which may wrap. */
const keepMoneyTogether = (text: string): string => text.replace(/ ₫/gu, '\u00A0₫');

const CARD_TONES: Readonly<Record<CardEffectKind, ChipTone>> = {
  gain: 'gain',
  pay: 'loss',
  move: 'info',
  jail: 'loss',
  keep: 'gold',
};

function CardList({ label, cards }: { label: string; cards: readonly HowToPlayCard[] }) {
  return (
    <ul className="how-to-play__cards" aria-label={label}>
      {cards.map((card) => (
        <li key={card.id} className="how-to-play__card">
          <div className="how-to-play__card-head">
            <strong className="how-to-play__card-title">{card.title}</strong>
            <Chip tone={CARD_TONES[card.kind]}>{card.kindLabel}</Chip>
          </div>
          <p className="how-to-play__card-message">{keepMoneyTogether(card.message)}</p>
          {card.note ? <p className="how-to-play__card-note">{keepMoneyTogether(card.note)}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Table({ block }: { block: Extract<HowToPlayBlock, { kind: 'table' }> }) {
  return (
    // A table wider than the dialog scrolls sideways inside this region, which a keyboard can scroll too.
    <div className="how-to-play__table-wrap" role="region" aria-label={block.caption} tabIndex={0}>
      <table className="how-to-play__table">
        <caption>{block.caption}</caption>
        <thead>
          <tr>
            {block.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.cells.map((cell, index) => (index === 0
                ? (
                  <th key={index} scope="row">
                    {row.accent
                      ? <span className="how-to-play__swatch" style={{ background: row.accent }} aria-hidden="true" />
                      : null}
                    {keepMoneyTogether(cell)}
                  </th>
                )
                : <td key={index}>{keepMoneyTogether(cell)}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ block }: { block: HowToPlayBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="how-to-play__paragraph">{keepMoneyTogether(block.text)}</p>;
    case 'heading':
      return <h3 className="how-to-play__heading">{block.text}</h3>;
    case 'list':
      return (
        <ul className="how-to-play__list">
          {block.items.map((item, index) => <li key={index}>{keepMoneyTogether(item)}</li>)}
        </ul>
      );
    case 'steps':
      return (
        <ol className="how-to-play__list how-to-play__list--steps">
          {block.items.map((item, index) => <li key={index}>{keepMoneyTogether(item)}</li>)}
        </ol>
      );
    case 'table':
      return <Table block={block} />;
    case 'cards':
      return <CardList label={block.label} cards={block.cards} />;
  }
}

function Section({ section, number }: { section: HowToPlaySection; number: number }) {
  return (
    // A native disclosure: collapsed until the player opens it, and Enter or Space on the summary toggles it in every browser.
    <details className="how-to-play__section" data-section={section.id}>
      <summary
        className="how-to-play__summary"
        // The first summary takes focus, so a keyboard player can open a topic at once instead of starting on "Đóng".
        data-modal-autofocus={number === 1 ? '' : undefined}
      >
        <span className="how-to-play__number" aria-hidden="true">{number}</span>
        <span className="how-to-play__summary-title">{section.title}</span>
      </summary>
      <div className="how-to-play__content">
        {section.blocks.map((block, index) => <Block key={`${block.kind}-${index}`} block={block} />)}
      </div>
    </details>
  );
}

/** The content is built only while the dialog is mounted, so a closed guide costs nothing. */
function HowToPlayContent({ model }: { model: ReturnType<typeof buildHowToPlayModel> }) {
  return (
    <div className="how-to-play__body">
      <p className="how-to-play__intro">{model.intro}</p>
      <div className="how-to-play__sections">
        {model.sections.map((section, index) => <Section key={section.id} section={section} number={index + 1} />)}
      </div>
    </div>
  );
}

export interface HowToPlayModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The how-to-play guide: one scrolling dialog with a short introduction and one collapsed section per topic. It is the
 * ordinary design-system `Modal`, so Escape, the focus trap and focus return to the button come from there.
 */
export default function HowToPlayModal({ open, onClose }: HowToPlayModalProps) {
  const { language, t } = useTranslation();
  const model = useMemo(() => buildHowToPlayModel(language), [language]);
  return (
    <Modal
      open={open}
      title={model.title}
      eyebrow={t('brand.name')}
      size="lg"
      className="how-to-play"
      closeOnOutsideClick
      onClose={onClose}
    >
      <HowToPlayContent model={model} />
    </Modal>
  );
}
