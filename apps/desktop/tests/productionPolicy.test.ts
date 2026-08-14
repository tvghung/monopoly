import { describe, expect, it } from 'vitest';
import { shouldBlockProductionInput } from '../src/productionPolicy';

describe('production Electron input policy', () => {
  it('blocks reload and history shortcuts', () => {
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'F5' })).toBe(true);
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'r', control: true })).toBe(true);
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'r', meta: true })).toBe(true);
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'ArrowLeft', alt: true })).toBe(true);
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'BrowserForward' })).toBe(true);
  });

  it('keeps keyup and ordinary typing available', () => {
    expect(shouldBlockProductionInput({ type: 'keyUp', key: 'F5' })).toBe(false);
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'r' })).toBe(false);
    expect(shouldBlockProductionInput({ type: 'keyDown', key: 'ArrowLeft' })).toBe(false);
  });
});
