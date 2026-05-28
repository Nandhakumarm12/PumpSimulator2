/**
 * Connection state machine for Alaris GP network simulator.
 * Models the pump's WiFi connection lifecycle.
 * NO React imports allowed in this file.
 */

import type { NetworkState } from './networkTypes';

export interface ConnectionState {
  networkState: NetworkState;
  ssid: string;
  signalStrength: number;    // 0–100
  ipAddress: string;
  gatewayIp: string;
  serverUrl: string;
  libraryVersion: string;
  firmwareVersion: string;
  lastHeartbeatMs: number;
  lastLibrarySyncMs: number;
  connected: boolean;
}

export function getInitialConnectionState(): ConnectionState {
  return {
    networkState: 'OFFLINE',
    ssid: 'HOSPITAL_WARD4B',
    signalStrength: 0,
    ipAddress: '',
    gatewayIp: '192.168.4.1',
    serverUrl: 'https://alaris-server.internal',
    libraryVersion: 'none',
    firmwareVersion: '9.12',
    lastHeartbeatMs: 0,
    lastLibrarySyncMs: 0,
    connected: false,
  };
}

/** State transition durations in ms (simulated) */
export const TRANSITION_DELAYS: Record<NetworkState, number> = {
  OFFLINE:          0,
  SCANNING:         1200,
  ASSOCIATING:      800,
  DHCP:             600,
  AUTHENTICATING:   1000,
  CONNECTED:        0,
  SYNCING_LIBRARY:  1500,
  LIBRARY_CURRENT:  0,
};

/** Human-readable descriptions for each state */
export const STATE_DESCRIPTIONS: Record<NetworkState, string> = {
  OFFLINE:          'Radio disabled — no network connection',
  SCANNING:         'Scanning for 802.11 access points…',
  ASSOCIATING:      'Associating with HOSPITAL_WARD4B…',
  DHCP:             'Requesting IP address via DHCP…',
  AUTHENTICATING:   'Authenticating with Alaris Gateway…',
  CONNECTED:        'Connected to Gateway — transmitting',
  SYNCING_LIBRARY:  'Downloading drug library update…',
  LIBRARY_CURRENT:  'Drug library current — monitoring active',
};

/** Next state in the normal (non-failure) connection sequence */
export const NEXT_STATE: Partial<Record<NetworkState, NetworkState>> = {
  SCANNING:         'ASSOCIATING',
  ASSOCIATING:      'DHCP',
  DHCP:             'AUTHENTICATING',
  AUTHENTICATING:   'CONNECTED',
  CONNECTED:        'SYNCING_LIBRARY',
  SYNCING_LIBRARY:  'LIBRARY_CURRENT',
};
