import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PowerUpDefinition } from '@monopoly/shared';
import PowerUpCard from './PowerUpCard';
import PowerUpArtwork from './PowerUpArtwork';
import { POWER_UP_FRONT_ART, POWER_UP_BACK_ART, POWER_UP_RARITY_TREATMENTS, powerUpArtwork } from './powerUpArtManifest';

afterEach(cleanup);
const definition: PowerUpDefinition = { definitionId:'A01', name:'Móc Túi', description:'Approved authoritative meaning', category:'ATTACK', rarity:'COMMON', activation:'ACTIVE', effectKey:'TRANSFER_CASH' };
describe('Power-up artwork presentation boundaries',()=>{
 it('maps exactly 30 explicit IDs, three backs and four distinct frames',()=>{
  expect(Object.keys(POWER_UP_FRONT_ART)).toHaveLength(30);expect(Object.keys(POWER_UP_BACK_ART)).toHaveLength(3);
  expect(new Set(Object.values(POWER_UP_RARITY_TREATMENTS)).size).toBe(4);
  for(const [id,relative]of Object.entries(POWER_UP_FRONT_ART))expect(powerUpArtwork('ATTACK',id).svg).toContain(relative+'.svg');
 });
 it('category-only backs contain no front URL, rarity, identity or effect in DOM or accessibility text',()=>{
  const {container}=render(<PowerUpCard category="ATTACK" onChoose={()=>{}} />);
  expect(container.querySelector('img')?.getAttribute('src')).toContain('/backs/attack.svg');
  expect(container.innerHTML).not.toMatch(/fronts|A01|Móc Túi|COMMON|data-rarity|data-frame/);
  expect(screen.getByRole('button',{name:'Tấn công'})).toBeTruthy();
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
 });
 it('reveals the correct identity only when an authorized definition is supplied; reconnect hydration renders the same art',()=>{
  const view=render(<PowerUpCard category="ATTACK" />);expect(view.container.querySelector('img')?.src).toContain('backs/attack.svg');
  view.rerender(<PowerUpCard category="ATTACK" definition={definition} />);expect(view.container.querySelector('img')?.src).toContain('fronts/A01.svg');expect(screen.getByText('Móc Túi')).toBeTruthy();
  const before=view.container.innerHTML;view.unmount();const restored=render(<PowerUpCard category="ATTACK" definition={definition} />);expect(restored.container.innerHTML).toBe(before);
 });
 it('SVG failure uses the matching PNG, then a coherent category fallback without blocking decisions',()=>{
  const view=render(<PowerUpCard category="ATTACK" definition={definition} onChoose={()=>{}} />);
  fireEvent.error(view.container.querySelector('img')!);expect(view.container.querySelector('img')?.src).toContain('fronts/A01.png');
  fireEvent.error(view.container.querySelector('img')!);expect(view.container.querySelector('img')).toBeNull();expect(view.container.querySelector('[data-artwork-state="fallback"]')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Móc Túi'}).hasAttribute('disabled')).toBe(false);
 });
 it('a failed prior card does not poison a different card; unknown IDs cannot form arbitrary paths',()=>{
  const view=render(<PowerUpArtwork category="ATTACK" definitionId="A01" />);fireEvent.error(view.container.querySelector('img')!);fireEvent.error(view.container.querySelector('img')!);
  view.rerender(<PowerUpArtwork category="DEFENSE" definitionId="D01" />);expect(view.container.querySelector('img')?.src).toContain('fronts/D01.svg');
  expect(powerUpArtwork('UTILITY','../../secret').svg).toContain('backs/utility.svg');expect(powerUpArtwork('ATTACK','toString').official).toBe(false);
 });
 it.each(Object.keys(POWER_UP_RARITY_TREATMENTS) as PowerUpDefinition['rarity'][])('renders %s frame independently of its illustration',rarity=>{
  const view=render(<PowerUpCard category="ATTACK" definition={{...definition,rarity}} />);
  expect(view.container.querySelector('article')?.dataset.frame).toBe(POWER_UP_RARITY_TREATMENTS[rarity]);expect(view.container.querySelector('img')?.src).toContain('A01.svg');
 });
});
