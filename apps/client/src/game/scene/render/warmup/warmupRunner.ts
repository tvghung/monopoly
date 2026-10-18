import type * as THREE from 'three';
import {
  compileBatches,
  programCount,
  type BatchResult,
  type CompileBatch,
  type CompileStatus,
  type WarmupRenderer,
} from './shaderCompile';

/**
 * The shader warm-up of one renderer (Phase B3): everything the board needs to draw its next frames without compiling a
 * program, prepared while the frame stream is held. Pure with respect to React and to WebGL itself (the renderer is the
 * `WarmupRenderer` surface), so the ordering, marks and failure rules are covered by unit tests.
 */

export type WarmupReason = 'initial' | 'tier-switch' | 'context-restored';

export type WarmupOutcome = 'complete' | 'incomplete' | 'aborted';

/** Extra work a layer needs before the board may draw (texture uploads, the high tier's post-processing passes). */
export interface WarmupStep {
  name: string;
  run(context: { signal: AbortSignal; deadlineMs: number }): Promise<CompileStatus>;
}

export interface WarmupStepReport {
  name: string;
  status: CompileStatus;
  materials: number;
  programsAdded: number;
  durationMs: number;
}

export interface WarmupReport {
  reason: WarmupReason;
  tier: string;
  outcome: WarmupOutcome;
  parallel: boolean;
  startedAtMs: number;
  durationMs: number;
  /** Time spent building the stand-in fixtures before the first compile (reported by the caller). */
  fixtureBuildMs: number;
  programsBefore: number;
  programsAfter: number;
  steps: WarmupStepReport[];
}

export interface WarmupInput {
  renderer: WarmupRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /**
   * Stand-ins for the variants that only exist mid-game or only inside a pass (shadow depth, mascots, effects). They are
   * compiled with the scene as their lighting target and never added to it.
   */
  fixtures: readonly CompileBatch[];
  steps?: readonly WarmupStep[];
  /** Awaited before anything is compiled (the studio environment must exist, because lit programs are keyed on it). */
  prerequisite?: (signal: AbortSignal) => Promise<unknown>;
  /**
   * What the tier changes about the draw path, resolved inside the warm-up because the high tier's post chain loads lazily:
   * the render target the scene is drawn into (the chain's input buffer; null means the screen) and the chain's own
   * full-screen programs.
   */
  resolveTier?: (signal: AbortSignal) => Promise<{ sceneTarget: THREE.WebGLRenderTarget | null; batches: readonly CompileBatch[] }>;
  reason: WarmupReason;
  tier: string;
  fixtureBuildMs?: number;
  signal: AbortSignal;
  /** Overall deadline; a program that is not ready by then ends the warm-up as `incomplete`. */
  timeoutMs: number;
  mark(name: string, detail?: Record<string, unknown>): void;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
}

/**
 * `otb:warmup:start` and `otb:warmup:done` are the boundaries of the first warm-up of a canvas. A later warm-up (a graphics
 * tier switch, a restored context) emits its own `otb:warmup:<reason>:start|done` so a measurement of the load keeps its
 * boundaries. `done` is emitted only when every step finished; a warm-up that timed out or was cancelled emits
 * `otb:warmup:incomplete` / `otb:warmup:aborted` instead, never `done`.
 */
export function warmupMarkName(reason: WarmupReason, edge: 'start' | 'done' | 'incomplete' | 'aborted'): string {
  return reason === 'initial' ? `otb:warmup:${edge}` : `otb:warmup:${reason}:${edge}`;
}

function stepFromBatch(result: BatchResult): WarmupStepReport {
  return {
    name: result.name,
    status: result.status,
    materials: result.materials,
    programsAdded: result.programsAdded,
    durationMs: result.durationMs,
  };
}

/** The signal aborted while a prerequisite was awaited: nothing was compiled. */
class WarmupCancelled extends Error {}

export async function runShaderWarmup(input: WarmupInput): Promise<WarmupReport> {
  const now = input.now ?? (() => performance.now());
  const startedAt = now();
  const remaining = (): number => Math.max(0, input.timeoutMs - (now() - startedAt));
  const programsBefore = programCount(input.renderer);
  const steps: WarmupStepReport[] = [];
  let parallel = false;
  input.mark(warmupMarkName(input.reason, 'start'), { reason: input.reason, tier: input.tier });

  let status: CompileStatus;
  try {
    // The board first: lights, shadow flags, fog and the environment are what the program variants are keyed on. All
    // batches are started together so the driver compiles them in parallel.
    if (input.prerequisite) await input.prerequisite(input.signal);
    if (input.signal.aborted) throw new WarmupCancelled();
    const tier = input.resolveTier ? await input.resolveTier(input.signal) : { sceneTarget: null, batches: [] };
    const sceneTarget = tier.sceneTarget;
    const compiled = await compileBatches(
      input.renderer,
      [
        { name: 'scene', object: input.scene, renderTarget: sceneTarget },
        // Fixtures that draw into the screen follow the scene's target; the shadow depth batch brings its own.
        ...input.fixtures.map(batch => ({ ...batch, targetScene: input.scene, renderTarget: batch.renderTarget ?? sceneTarget })),
        // The chain's passes draw their own one-triangle scenes, which hold no lights: lighting is part of a program's key.
        ...tier.batches,
      ],
      input.camera,
      { signal: input.signal, timeoutMs: remaining(), now: input.now, setTimeout: input.setTimeout },
    );
    parallel = compiled.parallel;
    steps.push(...compiled.batches.map(stepFromBatch));
    status = compiled.status;
    for (const step of input.steps ?? []) {
      if (status !== 'ready') break;
      const started = now();
      status = await step.run({ signal: input.signal, deadlineMs: remaining() });
      steps.push({ name: step.name, status, materials: 0, programsAdded: 0, durationMs: now() - started });
    }
  } catch (error) {
    if (error instanceof WarmupCancelled) {
      status = 'aborted';
    } else {
    // A renderer that throws (lost context, a driver error) must not leave the board held: report it as not complete.
    console.warn('[scene] shader warm-up failed; programs will compile on first use.', error);
    status = 'aborted';
    }
  }

  const outcome: WarmupOutcome = status === 'ready' ? 'complete' : status === 'aborted' ? 'aborted' : 'incomplete';
  const report: WarmupReport = {
    reason: input.reason,
    tier: input.tier,
    outcome,
    parallel,
    startedAtMs: startedAt,
    durationMs: now() - startedAt,
    fixtureBuildMs: input.fixtureBuildMs ?? 0,
    programsBefore,
    programsAfter: programCount(input.renderer),
    steps,
  };
  const edge = outcome === 'complete' ? 'done' : outcome;
  input.mark(warmupMarkName(input.reason, edge), { ...report });
  return report;
}
