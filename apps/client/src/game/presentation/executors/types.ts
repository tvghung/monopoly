import type { PresentationExecutor } from '../queue/types';
import type { PresentationEvent } from '../events/types';
import type { PresentationStoreLike } from '../store/types';

export interface ExecutorFactoryContext {
  store: PresentationStoreLike;
}

export type AnyPresentationExecutor = PresentationExecutor<PresentationEvent>;

