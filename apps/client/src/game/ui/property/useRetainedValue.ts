import { useState } from 'react';

/**
 * The latest non-null value, kept while `value` is null. A dialog that is driven by "which tile / which player" uses it
 * to keep showing what it showed while it animates out, instead of emptying the moment the selection is cleared.
 */
export function useRetainedValue<T>(value: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(value);
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}
