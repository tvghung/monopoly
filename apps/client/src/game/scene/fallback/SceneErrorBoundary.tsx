import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

interface SceneErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface SceneErrorBoundaryState {
  hasError: boolean;
}

export default class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  public state: SceneErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error);
    console.error('2.5D board renderer failed; using the legacy board fallback.', error, info.componentStack);
  }

  public render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
