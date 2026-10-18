import { describe, expect, it, vi } from 'vitest';
import { SceneLayerController } from './SceneLayerController';

function setup() {
  const controller = new SceneLayerController();
  const parking = document.createElement('div');
  const slot = document.createElement('div');
  document.body.append(parking, slot);
  controller.setParking(parking);
  return { controller, parking, slot };
}

describe('SceneLayerController', () => {
  it('keeps the host in the parking element until a slot takes it, and returns it there', () => {
    const { controller, parking, slot } = setup();
    expect(controller.host.parentElement).toBe(parking);
    const release = controller.attachSlot(slot);
    expect(controller.host.parentElement).toBe(slot);
    expect(controller.getSnapshot().slotAttached).toBe(true);
    release();
    expect(controller.host.parentElement).toBe(parking);
    expect(controller.getSnapshot().slotAttached).toBe(false);
  });

  it('is the same element through parking, a slot, parking and another slot (nothing inside is remounted)', () => {
    const { controller, parking, slot } = setup();
    const child = document.createElement('canvas');
    controller.host.append(child);
    const other = document.createElement('div');
    document.body.append(other);
    controller.attachSlot(slot)();
    controller.attachSlot(other);
    expect(controller.host.firstElementChild).toBe(child);
    expect(parking.childElementCount).toBe(0);
  });

  it('counts every reveal, so the scene draws a frame each time it is shown', () => {
    const { controller, slot } = setup();
    const before = controller.getSnapshot().revealToken;
    controller.attachSlot(slot)();
    controller.attachSlot(slot);
    expect(controller.getSnapshot().revealToken).toBe(before + 2);
  });

  it('ignores a release from a slot that is no longer current', () => {
    const { controller, parking, slot } = setup();
    const other = document.createElement('div');
    document.body.append(other);
    const releaseFirst = controller.attachSlot(slot);
    controller.attachSlot(other);
    releaseFirst();
    expect(controller.host.parentElement).toBe(other);
    expect(parking.childElementCount).toBe(0);
  });

  it('clears the hovered tile when the board leaves', () => {
    const { controller, slot } = setup();
    const release = controller.attachSlot(slot);
    controller.hoverStore.set(7);
    release();
    expect(controller.hoverStore.get()).toBeNull();
  });

  it('forwards a selection to the bound board and drops it when there is none', () => {
    const { controller } = setup();
    const onTileSelect = vi.fn();
    controller.selectTile(3);
    expect(onTileSelect).not.toHaveBeenCalled();
    const unbind = controller.bind({ selectedTileId: 5, onTileSelect, onRendererFailure: vi.fn() });
    expect(controller.getSnapshot().selectedTileId).toBe(5);
    controller.selectTile(3);
    expect(onTileSelect).toHaveBeenCalledWith(3);
    unbind();
    expect(controller.getSnapshot().selectedTileId).toBeNull();
    controller.selectTile(4);
    expect(onTileSelect).toHaveBeenCalledTimes(1);
  });

  it('an old binding cannot unbind a newer one', () => {
    const { controller } = setup();
    const first = controller.bind({ selectedTileId: 1, onTileSelect: vi.fn(), onRendererFailure: vi.fn() });
    controller.bind({ selectedTileId: 2, onTileSelect: vi.fn(), onRendererFailure: vi.fn() });
    first();
    expect(controller.getSnapshot().selectedTileId).toBe(2);
  });

  it('a renderer failure is recorded once, reaches the bound board, and is forgotten on reset', () => {
    const { controller } = setup();
    const onRendererFailure = vi.fn();
    controller.bind({ selectedTileId: null, onTileSelect: vi.fn(), onRendererFailure });
    const error = new Error('context lost');
    controller.reportFailure(error);
    controller.reportFailure(new Error('again'));
    expect(controller.getFailure()).toBe(error);
    expect(onRendererFailure).toHaveBeenCalledTimes(1);
    expect(onRendererFailure).toHaveBeenCalledWith(error);
    controller.reset();
    expect(controller.getFailure()).toBeNull();
  });

  it('a failure with no board is kept for the board that comes next', () => {
    const { controller } = setup();
    controller.reportFailure(new Error('lost in the lobby'));
    expect(controller.getFailure()).not.toBeNull();
  });

  it('notifies subscribers of a change, and of nothing else', () => {
    const { controller, slot } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.hoverStore.set(2);
    expect(listener).not.toHaveBeenCalled();
    const release = controller.attachSlot(slot);
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    unsubscribe();
    controller.attachSlot(slot);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reset drops a hovered tile', () => {
    const { controller } = setup();
    controller.hoverStore.set(9);
    controller.reset();
    expect(controller.hoverStore.get()).toBeNull();
  });
});
