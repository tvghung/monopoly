import type { ComponentType, ReactNode } from 'react';
import * as THREE from 'three';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { DiceRenderModel } from '../board/boardRenderModel';
import { RENDER_QUALITY_CONFIGS } from '../render/renderQuality';
import type { RenderQualityContext as RenderQualityContextType } from '../render/RenderQualityContext';

// The dice subtree only needs two things from R3F: `useFrame` (a no-op here) and `useThree(state => state.invalidate)`.
// The module registry is reset first so these mocks apply whichever test file ran before in the same worker.
let DiceLayer: ComponentType<{ model: DiceRenderModel; reducedMotion?: boolean }>;
let QualityContext: typeof RenderQualityContextType;
// Under React DOM an <instancedMesh> is a DOM element; the pips' layout effect only needs these two members of it.
const FAKE_INSTANCED_MESH_MEMBERS = {
  setMatrixAt: { configurable: true, value: () => undefined },
  instanceMatrix: { configurable: true, get: () => ({ needsUpdate: false }) },
} satisfies PropertyDescriptorMap;
let disposeSpy: MockInstance<() => void>;
const disposedTypes = () => disposeSpy.mock.contexts.map(context => (context as THREE.Material).type);

beforeEach(async () => {
  Object.defineProperties(HTMLElement.prototype, FAKE_INSTANCED_MESH_MEMBERS);
  vi.resetModules();
  vi.doMock('@react-three/fiber', () => ({
    useFrame: () => undefined,
    useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => undefined }),
  }));
  vi.doMock('../fx/ContactShadow', () => ({
    CONTACT_SHADOW_GEOMETRY: new THREE.PlaneGeometry(1, 1),
    CONTACT_SHADOW_TEXTURE: new THREE.Texture(),
  }));
  // The spy calls through; its recorded `this` values tell which material types were disposed.
  disposeSpy = vi.spyOn(THREE.Material.prototype, 'dispose');
  ({ default: DiceLayer } = await import('./DiceLayer'));
  ({ RenderQualityContext: QualityContext } = await import('../render/RenderQualityContext'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'setMatrixAt');
  Reflect.deleteProperty(HTMLElement.prototype, 'instanceMatrix');
  vi.doUnmock('@react-three/fiber');
  vi.doUnmock('../fx/ContactShadow');
});

const model = (phase: DiceRenderModel['phase'], rollSequence: number): DiceRenderModel => ({
  dice: { dice1: 3, dice2: 4 },
  ...(rollSequence > 1 ? { fromDice: { dice1: 1, dice2: 2 } } : {}),
  rollSequence,
  phase,
  durationMs: 900,
});
const hidden: DiceRenderModel = { dice: { dice1: 0, dice2: 0 }, rollSequence: 0, phase: 'HIDDEN', durationMs: 0 };

function Tier({ tier, children }: { tier: 'low' | 'balanced' | 'high'; children: ReactNode }) {
  return <QualityContext.Provider value={RENDER_QUALITY_CONFIGS[tier]}>{children}</QualityContext.Provider>;
}

const count = (type: string) => disposedTypes().filter(entry => entry === type).length;

describe('dice effect materials outlive the dice and the rolls (audit PERF-05)', () => {
  it('keeps the trail and contact-shadow materials while the dice appear, roll, settle and disappear again', () => {
    const view = render(<Tier tier="balanced"><DiceLayer model={hidden} /></Tier>);
    const sequence: DiceRenderModel[] = [
      model('ROLLING', 1), model('SETTLED', 1), model('ROLLING', 2), model('SETTLED', 2),
      hidden, // a replay or reset hides the dice entirely: their subtree unmounts
      model('ROLLING', 1), model('SETTLED', 1), hidden, model('ROLLING', 1),
    ];
    sequence.forEach(next => view.rerender(<Tier tier="balanced"><DiceLayer model={next} /></Tier>));
    expect(count('ShaderMaterial')).toBe(0);
    expect(count('MeshBasicMaterial')).toBe(0);
  });

  it('releases them exactly once, with the layer: one shadow material and one trail per die on Balanced', () => {
    const view = render(<Tier tier="balanced"><DiceLayer model={model('ROLLING', 1)} /></Tier>);
    view.rerender(<Tier tier="balanced"><DiceLayer model={model('SETTLED', 1)} /></Tier>);
    view.unmount();
    expect(count('ShaderMaterial')).toBe(1);
    expect(count('MeshBasicMaterial')).toBe(2);
  });

  it('has two trails per die on High and none on Low', () => {
    const high = render(<Tier tier="high"><DiceLayer model={model('ROLLING', 1)} /></Tier>);
    high.unmount();
    expect(count('MeshBasicMaterial')).toBe(4);
    disposeSpy.mockClear();
    const low = render(<Tier tier="low"><DiceLayer model={model('ROLLING', 1)} /></Tier>);
    low.unmount();
    expect(count('MeshBasicMaterial')).toBe(0);
    expect(count('ShaderMaterial')).toBe(1);
  });

  it('replaces the trail materials when the quality tier changes the trail count, and only then', () => {
    const view = render(<Tier tier="balanced"><DiceLayer model={model('SETTLED', 1)} /></Tier>);
    view.rerender(<Tier tier="balanced"><DiceLayer model={model('ROLLING', 2)} /></Tier>);
    expect(count('MeshBasicMaterial')).toBe(0);
    view.rerender(<Tier tier="high"><DiceLayer model={model('ROLLING', 2)} /></Tier>);
    // The two single trails of the Balanced tier are gone, replaced by two trails per die.
    expect(count('MeshBasicMaterial')).toBe(2);
    expect(count('ShaderMaterial')).toBe(0);
  });

  it('survives repeated mount and unmount cycles, releasing each cycle\'s materials once', () => {
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const view = render(<Tier tier="balanced"><DiceLayer model={model('SETTLED', 1)} /></Tier>);
      view.unmount();
    }
    expect(count('ShaderMaterial')).toBe(4);
    expect(count('MeshBasicMaterial')).toBe(8);
  });

  it('still renders the dice arena with both dice and the contact-shadow batch when the dice are visible', () => {
    const { container } = render(<Tier tier="balanced"><DiceLayer model={model('SETTLED', 1)} /></Tier>);
    expect(container.querySelector('group[name="DiceArena"]')).not.toBeNull();
    expect(container.querySelector('group[name="ProceduralDie1"]')).not.toBeNull();
    expect(container.querySelector('group[name="ProceduralDie2"]')).not.toBeNull();
    cleanup();
    const empty = render(<Tier tier="balanced"><DiceLayer model={hidden} /></Tier>);
    expect(empty.container.querySelector('group[name="ProceduralDie1"]')).toBeNull();
  });
});
