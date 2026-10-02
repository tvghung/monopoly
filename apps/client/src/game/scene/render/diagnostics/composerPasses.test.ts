import { describe, expect, it } from 'vitest';
import { countComposerPasses, registerComposerPassCounter } from './composerPasses';

describe('composer pass registry', () => {
  it('reports zero passes when no post chain is mounted', () => {
    expect(countComposerPasses()).toBe(0);
  });

  it('reports the registered counter and forgets it after unregistering', () => {
    const unregister = registerComposerPassCounter(() => 4);
    expect(countComposerPasses()).toBe(4);
    unregister();
    expect(countComposerPasses()).toBe(0);
  });

  it('keeps a newer counter when an older registration is cleaned up late', () => {
    const unregisterOld = registerComposerPassCounter(() => 3);
    const unregisterNew = registerComposerPassCounter(() => 5);
    unregisterOld();
    expect(countComposerPasses()).toBe(5);
    unregisterNew();
    expect(countComposerPasses()).toBe(0);
  });
});
