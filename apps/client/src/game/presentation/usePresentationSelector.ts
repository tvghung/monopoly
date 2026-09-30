import { usePresentationSlice } from './PresentationProvider';
import type { PresentationState } from './store/types';

/**
 * Reads one slice of the presentation store. The component re-renders only when the selected value changes
 * (compared with `isEqual`, `Object.is` by default), not on every presentation tick like `usePresentation()`.
 * Pass a selector with a stable identity (define it outside the component or memoize it) that returns a stable
 * reference (pick a field) or supply a custom `isEqual`.
 *
 * A test can inject a static state through `presentationContext`; without a provider the slice is selected from an
 * empty presentation state.
 */
export function usePresentationSelector<T>(
  selector: (state: PresentationState) => T,
  isEqual: (previous: T, next: T) => boolean = Object.is,
): T {
  return usePresentationSlice(selector, isEqual);
}
