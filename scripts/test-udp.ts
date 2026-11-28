/**
 * @file scripts/test-udp.ts
 * @description UDP MAVLink connectivity test utility.
 *
 * Binds to UDP port 14550, sends periodic MAVLink v2 heartbeats to announce
 * the GCS presence, and prints every incoming MAVLink packet with its
 * message type decoded from the standard message ID list.
 *
 * Usage:
 *   npm run test-udp
 *   npm run test-udp -- --port 14550 --fc-ip 192.168.0.7 --fc-port 14550
 *
 * Press Ctrl+C to stop and print a summary.
 */

import { createSocket, type Socket } from 'dgram';
import { config } from 'dotenv';

config();

// ── CLI args (simple flag parser) ─────────────────────────────────────────────
function getArg(flag: string, fallback: string): string {
    const idx = process.argv.indexOf(flag);
    return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const LOCAL_PORT = parseInt(getArg('--port',    '14550'));
const FC_IP      =           getArg('--fc-ip',   '192.168.0.7');
const FC_PORT    = parseInt(getArg('--fc-port', '14550'));

// ── MAVLink message ID → name map ─────────────────────────────────────────────
const MSG_NAMES: Record<number, string> = {
    0:   'HEARTBEAT',
    1:   'SYS_STATUS',
    24:  'GPS_RAW_INT',
    30:  'ATTITUDE',
    32:  'LOCAL_POSITION_NED',
    33:  'GLOBAL_POSITION_INT',
    42:  'MISSION_CURRENT',
    65:  'RC_CHANNELS',
    74:  'VFR_HUD',
    77:  'COMMAND_ACK',
    147: 'BATTERY_STATUS',
    253: 'STATUSTEXT',
};

// ── Build a minimal MAVLink v2 heartbeat (no CRC — FC will ignore bad CRC) ───
function buildHeartbeat(): Buffer {
    return Buffer.from([
        0xFD,              // STX — MAVLink v2
        0x09,              // Payload length (9 bytes)
        0x00,              // Incompat flags
        0x00,              // Compat flags
        0x00,              // Sequence (rolling, but 0 is fine for a test)
        0xFF,              // System ID  — 255 = GCS
        0xBE,              // Component ID — 190 = Ground Control
        0x00, 0x00, 0x00,  // Message ID (little-endian) — 0 = HEARTBEAT
        // Payload (9 bytes):
        0x00, 0x00, 0x00, 0x00, // custom_mode   = 0
        0x06,                   // type          = MAV_TYPE_GCS (6)
        0x08,                   // autopilot     = MAV_AUTOPILOT_INVALID (8)
        0x00,                   // base_mode     = 0
        0x04,                   // system_status = MAV_STATE_ACTIVE (4)
        0x03,                   // mavlink_version = 3
        // CRC (2 bytes — placeholder; FC discards packets with bad CRC but
        //   the heartbeat is enough to open the FC's output stream)
        0x00, 0x00,
    ]);
}

// ── State ───────────────────────────────────────────────────────────────��─────
let packetCount  = 0;
let lastPacketAt = 0;
const startAt    = Date.now();

// ── Socket setup ──────────────────────────────────────────────────────────────
console.log('🧪 Sidak GCS — MAVLink UDP Test\n');
console.log(`   Listening on : 0.0.0.0:${LOCAL_PORT}`);
console.log(`   FC address   : ${FC_IP}:${FC_PORT}\n`);

const sock: Socket = createSocket('udp4');

sock.on('error', (err) => {
    console.error(`\n❌ Socket error: ${err.message}`);
    process.exit(1);
});

sock.bind(LOCAL_PORT, '0.0.0.0', () => {
    sock.setBroadcast(true);
    console.log(`✅ Socket bound to port ${LOCAL_PORT}`);
    console.log('💓 Sending heartbeats every 1 s to announce GCS presence...');
    console.log('👂 Listening for MAVLink packets (Ctrl+C to stop)\n');
    sendHeartbeat();
});

// ── Packet handler ────────────────────────────────────────────────────────────
sock.on('message', (data: Buffer, rinfo) => {
    packetCount++;
    lastPacketAt = Date.now();

    console.log(`\n📦 Packet #${packetCount}`);
    console.log(`   From : ${rinfo.address}:${rinfo.port}`);
    console.log(`   Size : ${data.length} bytes`);

    if (data.length === 0) return;

    const stx = data[0];

    if (stx === 0xFD && data.length >= 10) {
        // MAVLink v2
        const msgId = data[7] | (data[8] << 8) | (data[9] << 16);
        const name  = MSG_NAMES[msgId] ?? `UNKNOWN_MSG_${msgId}`;
        console.log(`   ✅ MAVLink v2 — ${name} (id=${msgId})`);

    } else if (stx === 0xFE && data.length >= 6) {
        // MAVLink v1
        const msgId = data[5];
        const name  = MSG_NAMES[msgId] ?? `UNKNOWN_MSG_${msgId}`;
        console.log(`   ✅ MAVLink v1 — ${name} (id=${msgId})`);

    } else {
        console.log(`   ⚠️  Not a MAVLink packet (first byte: 0x${stx.toString(16).padStart(2, '0')})`);
    }

    const hex = Array.from(data.subarray(0, 20))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ') + (data.length > 20 ? ' ...' : '');
    console.log(`   Hex  : ${hex}`);
});

// ── Heartbeat sender ──────────────────────────────────────────────────────────
function sendHeartbeat(): void {
    const hb = buildHeartbeat();
    sock.send(hb, FC_PORT, FC_IP, (err) => {
        if (err) console.warn(`⚠️  Heartbeat send failed: ${err.message}`);
    });
}

const heartbeatInterval = setInterval(sendHeartbeat, 1000);

// ── Status ticker every 5 s ───────────────────────────────────────────────────
const statusInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startAt) / 1000);
    if (packetCount === 0) {
        console.log(`⏳ No packets yet... (${elapsed}s elapsed)`);
    } else {
        const ago = Math.round((Date.now() - lastPacketAt) / 1000);
        console.log(`📊 ${packetCount} packets received — last ${ago}s ago (${elapsed}s total)`);
    }
}, 5000);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT', () => {
    clearInterval(heartbeatInterval);
    clearInterval(statusInterval);
    sock.close();

    const elapsed = Math.round((Date.now() - startAt) / 1000);
    console.log('\n\n📊 Test Summary');
    console.log(`   Packets received : ${packetCount}`);
    console.log(`   Duration         : ${elapsed}s`);

    if (packetCount === 0) {
        console.log('\n❌ No packets received. Possible causes:');
        console.log('   1. Flight controller not powered on');
        console.log('   2. FC not configured to send MAVLink over UDP');
        console.log('   3. FC sending to wrong IP — run `ipconfig` and check your LAN IP');
        console.log('   4. FC using a different port (default: 14550)');
        console.log('   5. Firewall blocking UDP 14550 — run allow-udp-14550.ps1 as Admin');
        console.log('\n💡 Rerun with custom IP/port:');
        console.log(`   npm run test-udp -- --fc-ip <FC_IP> --port 14550`);
    } else {
        console.log('\n✅ MAVLink telemetry is flowing correctly.');
        console.log('   If the GCS still shows no data, check the browser console for errors.');
    }

    process.exit(0);
});
