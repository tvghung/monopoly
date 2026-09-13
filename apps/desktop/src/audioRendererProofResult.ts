export interface AudioRendererProofResult {
  pass: boolean;
  status: string;
}

export function isAudioRendererProofResult(value: unknown): value is AudioRendererProofResult {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && 'pass' in value
    && typeof value.pass === 'boolean'
    && 'status' in value
    && typeof value.status === 'string';
}

export function audioRendererProofExitCode(value: unknown): 0 | 1 {
  return isAudioRendererProofResult(value) && value.pass ? 0 : 1;
}
