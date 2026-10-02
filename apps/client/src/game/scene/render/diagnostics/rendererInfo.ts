import * as THREE from 'three';

/** Human-readable name of `gl.toneMapping`, so diagnostics report the real renderer state. */
export function toneMappingName(mapping: THREE.ToneMapping): string {
  switch (mapping) {
    case THREE.NoToneMapping: return 'NoToneMapping';
    case THREE.LinearToneMapping: return 'LinearToneMapping';
    case THREE.ReinhardToneMapping: return 'ReinhardToneMapping';
    case THREE.CineonToneMapping: return 'CineonToneMapping';
    case THREE.ACESFilmicToneMapping: return 'ACESFilmicToneMapping';
    case THREE.CustomToneMapping: return 'CustomToneMapping';
    case THREE.AgXToneMapping: return 'AgXToneMapping';
    case THREE.NeutralToneMapping: return 'NeutralToneMapping';
    default: return `ToneMapping(${String(mapping)})`;
  }
}

export function shadowMapTypeName(type: THREE.ShadowMapType): string {
  switch (type) {
    case THREE.BasicShadowMap: return 'BasicShadowMap';
    case THREE.PCFShadowMap: return 'PCFShadowMap';
    case THREE.PCFSoftShadowMap: return 'PCFSoftShadowMap';
    case THREE.VSMShadowMap: return 'VSMShadowMap';
    default: return `ShadowMap(${String(type)})`;
  }
}

/** The renderer surface the counter needs; `THREE.WebGLRenderer` satisfies it. */
export interface CountableRenderer {
  info: {
    autoReset: boolean;
    reset: () => void;
    render: { calls: number; triangles: number };
  };
  render: (scene: THREE.Object3D, camera: THREE.Camera) => void;
  shadowMap: { render: (...args: never[]) => void };
}

export interface FrameStats {
  /** Number of scene (main pass) renders since the counter was installed. */
  frameSequence: number;
  /** Draw calls of the scene color pass: the quantity the historical 210/240 limits measured. */
  mainDrawCalls: number;
  /** Draw calls spent on shadow maps inside the frame. */
  shadowDrawCalls: number;
  /** Draw calls of every non-scene render (post-processing passes). */
  postDrawCalls: number;
  /** Number of non-scene renders (full-screen quads) inside the frame, including internal blur levels. */
  postRenders: number;
  totalDrawCalls: number;
  /** Triangles the GPU was asked to draw in the main pass (shadow and post excluded). */
  mainTriangles: number;
}

const emptyStats = (frameSequence: number): FrameStats => ({
  frameSequence,
  mainDrawCalls: 0,
  shadowDrawCalls: 0,
  postDrawCalls: 0,
  postRenders: 0,
  totalDrawCalls: 0,
  mainTriangles: 0,
});

/**
 * Per-frame renderer accounting. `gl.info` resets on every `renderer.render()` by default, so with
 * shadow maps or a post chain it only reports the last call. The counter turns off the automatic
 * reset, wraps `render` and `shadowMap.render`, and splits one frame into main/shadow/post.
 * Call `beginFrame()` before each frame (a very low priority `useFrame`); `stats` then describes the
 * last complete frame until the next `beginFrame()`.
 */
export class FrameCounter {
  private current = emptyStats(0);
  private sequence = 0;
  private readonly listeners = new Set<() => void>();
  private readonly originalRender: CountableRenderer['render'];
  private readonly originalShadowRender: CountableRenderer['shadowMap']['render'];
  private readonly previousAutoReset: boolean;
  private readonly hadOwnRender: boolean;
  private readonly hadOwnShadowRender: boolean;
  private shadowInsideRender = 0;
  private shadowTrianglesInsideRender = 0;

  constructor(private readonly renderer: CountableRenderer, private readonly mainScene: THREE.Object3D) {
    this.previousAutoReset = renderer.info.autoReset;
    this.hadOwnRender = Object.hasOwn(renderer, 'render');
    this.hadOwnShadowRender = Object.hasOwn(renderer.shadowMap, 'render');
    renderer.info.autoReset = false;
    this.originalRender = renderer.render;
    this.originalShadowRender = renderer.shadowMap.render;
    renderer.shadowMap.render = (...args) => {
      const before = renderer.info.render.calls;
      const trianglesBefore = renderer.info.render.triangles;
      this.originalShadowRender.apply(renderer.shadowMap, args);
      const spent = renderer.info.render.calls - before;
      this.shadowTrianglesInsideRender += renderer.info.render.triangles - trianglesBefore;
      this.current.shadowDrawCalls += spent;
      this.shadowInsideRender += spent;
    };
    renderer.render = (scene, camera) => {
      const callsBefore = renderer.info.render.calls;
      const trianglesBefore = renderer.info.render.triangles;
      this.shadowInsideRender = 0;
      this.shadowTrianglesInsideRender = 0;
      this.originalRender.call(renderer, scene, camera);
      const spent = renderer.info.render.calls - callsBefore;
      const triangles = renderer.info.render.triangles - trianglesBefore;
      if (scene === this.mainScene) {
        this.sequence += 1;
        this.current.frameSequence = this.sequence;
        this.current.mainDrawCalls += spent - this.shadowInsideRender;
        this.current.mainTriangles += triangles - this.shadowTrianglesInsideRender;
        this.current.totalDrawCalls = this.current.mainDrawCalls + this.current.shadowDrawCalls + this.current.postDrawCalls;
        this.listeners.forEach(listener => listener());
      } else {
        this.current.postDrawCalls += spent;
        this.current.postRenders += 1;
        this.current.totalDrawCalls = this.current.mainDrawCalls + this.current.shadowDrawCalls + this.current.postDrawCalls;
      }
    };
  }

  beginFrame(): void {
    this.renderer.info.reset();
    this.current = emptyStats(this.sequence);
  }

  get stats(): Readonly<FrameStats> {
    return this.current;
  }

  /** Called after every main scene render. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    // Restore the exact prior shape: drop the wrappers when the methods lived on the prototype.
    if (this.hadOwnRender) this.renderer.render = this.originalRender;
    else Reflect.deleteProperty(this.renderer, 'render');
    if (this.hadOwnShadowRender) this.renderer.shadowMap.render = this.originalShadowRender;
    else Reflect.deleteProperty(this.renderer.shadowMap, 'render');
    this.renderer.info.autoReset = this.previousAutoReset;
    this.listeners.clear();
  }
}
