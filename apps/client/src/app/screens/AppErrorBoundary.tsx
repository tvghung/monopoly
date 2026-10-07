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
        // The screen is rebuilt after a render failure, while settings and the active language stay above this boundary.
        <HowToPlayProvider>
          <BootstrapErrorScreen
            kind="render"
            onRetry={this.recover}
          />
        </HowToPlayProvider>
      );
    }
    return this.props.children;
  }
}
