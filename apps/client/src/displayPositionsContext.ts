import { createContext } from 'react';

// Maps each player id to the tile its token is currently *shown* on. This lags
// the authoritative server position while a token walks the board one tile at a
// time (see useSteppedPositions), giving the field-by-field movement visual.
const displayPositionsContext = createContext<Record<string, number>>({});
export default displayPositionsContext;
