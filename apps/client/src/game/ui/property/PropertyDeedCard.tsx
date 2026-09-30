import { useId, type CSSProperties } from 'react';
import PlayerAvatar from '../../../design-system/components/PlayerAvatar/PlayerAvatar';
import { DEFAULT_TILE_GLYPH, MOTIF_GLYPHS, SPECIAL_TILE_GLYPHS } from '../../../design-system/icons/tileGlyphs';
import { getPlayerDisplayColor } from '../playerVisualColors';
import type { DeedCardModel } from './deedCardModel';
import './PropertyDeedCard.css';

export type DeedVariant = 'full' | 'compact' | 'chip';

export interface PropertyDeedCardProps {
  model: DeedCardModel;
  variant?: DeedVariant;
  /** Show the owner row and the group progress (the buy prompt shows the group but no owner). */
  showOwner?: boolean;
  className?: string;
}

function deedStyle(model: DeedCardModel): CSSProperties {
  return {
    '--deed-color': model.headerColor,
    '--deed-text': model.headerTextColor,
    '--deed-tint': model.tint,
  } as CSSProperties;
}

/** The landmark art slot (64 px): the district motif until plan 05 supplies 2D art; a flat glyph for special tiles. */
function DeedArt({ model }: { model: DeedCardModel }) {
  const Glyph = model.motif
    ? MOTIF_GLYPHS[model.motif]
    : SPECIAL_TILE_GLYPHS[model.tileType] ?? DEFAULT_TILE_GLYPH;
  return (
    <span className="deed__art" aria-hidden="true" data-deed-art={model.motif ?? model.tileType}>
      <Glyph size={34} strokeWidth={2.25} />
    </span>
  );
}

function OwnerRow({ model }: { model: DeedCardModel }) {
  const { owner, group } = model;
  return (
    <div className="deed__owner">
      {owner ? (
        <>
          <PlayerAvatar characterId={owner.characterId} colorId={owner.color} size={32} />
          <span className="deed__owner-name">
            <span className="deed__owner-label">Chủ</span>
            {' '}
            <strong>{owner.name}</strong>
          </span>
        </>
      ) : (
        <span className="deed__owner-name deed__owner-name--none">Chưa có chủ</span>
      )}
      {group ? (
        <span className="deed__progress" role="img" aria-label={group.text}>
          <span className="deed__pips" aria-hidden="true">
            {group.pips.map(pip => (
              <span
                key={pip.tileId}
                className={`deed__pip${pip.ownerColor ? ' deed__pip--owned' : ''}${pip.self ? ' deed__pip--self' : ''}`}
                style={pip.ownerColor ? { background: getPlayerDisplayColor(pip.ownerColor) } : undefined}
              />
            ))}
          </span>
          <span className="deed__progress-text" aria-hidden="true">
            {owner ? `${group.ownedByOwner}/${group.total}` : `${group.total} ô`}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * The property deed, the most reused object of the game: buy, build, inspect, portfolios, debt and trade all show it.
 * `full` is the whole card with the rent ladder, `compact` a header with price and current rent, `chip` one line.
 * It is a pure view of a `DeedCardModel` (see `buildDeedCardModel`).
 */
export default function PropertyDeedCard({
  model, variant = 'full', showOwner = true, className = '',
}: PropertyDeedCardProps) {
  const nameId = useId();
  const classes = `deed deed--${variant} deed--${model.kind}${className ? ` ${className}` : ''}`;
  const style = deedStyle(model);

  if (variant === 'chip') {
    return (
      <span className={classes} style={style} data-tile-id={model.tileId}>
        <span className="deed-chip__swatch" aria-hidden="true" />
        <span className="deed-chip__name">{model.name}</span>
        {model.priceText ? <span className="deed-chip__price">{model.priceText}</span> : null}
      </span>
    );
  }

  const current = model.rows.find(row => row.current);

  return (
    <article className={classes} style={style} aria-labelledby={nameId} data-tile-id={model.tileId}>
      <header className="deed__header">
        <div className="deed__titles">
          {model.groupLabel ? <p className="deed__group">{model.groupLabel}</p> : null}
          <h3 id={nameId} className="deed__name">{model.name}</h3>
        </div>
        <DeedArt model={model} />
      </header>

      {model.kind === 'special' ? (
        <div className="deed__body">
          {model.ruleLines.map(line => <p className="deed__rule" key={line}>{line}</p>)}
        </div>
      ) : (
        <div className="deed__body">
          {model.priceText ? (
            <p className="deed__price">
              <span>Giá mua</span>
              <strong>{model.priceText}</strong>
            </p>
          ) : null}
          {model.developmentText && variant === 'full' ? (
            <p className="deed__development">
              <span>Phát triển</span>
              <strong>{model.developmentText}</strong>
            </p>
          ) : null}

          {variant === 'full' ? (
            <table className="deed__ladder">
              <caption className="deed__caption">Bảng giá thuê</caption>
              <tbody>
                {model.rows.map(row => (
                  <tr
                    key={row.label}
                    className={`deed__row${row.current ? ' deed__row--current property-inspection__detail--current' : ''}${row.next ? ' deed__row--next' : ''}`}
                    aria-current={row.current ? 'true' : undefined}
                  >
                    <th scope="row">
                      {row.label}
                      {row.current ? <span className="deed__tag deed__tag--current">Hiện tại</span> : null}
                      {row.next ? <span className="deed__tag deed__tag--next">Sau khi xây</span> : null}
                    </th>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : current ? (
            <p className="deed__current">
              <span>{current.label}</span>
              {current.value ? <strong>{current.value}</strong> : null}
            </p>
          ) : null}

          {variant === 'full' && model.houseCostText ? (
            <p className="deed__house-cost">
              <span>Giá mỗi Nhà / Khách Sạn</span>
              <strong>{model.houseCostText}</strong>
            </p>
          ) : null}
          {variant === 'full' && model.groupRuleNote ? <p className="deed__note">{model.groupRuleNote}</p> : null}
        </div>
      )}

      {showOwner && model.kind !== 'special' ? <OwnerRow model={model} /> : null}
    </article>
  );
}
