import { createContext, useContext } from 'react';
import { computeDaylight } from '../../shared/simulation/daylight';
import type { Daylight } from '../../shared/simulation/daylight';

/** Current lighting of the office, shared with every object that reacts to it. */
export const DaylightContext = createContext<Daylight>(computeDaylight(13));

export function useDaylight(): Daylight {
  return useContext(DaylightContext);
}
