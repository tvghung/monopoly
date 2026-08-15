import type { ReactNode } from 'react';
import './GamePanel.css';

interface GamePanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export default function GamePanel({ children, className = '', title }: GamePanelProps) {
  return (
    <section className={`ds-game-panel${className ? ` ${className}` : ''}`}>
      {title ? <h2 className="ds-game-panel__title">{title}</h2> : null}
      {children}
    </section>
  );
}

