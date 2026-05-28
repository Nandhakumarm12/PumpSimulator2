/**
 * BraunPumpContext — React context wrapping useBraunPump.
 * Mirrors src/contexts/PumpContext.tsx for the B. Braun Infusomat Space.
 * Allows any component (including Task Mode) to access B. Braun pump state
 * without prop-drilling.
 */

import React, { createContext, useContext } from 'react';
import { useBraunPump } from '../hooks/useBraunPump';

type BraunPumpContextValue = ReturnType<typeof useBraunPump>;

const BraunPumpContext = createContext<BraunPumpContextValue | null>(null);

export function BraunPumpProvider({ children }: { children: React.ReactNode }) {
  const pump = useBraunPump();
  return <BraunPumpContext.Provider value={pump}>{children}</BraunPumpContext.Provider>;
}

export function useBraunPumpContext(): BraunPumpContextValue {
  const ctx = useContext(BraunPumpContext);
  if (!ctx) throw new Error('useBraunPumpContext must be used within BraunPumpProvider');
  return ctx;
}
