/**
 * NetworkContext — exposes the Alaris GP network connection state (from
 * NetworkSimulator) to any component in the tree without prop-drilling.
 *
 * NetworkSimulator calls setIsConnected(conn.connected) via a useEffect.
 * TaskModeTab reads isConnected to auto-populate uiCtx.network_connected.
 */

import React, { createContext, useContext, useState } from 'react';

interface NetworkContextValue {
  isConnected: boolean;
  setIsConnected: (v: boolean) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  return (
    <NetworkContext.Provider value={{ isConnected, setIsConnected }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetworkContext(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetworkContext must be used within NetworkProvider');
  return ctx;
}
