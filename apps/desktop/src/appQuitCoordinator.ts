export interface AppQuitEventLike {
  preventDefault(): void;
}

export interface AppQuitCoordinatorOptions {
  hasLiveWindow(): boolean;
  requestRendererDecision(): Promise<boolean>;
  stopRuntime(): Promise<void>;
  armFinalWindowClose(): void;
  quitApp(): void;
  reportError?(error: unknown): void;
}

export class AppQuitCoordinator {
  private pending: Promise<void> | null = null;
  private shutdownStarted = false;
  private finalQuitAuthorized = false;

  public constructor(private readonly options: AppQuitCoordinatorOptions) {}

  public handleBeforeQuit(event: AppQuitEventLike): void {
    if (this.finalQuitAuthorized) return;
    event.preventDefault();
    if (this.pending) return;

    this.pending = Promise.resolve()
      .then(() => this.options.hasLiveWindow()
        ? this.options.requestRendererDecision()
        : true)
      .catch(error => {
        this.options.reportError?.(error);
        return true;
      })
      .then(allowQuit => {
        if (allowQuit) return this.shutdown();
      })
      .finally(() => {
        this.pending = null;
      });
  }

  public async waitForSettled(): Promise<void> {
    await this.pending;
  }

  private async shutdown(): Promise<void> {
    if (this.shutdownStarted) return;
    this.shutdownStarted = true;
    try {
      await this.options.stopRuntime();
    } catch (error) {
      this.options.reportError?.(error);
    }
    this.finalQuitAuthorized = true;
    this.options.armFinalWindowClose();
    this.options.quitApp();
  }
}
