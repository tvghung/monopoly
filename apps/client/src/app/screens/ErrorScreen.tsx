import type { ReactNode } from 'react';
import Button from '../../design-system/components/Button/Button';
import { CHARACTER_REGISTRY } from '../../game/characters/characterRegistry';
import { characterSvgDataUri } from '../../game/characters/characterSvg';
import HowToPlayButton from '../../howToPlay/HowToPlayButton';
import './screens.css';

/** A calm mascot for the error illustrations; it is tilted and given a question mark, never named. */
const PUZZLED_MASCOT = characterSvgDataUri(CHARACTER_REGISTRY.capybara.svgSource, 'blue');

export interface ErrorScreenAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface ErrorScreenProps {
  title: string;
  message: string;
  /** Omitted for a dead end such as a session that moved to another window; the message then says what to do. */
  action?: ErrorScreenAction;
  /** A quieter second way out beside `action` (the desktop app's way back to its start screen); never given on its own. */
  secondaryAction?: ErrorScreenAction;
  /** `main` when the screen is the whole page (bootstrap); `section` inside the app shell, which already has a `main`. */
  as?: 'main' | 'section';
}

/** The shared failure screen: a puzzled mascot, the title, the message and at most two actions, the main one first. */
export default function ErrorScreen({
  title, message, action, secondaryAction, as: Element = 'main',
}: ErrorScreenProps) {
  return (
    <Element className="app-screen app-screen--error">
      <p className="app-screen__brand-mark" aria-hidden="true">OWN THE BLOCK</p>
      <div className="app-screen__figure" aria-hidden="true">
        <img className="app-screen__puzzled" src={PUZZLED_MASCOT} alt="" draggable={false} />
        <span className="app-screen__question">?</span>
      </div>
      {/* The alert is the text only: a role on the whole screen would replace the main landmark. */}
      <div className="app-screen__alert" role="alert">
        <h1 className="app-screen__title">{title}</h1>
        <p className="app-screen__message">{message}</p>
      </div>
      {action ? <Button size="lg" icon={action.icon} onClick={action.onClick}>{action.label}</Button> : null}
      {action && secondaryAction
        ? <Button variant="ghost" size="lg" icon={secondaryAction.icon} onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
        : null}
      <HowToPlayButton placement="corner" />
    </Element>
  );
}
