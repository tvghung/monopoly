function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Returns `previous` wherever `next` holds equal data, and a new value only where something differs, so a consumer that
 * compares by identity (`memo`, a dependency array) sees a change exactly when the data changed. Arrays and plain objects are
 * compared by content, element by element, and keep every unchanged element and field of `previous`; anything else (a class
 * instance, a function, a Map) is compared with `Object.is` and is never taken apart.
 *
 * It never changes what the data says: the result is always equal to `next` by content.
 */
export function shareStructurally<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    let unchanged = previous.length === next.length;
    const merged = (next as unknown[]).map((item, index) => {
      if (index >= previous.length) return item;
      const shared = shareStructurally((previous as unknown[])[index], item);
      if (shared !== (previous as unknown[])[index]) unchanged = false;
      return shared;
    });
    return (unchanged ? previous : merged) as T;
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    const keys = Object.keys(next);
    let unchanged = keys.length === Object.keys(previous).length;
    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      if (!Object.hasOwn(previous, key)) {
        unchanged = false;
        merged[key] = next[key];
        continue;
      }
      const shared = shareStructurally(previous[key], next[key]);
      if (shared !== previous[key]) unchanged = false;
      merged[key] = shared;
    }
    return (unchanged ? previous : merged) as T;
  }
  return next;
}
