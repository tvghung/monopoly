/**
 * The post chain reports how many full-screen passes its composer runs per frame (plan 02 §8.9 "Post
 * passes"). Diagnostics read it through this registry so the scene code does not depend on the lazily
 * loaded post chunk.
 */
let counter: (() => number) | null = null;

/** Registers the live pass counter; returns the unregister function. */
export function registerComposerPassCounter(next: () => number): () => void {
  counter = next;
  return () => {
    if (counter === next) counter = null;
  };
}

export function countComposerPasses(): number {
  return counter ? counter() : 0;
}
