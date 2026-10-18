import { createContext } from 'react';
import type { SceneLayerController } from './SceneLayerController';

/**
 * The persistent scene layer above the Lobby/Board switch, or null where there is none (a board mounted on its own: the design
 * lab, tests, the UAT pages). The board then renders its scene itself, as it did before the layer existed.
 */
export const SceneLayerContext = createContext<SceneLayerController | null>(null);
