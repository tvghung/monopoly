import type { CharacterId, PlayerColorId } from '@monopoly/shared';

export interface CharacterTextureDiagnostic {
  stage: string;
  key: string;
  characterId: CharacterId | null;
  playerColor: PlayerColorId;
  svgSourceExists: boolean;
  svgSourceLength: number;
  dataUriLength: number;
  loaded?: boolean;
  imageWidth?: number;
  imageHeight?: number;
  error?: string;
}

const MAX_DIAGNOSTICS = 256;
const diagnosticBuffer: CharacterTextureDiagnostic[] = [];
const DEBUG_WINDOW_KEY = '__ownTheBlockCharacterTextureDiagnostics';

interface DiagnosticWindow extends Window {
  [DEBUG_WINDOW_KEY]?: CharacterTextureDiagnostic[];
}

function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}

export function recordCharacterTextureDiagnostic(
  diagnostic: CharacterTextureDiagnostic,
): void {
  if (!isDevelopment()) return;

  diagnosticBuffer.push({
    ...diagnostic,
    error: diagnostic.error === undefined ? undefined : describeError(diagnostic.error),
  });
  if (diagnosticBuffer.length > MAX_DIAGNOSTICS) diagnosticBuffer.shift();

  if (typeof window !== 'undefined') {
    const debugWindow = window as DiagnosticWindow;
    debugWindow[DEBUG_WINDOW_KEY] = [...diagnosticBuffer];
    if (new URLSearchParams(window.location.search).get('characterTextureDebug') === '1') {
      console.info('[character-texture]', JSON.stringify(diagnosticBuffer.at(-1)));
    }
  }
}

export function getCharacterTextureDiagnostics(): readonly CharacterTextureDiagnostic[] {
  return diagnosticBuffer;
}

export function resetCharacterTextureDiagnosticsForTests(): void {
  diagnosticBuffer.length = 0;
  if (typeof window !== 'undefined') {
    delete (window as DiagnosticWindow)[DEBUG_WINDOW_KEY];
  }
}
