import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import BootstrapErrorScreen from './BootstrapErrorScreen';

interface AppErrorBoundaryProps {
  children: ReactNode;
  reload?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Top-level client render failed.', error, info.componentStack);
  }

  private readonly recover = (): void => {
    (this.props.reload ?? (() => window.location.reload()))();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <BootstrapErrorScreen
          kind="render"
          title="Không thể hiển thị trò chơi"
          onRetry={this.recover}
        />
      );
    }
    return this.props.children;
  }
}
