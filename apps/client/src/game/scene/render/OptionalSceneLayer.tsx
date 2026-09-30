import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

interface OptionalSceneLayerProps {
  /** Shown in the single warning logged when the layer fails. */
  name: string;
  children: ReactNode;
}

interface OptionalSceneLayerState {
  failed: boolean;
}

/**
 * Wraps a purely cosmetic scene layer (environment, table, post-processing, trays). A suspended load
 * renders nothing instead of hiding the board behind the loader, and an error disables just this layer
 * instead of escalating to the permanent legacy-board switch reserved for real renderer failures.
 */
export default class OptionalSceneLayer extends Component<OptionalSceneLayerProps, OptionalSceneLayerState> {
  state: OptionalSceneLayerState = { failed: false };

  static getDerivedStateFromError(): OptionalSceneLayerState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(`[scene] optional layer "${this.props.name}" was disabled after an error.`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}
