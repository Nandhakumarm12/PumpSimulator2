import React, { createContext, useContext } from 'react';
import { usePump } from '../hooks/usePump';

type PumpContextValue = ReturnType<typeof usePump>;

const PumpContext = createContext<PumpContextValue | null>(null);

export function PumpProvider({ children }: { children: React.ReactNode }) {
  const pump = usePump();
  return <PumpContext.Provider value={pump}>{children}</PumpContext.Provider>;
}

export function usePumpContext(): PumpContextValue {
  const ctx = useContext(PumpContext);
  if (!ctx) throw new Error('usePumpContext must be used within PumpProvider');
  return ctx;
}
