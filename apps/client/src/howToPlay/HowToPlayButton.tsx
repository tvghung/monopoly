import Button from '../design-system/components/Button/Button';
import IconButton from '../design-system/components/IconButton/IconButton';
import { ActionIcon } from '../design-system/icons/ActionIcon';
import { useHowToPlay } from './howToPlayContext';
import { useTranslation } from '../i18n/I18n';
import './howToPlay.css';

export interface HowToPlayButtonProps {
  /**
   * `icon` is the round 44 px key for a toolbar or a corner. `labelled` is a ghost button with the words, for a roomy header
   * or card where an icon alone would be easy to miss.
   */
  variant?: 'icon' | 'labelled';
  /** `corner` pins the button to the top right of the screen, for screens that have no toolbar of their own. */
  placement?: 'inline' | 'corner';
  className?: string;
}

/**
 * The "?" key that opens the how-to-play dialog. It renders nothing outside a `HowToPlayProvider`. Never place a `corner`
 * button over the game board: the four screen corners belong to the player cards, and the game uses its toolbar instead.
 */
export default function HowToPlayButton({
  variant = 'icon',
  placement = 'inline',
  className = '',
}: HowToPlayButtonProps) {
  const { t } = useTranslation();
  const { available, open } = useHowToPlay();
  if (!available) return null;

  const classes = [
    'how-to-play-button',
    placement === 'corner' ? 'how-to-play-button--corner' : '',
    className,
  ].filter(Boolean).join(' ');

  if (variant === 'labelled') {
    return (
      <Button
        variant="ghost"
        className={classes}
        icon={<ActionIcon name="help" />}
        aria-haspopup="dialog"
        onClick={open}
      >
        {t('guide.title')}
      </Button>
    );
  }
  return (
    <IconButton
      label={t('guide.title')}
      icon="help"
      className={classes}
      aria-haspopup="dialog"
      onClick={open}
    />
  );
}
