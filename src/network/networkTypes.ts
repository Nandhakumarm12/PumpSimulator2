/**
 * Network types for the Alaris GP network simulator.
 * Simulates BD Alaris pump ↔ Gateway ↔ Drug Library Server communication.
 * NO React imports allowed in this file.
 */

export type NetworkState =
  | 'OFFLINE'
  | 'SCANNING'
  | 'ASSOCIATING'
  | 'DHCP'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'SYNCING_LIBRARY'
  | 'LIBRARY_CURRENT';

export type PacketType =
  | 'HEARTBEAT'
  | 'ALARM_EVENT'
  | 'INFUSION_DATA'
  | 'LIBRARY_REQUEST'
  | 'LIBRARY_RESPONSE'
  | 'FIRMWARE_CHECK'
  | 'FIRMWARE_RESPONSE'
  | 'ACK'
  | 'NACK'
  | 'MITM_INJECT'
  | 'REPLAY_ATTACK'
  | 'SPOOFED_ACK'
  | 'FIRMWARE_INJECT';

export type PacketDirection =
  | 'PUMP→GW'
  | 'GW→PUMP'
  | 'GW→SERVER'
  | 'SERVER→GW'
  | 'ATTACKER→GW'
  | 'ATTACKER→PUMP';

export type PacketStatus = 'sent' | 'received' | 'dropped' | 'intercepted' | 'injected';

export interface NetworkPacket {
  readonly id: string;
  readonly timestamp: number;        // ms since network session start
  readonly direction: PacketDirection;
  readonly type: PacketType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: PacketStatus;
  readonly isAttack: boolean;
  readonly size: number;             // synthetic byte size
}

export interface AttackScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cveRef?: string;
  readonly severity: 'critical' | 'high' | 'medium';
  readonly effect: string;           // what it does to pump state
}

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly type: 'pump' | 'ap' | 'gateway' | 'server';
  connected: boolean;
  ipAddress: string;
}

export const ATTACK_SCENARIOS: AttackScenario[] = [
  {
    id: 'mitm_library',
    name: 'MITM Drug Library',
    description: 'Intercept drug library update and modify guardrail limits in transit',
    cveRef: 'CVE-2020-25165',
    severity: 'critical',
    effect: 'Guardrail limits silently changed — pump accepts dangerous rates',
  },
  {
    id: 'replay_library',
    name: 'Replay Old Library',
    description: 'Re-transmit a captured outdated library version to downgrade guardrails',
    severity: 'high',
    effect: 'Drug library reverted to older version with wider limits',
  },
  {
    id: 'spoofed_ack',
    name: 'Spoofed ACK',
    description: 'Forge acknowledgement so pump believes alarm was received by gateway',
    cveRef: 'CVE-2020-25163',
    severity: 'high',
    effect: 'Alarm silently lost — clinical staff not notified',
  },
  {
    id: 'firmware_inject',
    name: 'Firmware Injection',
    description: 'Push a vulnerable firmware version over the network connection',
    severity: 'critical',
    effect: 'Pump firmware replaced with CVE-affected version 8.05',
  },
];

/** Severity levels for IDS alerts — maps to clinical/cyber risk hierarchy. */
export type IDSSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** A single IDS detection event. */
export interface IDSAlert {
  id:          string;
  timestamp:   number;       // ms since session start
  severity:    IDSSeverity;
  ruleId:      string;       // e.g. "IDS-R01"
  ruleName:    string;       // human-readable rule name
  description: string;       // what was detected
  packetType?: PacketType;   // the packet type that triggered this
  mitigated:   boolean;      // has the operator acknowledged/mitigated this?
}

/** IDS detection rules — maps to known Alaris CVE attack patterns and anomaly types. */
export const IDS_RULES: Array<{
  id: string;
  name: string;
  severity: IDSSeverity;
  description: string;
  /** Detect function: returns true if this packet triggers the rule. */
  detect: (pkt: NetworkPacket, allPackets: NetworkPacket[]) => boolean;
}> = [
  {
    id: "IDS-R01",
    name: "MITM Drug Library Substitution",
    severity: "CRITICAL",
    description: "Drug library response modified in transit — CVE-2020-25165",
    detect: (pkt) => pkt.type === "MITM_INJECT",
  },
  {
    id: "IDS-R02",
    name: "Replay Attack — Old Library Version",
    severity: "HIGH",
    description: "Outdated library payload replayed to pump",
    detect: (pkt) => pkt.type === "REPLAY_ATTACK",
  },
  {
    id: "IDS-R03",
    name: "Spoofed ACK — Authentication Bypass",
    severity: "CRITICAL",
    description: "Forged authentication ACK — CVE-2020-25163",
    detect: (pkt) => pkt.type === "SPOOFED_ACK",
  },
  {
    id: "IDS-R04",
    name: "Firmware Injection Attempt",
    severity: "CRITICAL",
    description: "Unsigned firmware update payload detected",
    detect: (pkt) => pkt.type === "FIRMWARE_INJECT",
  },
  {
    id: "IDS-R05",
    name: "Malicious Packet Source",
    severity: "HIGH",
    description: "Packet originated from unrecognised node (not pump, AP, gateway, or drug server)",
    detect: (pkt) =>
      pkt.direction === "ATTACKER→GW" || pkt.direction === "ATTACKER→PUMP",
  },
  {
    id: "IDS-R06",
    name: "Heartbeat Flood / DoS Pattern",
    severity: "MEDIUM",
    description: "Abnormally high heartbeat frequency detected",
    detect: (pkt, all) => {
      if (pkt.type !== "HEARTBEAT") return false;
      const recent = all.filter(
        (p) => p.type === "HEARTBEAT" && p.timestamp > pkt.timestamp - 3000,
      );
      return recent.length > 5;
    },
  },
  {
    id: "IDS-R07",
    name: "Unexpected Library Change During Infusion",
    severity: "HIGH",
    description: "Drug library updated while active infusion in progress",
    detect: (pkt, all) => {
      if (pkt.type !== "LIBRARY_RESPONSE") return false;
      return all.some(
        (p) =>
          p.type === "INFUSION_DATA" &&
          Math.abs(p.timestamp - pkt.timestamp) < 5000,
      );
    },
  },
];
