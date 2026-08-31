import type { ReactNode } from 'react';
import { getTileName } from '../formatters';
import './PropertyCard.css';

interface PropertyCardProps {
  tileId: number;
  className?: string;
  role?: string;
  children: ReactNode;
}

export default function PropertyCard({
  tileId, className = '', role, children,
}: PropertyCardProps) {
  return (
    <article
      className={`property-card${className ? ` ${className}` : ''}`}
      role={role}
    >
      <div className="property-card__header">
        <h3 className="property-card__name">{getTileName(tileId)}</h3>
      </div>
      {children}
    </article>
  );
}
