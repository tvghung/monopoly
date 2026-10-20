let appModule: Promise<typeof import('../../App')> | null = null;

/** The launcher can fetch the gameplay UI while the player is filling a room form. */
export function loadGameApp(): Promise<typeof import('../../App')> {
  if (!appModule) {
    appModule = import('../../App').catch(error => {
      appModule = null;
      throw error;
    });
  }
  return appModule;
}

export function preloadGameApp(): void {
  void loadGameApp().catch(() => {
    // A later load attempt can retry after a failed preload.
  });
}