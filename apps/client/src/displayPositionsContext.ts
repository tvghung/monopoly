import { createContext } from 'react';

// Compatibility adapter for existing board consumers. Values originate from
// the PresentationStore; this context does not own movement or timing.
const displayPositionsContext = createContext<Record<string, number>>({});
export default displayPositionsContext;
