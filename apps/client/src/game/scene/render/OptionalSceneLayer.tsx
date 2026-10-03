import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

interface OptionalSceneLayerProps {
  /** Shown in the single warning logged when the layer fails. */
  name: string;
  children: ReactNode;
  /** Called once when the layer fails, so a parent can swap in a placeholder (plan 05 §7.7). */
  onFail?: () => void;
  /** A changed value clears an earlier failure, so a layer that failed in one graphics tier is tried again in the next. */
  resetKey?: string;
}

interface OptionalSceneLayerState {
  failed: boolean;
  resetKey?: string;
}

/**
 * Wraps a purely cosmetic scene layer (environment, table, post-processing, trays). A suspended load
 * renders nothing instead of hiding the board behind the loader, and an error disables just this layer
 * instead of escalating to the permanent legacy-board switch reserved for real renderer failures.
 */
export default class OptionalSceneLayer extends Component<OptionalSceneLayerProps, OptionalSceneLayerState> {
  state: OptionalSceneLayerState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<OptionalSceneLayerState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: OptionalSceneLayerProps,
    state: OptionalSceneLayerState,
  ): Partial<OptionalSceneLayerState> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(`[scene] optional layer "${this.props.name}" was disabled after an error.`, error, info.componentStack);
    this.props.onFail?.();
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}
