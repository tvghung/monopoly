import { createTileHoverStore, type TileHoverStore } from '../../game/scene/board/tileHoverStore';

/**
 * What the board tells the scene layer: the part of its state the scene draws or reports into. The layer reads it, the board writes it.
 */
export interface SceneBinding {
  selectedTileId: number | null;
  onTileSelect: (tileId: number) => void;
  onRendererFailure: (error?: Error) => void;
}

export interface SceneLayerSnapshot {
  /** The board is on screen and has taken the scene's host element into its slot. */
  slotAttached: boolean;
  selectedTileId: number | null;
  /** Incremented every time the host is moved into a slot: the scene draws one frame on it. */
  revealToken: number;
  /** The renderer failed (context lost, a render error) while the layer owned it; the board then plays on the legacy board. */
  failure: Error | null;
}

/**
 * The persistent 3D scene's home (Phase B3 follow-up, 08H Task 3, design A1). The scene is rendered once, into `host`, by the layer
 * above the Lobby/Board switch; `host` lives in an invisible parking element while there is no board (the lobby) and is moved into
 * the board's slot while there is one. Moving an element does not remount what is inside it, so the canvas, its WebGL context and
 * the warmed-up programs survive the lobby, the board and the next lobby (play again).
 *
 * The controller is plain state with subscribers (no React), so a hover, a selection or a reveal never renders the layer's parent.
 */
export class SceneLayerController {
  /** One hover store for the layer's lifetime, shared by the scene and the board's DOM readers. */
  readonly hoverStore: TileHoverStore = createTileHoverStore();

  readonly host: HTMLElement;

  private parking: HTMLElement | null = null;

  private slot: HTMLElement | null = null;

  private binding: SceneBinding | null = null;

  private snapshot: SceneLayerSnapshot = {
    slotAttached: false, selectedTileId: null, revealToken: 0, failure: null,
  };

  private readonly listeners = new Set<() => void>();

  constructor(ownerDocument: Document = document) {
    this.host = ownerDocument.createElement('div');
    this.host.className = 'scene-host';
    this.host.dataset.testid = 'scene-host';
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): SceneLayerSnapshot => this.snapshot;

  readonly getFailure = (): Error | null => this.snapshot.failure;

  /** The invisible parking element (rendered by the layer); the host goes back into it whenever no board holds it. */
  setParking(element: HTMLElement | null): void {
    this.parking = element;
    if (!this.slot && element) element.appendChild(this.host);
  }

  /** The board's slot takes the host. Returns the release function (the board unmounted): the host goes back to the parking element. */
  attachSlot(element: HTMLElement): () => void {
    this.slot = element;
    element.appendChild(this.host);
    this.update({ slotAttached: true, revealToken: this.snapshot.revealToken + 1 });
    return () => {
      if (this.slot !== element) return;
      this.slot = null;
      this.hoverStore.set(null);
      if (this.parking) this.parking.appendChild(this.host);
      else this.host.remove();
      this.update({ slotAttached: false });
    };
  }

  /** The board registers what it owns. Returns the unregister function; nothing is bound while there is no board. */
  bind(binding: SceneBinding): () => void {
    this.binding = binding;
    this.update({ selectedTileId: binding.selectedTileId });
    return () => {
      if (this.binding !== binding) return;
      this.binding = null;
      this.update({ selectedTileId: null });
    };
  }

  /** Stable entry for the scene: forwards to whichever board is bound now (a selection with no board is dropped). */
  readonly selectTile = (tileId: number): void => {
    this.binding?.onTileSelect(tileId);
  };

  /** The scene reports a renderer failure; the layer stops rendering it and the board (if any) switches to the legacy board. */
  readonly reportFailure = (error?: Error): void => {
    if (this.snapshot.failure) return;
    this.update({ failure: error ?? new Error('The scene renderer failed') });
    this.binding?.onRendererFailure(error);
  };

  /** The layer is done (the player left the room): forget a failure so the next room tries the 3D board again. */
  reset(): void {
    this.hoverStore.set(null);
    if (this.snapshot.failure) this.update({ failure: null });
  }

  private update(patch: Partial<SceneLayerSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    const changed = (Object.keys(patch) as Array<keyof SceneLayerSnapshot>).some(key => next[key] !== this.snapshot[key]);
    if (!changed) return;
    this.snapshot = next;
    [...this.listeners].forEach(listener => listener());
  }
}
