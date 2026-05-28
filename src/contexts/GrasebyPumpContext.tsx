/**
 * GrasebyPumpContext — React context wrapping useGrasebyPump.
 * Mirrors src/contexts/BraunPumpContext.tsx for the Graseby 3100.
 */

import React, { createContext, useContext } from 'react';
import { useGrasebyPump } from '../hooks/useGrasebyPump';

type GrasebyPumpContextValue = ReturnType<typeof useGrasebyPump>;

const GrasebyPumpContext = createContext<GrasebyPumpContextValue | null>(null);

export function GrasebyPumpProvider({ children }: { children: React.ReactNode }) {
  const pump = useGrasebyPump();
  return <GrasebyPumpContext.Provider value={pump}>{children}</GrasebyPumpContext.Provider>;
}

export function useGrasebyPumpContext(): GrasebyPumpContextValue {
  const ctx = useContext(GrasebyPumpContext);
  if (!ctx) throw new Error('useGrasebyPumpContext must be used within GrasebyPumpProvider');
  return ctx;
}
