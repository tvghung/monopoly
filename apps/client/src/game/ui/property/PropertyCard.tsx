import type { OwnedProp } from '@monopoly/shared';
import type { ReactNode } from 'react';
import { getTileName } from '../formatters';
import './PropertyCard.css';

interface PropertyCardProps {
  tileId: number;
  ownedProp?: OwnedProp;
  className?: string;
  role?: string;
  children: ReactNode;
}

export default function PropertyCard({
  tileId, ownedProp, className = '', role, children,
}: PropertyCardProps) {
  return (
    <article
      className={`property-card${className ? ` ${className}` : ''}`}
      role={role}
    >
      <div className="property-card__header">
        <h3 className="property-card__name">{getTileName(tileId)}</h3>
        {ownedProp && ownedProp.houses > 0
          ? <span className="property-card__development">{ownedProp.houses === 5 ? '🏨 1 Khách sạn' : `🏠 ${ownedProp.houses} Nhà`}</span>
          : null}
      </div>
      {children}
    </article>
  );
}
