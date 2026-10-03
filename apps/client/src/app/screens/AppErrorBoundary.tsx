import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { HowToPlayProvider } from '../../howToPlay/HowToPlayProvider';
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
        // The app's own provider sits below this boundary and is gone with the failed tree, so the failure screen brings one.
        <HowToPlayProvider>
          <BootstrapErrorScreen
            kind="render"
            title="Không thể hiển thị trò chơi"
            onRetry={this.recover}
          />
        </HowToPlayProvider>
      );
    }
    return this.props.children;
  }
}
