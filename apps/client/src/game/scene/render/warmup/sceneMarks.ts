/**
 * Load-path marks (`otb:scene:*`), each recorded the first time only. They exist to split the time between the page mounting and
 * the first warm-up (chunk request and evaluation, scene construction, renderer creation, the studio PMREM), which the B3
 * measurements could not attribute. A mark is an observation: it costs a microsecond and changes nothing.
 */
const seen = new Set<string>();

export function markSceneOnce(name: string): void {
  if (seen.has(name)) return;
  seen.add(name);
  try {
    performance.mark?.(`otb:scene:${name}`);
  } catch {
    // Not observable here (no Performance API); nothing depends on the mark.
  }
}

/** For tests: forget which marks were recorded. */
export function resetSceneMarks(): void {
  seen.clear();
}
