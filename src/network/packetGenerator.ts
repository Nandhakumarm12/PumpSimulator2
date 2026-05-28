/**
 * Synthetic packet generator for the Alaris GP network simulator.
 * Constructs realistic-looking packets based on pump state events.
 * NO React imports allowed in this file.
 */

import type { NetworkPacket, PacketType, PacketDirection, PacketStatus } from './networkTypes';
import type { PumpState } from '../pump/types';

let packetSeq = 1000;

function makeId(): string {
  return `PKT-${(packetSeq++).toString().padStart(4, '0')}`;
}

function makePacket(
  timestamp: number,
  direction: PacketDirection,
  type: PacketType,
  payload: Record<string, unknown>,
  status: PacketStatus = 'sent',
  isAttack = false,
): NetworkPacket {
  return Object.freeze({
    id: makeId(),
    timestamp,
    direction,
    type,
    payload: Object.freeze(payload),
    status,
    isAttack,
    size: 64 + Math.floor(Math.random() * 128),
  });
}

/** Generate heartbeat packet from current pump state */
export function makeHeartbeat(timestamp: number, pump: PumpState): NetworkPacket {
  return makePacket(timestamp, 'PUMP→GW', 'HEARTBEAT', {
    seq: packetSeq,
    status: pump.screen,
    rate_ml_h: pump.rate,
    drug: pump.selectedDrug.name,
    vol_infused_ml: pump.volumeInfused,
    battery_pct: 87,
    pressure_level: pump.pressureLevel,
    kvo_active: pump.kvoActive,
  });
}

/** Generate alarm event packet */
export function makeAlarmPacket(timestamp: number, pump: PumpState): NetworkPacket {
  return makePacket(timestamp, 'PUMP→GW', 'ALARM_EVENT', {
    alarm_type: pump.alarmType,
    message: pump.alarmMessage,
    drug: pump.selectedDrug.name,
    rate_ml_h: pump.rate,
    vol_infused_ml: pump.volumeInfused,
    requires_ack: true,
  });
}

/** Generate infusion data packet */
export function makeInfusionData(timestamp: number, pump: PumpState): NetworkPacket {
  return makePacket(timestamp, 'PUMP→GW', 'INFUSION_DATA', {
    drug: pump.selectedDrug.name,
    rate_ml_h: pump.rate,
    vol_infused_ml: pump.volumeInfused,
    vtbi_ml: pump.vtbi,
    weight_kg: pump.patientWeight,
    guardrail_override: pump.guardrailOverride,
  });
}

/** Generate library request packet */
export function makeLibraryRequest(timestamp: number, currentVersion: string): NetworkPacket {
  return makePacket(timestamp, 'PUMP→GW', 'LIBRARY_REQUEST', {
    current_version: currentVersion,
    pump_model: 'ALARIS_GP',
    firmware: '9.12',
  });
}

/** Generate library response packet (server → gateway) */
export function makeLibraryResponse(timestamp: number): NetworkPacket {
  return makePacket(timestamp, 'SERVER→GW', 'LIBRARY_RESPONSE', {
    version: '4.2.1',
    drug_count: 10,
    checksum: 'a3f9c2e1',
    valid_until: '2026-12-31',
  });
}

/** Generate firmware check packet */
export function makeFirmwareCheck(timestamp: number): NetworkPacket {
  return makePacket(timestamp, 'PUMP→GW', 'FIRMWARE_CHECK', {
    current_version: '9.12',
    model: 'ALARIS_GP',
  });
}

/** Generate ACK packet */
export function makeAck(timestamp: number, refId: string): NetworkPacket {
  return makePacket(timestamp, 'GW→PUMP', 'ACK', { ref_id: refId });
}

/** Generate MITM attack packet */
export function makeMitmPacket(timestamp: number): NetworkPacket {
  return makePacket(timestamp, 'ATTACKER→GW', 'MITM_INJECT', {
    intercepted_type: 'LIBRARY_RESPONSE',
    modified_field: 'morphine.hardMax',
    original_value: 20,
    injected_value: 200,
    note: 'Guardrail limit silently modified',
  }, 'injected', true);
}

/** Generate replay attack packet */
export function makeReplayPacket(timestamp: number): NetworkPacket {
  return makePacket(timestamp, 'ATTACKER→GW', 'REPLAY_ATTACK', {
    replayed_packet_type: 'LIBRARY_RESPONSE',
    replayed_version: '3.1.0',
    original_timestamp: timestamp - 86_400_000,
    note: 'Library downgraded — wider guardrail limits',
  }, 'injected', true);
}

/** Generate spoofed ACK packet */
export function makeSpoofedAck(timestamp: number): NetworkPacket {
  return makePacket(timestamp, 'ATTACKER→PUMP', 'SPOOFED_ACK', {
    forged_alarm_ref: 'ALARM_EVENT',
    note: 'Pump believes alarm was delivered — clinical staff not notified',
  }, 'injected', true);
}

/** Generate firmware injection packet */
export function makeFirmwareInjectPacket(timestamp: number): NetworkPacket {
  return makePacket(timestamp, 'ATTACKER→PUMP', 'FIRMWARE_INJECT', {
    injected_version: '8.05',
    cve: 'CVE-2020-25165',
    payload_size_kb: 2048,
    note: 'Vulnerable firmware pushed over network',
  }, 'injected', true);
}
