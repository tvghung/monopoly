import { useState } from 'react';
import type { PowerUpCategory } from '@monopoly/shared';
import { Swords, Shield, Sparkles } from 'lucide-react';
import { powerUpArtwork } from './powerUpArtManifest';

const icons = { ATTACK: Swords, DEFENSE: Shield, UTILITY: Sparkles };
/** Decorative: adjacent real UI text contains the authoritative accessible description.
 * With no authorized definition, this component can request category backs only.
 */
export default function PowerUpArtwork({ category, definitionId, thumbnail = false }: {
  category: PowerUpCategory; definitionId?: string; thumbnail?: boolean;
}) {
  const artwork = powerUpArtwork(category, definitionId);
  const [failedSources, setFailedSources] = useState<readonly string[]>([]);
  const src = !failedSources.includes(artwork.svg) ? artwork.svg
    : !failedSources.includes(artwork.png) ? artwork.png : null;
  const Icon = icons[category];
  return <span className={'power-up-artwork' + (thumbnail ? ' power-up-artwork--thumbnail' : '')}
    aria-hidden="true" data-artwork-state={src === artwork.svg ? 'svg' : src ? 'png-fallback' : 'fallback'}>
    {src ? <img key={src} src={src} alt="" width={640} height={400} decoding="async"
      onError={() => setFailedSources(previous => previous.includes(src) ? previous : [...previous, src])} />
      : <Icon size={48} />}
  </span>;
}
