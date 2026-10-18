import type * as THREE from 'three';

/**
 * Shader program pre-compilation (Phase B3). Pure with respect to React: it only needs the three.js renderer surface listed
 * below, so the polling, abort and fallback rules are unit-testable with a fake renderer.
 *
 * `renderer.compile()` creates every program for a subtree (hidden objects included) and returns at once, because with
 * `KHR_parallel_shader_compile` the driver links them on worker threads. What is left is waiting until each program reports
 * `isReady()` without blocking. `renderer.compileAsync()` does exactly that, but it cannot be cancelled and its 10 ms poll
 * never ends when the context is lost, so the wait is done here with an abort signal and a deadline. The shader error
 * check (`debug.checkShaderErrors`) is untouched: three.js runs it on the program's first use, which by then is a cheap
 * lookup instead of a blocking link.
 */

/** The part of a three.js program object the warm-up uses. */
export interface WarmupProgram {
  isReady(): boolean;
  /** First use of a program runs the link check (and blocks on a driver that compiles synchronously). */
  getUniforms?(): unknown;
  getAttributes?(): unknown;
}

/** The part of `THREE.WebGLRenderer` the warm-up uses. */
export interface WarmupRenderer {
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  compile(scene: THREE.Object3D, camera: THREE.Camera, targetScene?: THREE.Scene | null): Set<THREE.Material>;
  initTexture(texture: THREE.Texture): void;
  properties: { get(object: unknown): { currentProgram?: WarmupProgram } | undefined };
  extensions: { has(name: string): boolean };
  info: { programs?: readonly unknown[] | null };
}

export type CompileStatus = 'ready' | 'aborted' | 'timeout';

/** One subtree to compile. */
export interface CompileBatch {
  name: string;
  object: THREE.Object3D;
  /** Lights, fog and environment come from this scene; defaults to the compiled object itself. */
  targetScene?: THREE.Scene | null;
  /**
   * Programs are keyed on the render target they draw into (output color space, tone mapping): the shadow depth passes and a
   * post-processing chain draw into targets, so their programs must be created with one bound. Restored right after the
   * synchronous `compile()`; the wait for the links never needs it.
   */
  renderTarget?: THREE.WebGLRenderTarget | null;
}

export interface CompileOptions {
  signal?: AbortSignal;
  /** Overall deadline from the call. */
  timeoutMs: number;
  /** Time between non-blocking readiness checks. */
  pollMs?: number;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
}

export interface BatchResult {
  name: string;
  status: CompileStatus;
  /** Distinct materials handed to the renderer. */
  materials: number;
  /** Programs this batch created (the renderer's program count right after its `compile()` minus right before). */
  programsAdded: number;
  /** Time from the start of the call until this batch's last program was finished. */
  durationMs: number;
}

export interface CompileResult {
  status: CompileStatus;
  /** True when the driver exposes `KHR_parallel_shader_compile`; otherwise links run in time slices instead. */
  parallel: boolean;
  batches: BatchResult[];
}

export function programCount(renderer: Pick<WarmupRenderer, 'info'>): number {
  return renderer.info.programs?.length ?? 0;
}

const defaultNow = (): number => performance.now();
const defaultSetTimeout = (callback: () => void, delayMs: number): unknown => setTimeout(callback, delayMs);

/** Longest stretch of finishing work done before yielding to the browser (input, timers) again. */
export const FINALIZE_SLICE_MS = 8;

function currentProgram(renderer: WarmupRenderer, material: THREE.Material): WarmupProgram | undefined {
  return renderer.properties.get(material)?.currentProgram;
}

function startBatch(renderer: WarmupRenderer, batch: CompileBatch, camera: THREE.Camera): Set<THREE.Material> {
  if (!batch.renderTarget) return renderer.compile(batch.object, camera, batch.targetScene ?? null);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(batch.renderTarget);
  try {
    return renderer.compile(batch.object, camera, batch.targetScene ?? null);
  } finally {
    renderer.setRenderTarget(previous);
  }
}

/**
 * Starts compiling every program the batches need (all of them before any wait, so the driver works on all of them at once)
 * and resolves when each is ready to draw without a stall: compiled, and finished. A compiled program still costs a main-thread
 * round trip the first time three.js uses it (reading the link log, enumerating uniforms and attributes: about ten milliseconds
 * each on ANGLE), and that is where the first frame would pay it, so the warm-up performs that first use itself, a few
 * programs per task and as soon as each one is ready. The shader error check is part of that first use and stays on.
 *
 * A program that never becomes ready ends in 'timeout' so a stuck driver cannot hold the board, and an aborted signal ends in
 * 'aborted'. An exception from the renderer propagates to the caller.
 */
export async function compileBatches(
  renderer: WarmupRenderer,
  batches: readonly CompileBatch[],
  camera: THREE.Camera,
  options: CompileOptions,
): Promise<CompileResult> {
  const now = options.now ?? defaultNow;
  const schedule = options.setTimeout ?? defaultSetTimeout;
  const pollMs = options.pollMs ?? 8;
  const startedAt = now();
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');

  const jobs = batches.map(batch => {
    const before = programCount(renderer);
    const compiled = startBatch(renderer, batch, camera);
    return {
      batch,
      compiled,
      pending: new Set(compiled),
      programsAdded: Math.max(0, programCount(renderer) - before),
      finishedAt: null as number | null,
    };
  });

  const yieldToBrowser = (delayMs: number) => new Promise<void>(resolve => { schedule(resolve, delayMs); });
  const stopReason = (): CompileStatus | null => {
    if (options.signal?.aborted) return 'aborted';
    return now() - startedAt > options.timeoutMs ? 'timeout' : null;
  };
  const finish = (status: CompileStatus): CompileResult => ({
    status,
    parallel,
    batches: jobs.map(job => ({
      name: job.batch.name,
      status: job.pending.size === 0 ? 'ready' : status,
      materials: job.compiled.size,
      programsAdded: job.programsAdded,
      durationMs: (job.finishedAt ?? now()) - startedAt,
    })),
  });

  const finished = new Set<WarmupProgram>();
  let sliceStartedAt = now();
  for (;;) {
    for (const job of jobs) {
      for (const material of [...job.pending]) {
        const program = currentProgram(renderer, material);
        // Without KHR_parallel_shader_compile nothing is compiled in the background: the first-use link below happens here,
        // one program per slice, instead of all at once inside the first frame.
        if (program && parallel && !program.isReady()) continue;
        if (program && !finished.has(program)) {
          finished.add(program);
          program.getUniforms?.();
          program.getAttributes?.();
        }
        job.pending.delete(material);
        if (now() - sliceStartedAt >= FINALIZE_SLICE_MS) {
          const stop = stopReason();
          if (stop) return finish(stop);
          await yieldToBrowser(0);
          sliceStartedAt = now();
        }
      }
      if (job.pending.size === 0 && job.finishedAt === null) job.finishedAt = now();
    }
    if (jobs.every(job => job.pending.size === 0)) return finish('ready');
    const stop = stopReason();
    if (stop) return finish(stop);
    await yieldToBrowser(pollMs);
    sliceStartedAt = now();
  }
}
