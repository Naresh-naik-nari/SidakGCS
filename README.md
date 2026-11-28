# Sidak Ground Control Station (GCS)

A modern Ground Control Station built with SvelteKit for MAVLink-based drones and UAVs.
Connects to ArduPilot/PX4 flight controllers over USB serial, TCP, or UDP.

---

## Features

| Feature | Details |
|---|---|
| 🎮 Real-time control | MAVLink over serial, TCP, or UDP |
| 🗺️ Maps | OpenStreetMap, Google Satellite, Defense Series Maps |
|  Offline maps | Pre-download tiles for internet-free operation |
| 🎯 Mission planner | Waypoint-based mission upload and monitoring |
| �️ Guided mode | D-Pad, altitude, yaw, speed, and "Fly to Here" |
| 📹 Live video | HLS/RTSP stream from drone camera |
| 📊 Telemetry | Attitude, GPS, battery, flight time, event log |
| 🔐 Auth | Lucia-based session authentication |
| 🌓 Themes | Dark / light mode |

---

## Requirements

- **Node.js 18 or higher** (tested on v24)
- **npm 9+**
- A MAVLink-capable flight controller (ArduPilot or PX4)
- USB/serial cable **or** a telemetry radio (SiK, RFD900, etc.)

> **This app cannot be deployed to Vercel, Netlify, or any serverless platform.**
> It requires a real Node.js process with access to serial ports, UDP sockets, and
> a persistent filesystem. Run it on the same machine (or LAN server) that connects
> to the drone.

---

## Project Structure

```
sidakGCS/
├── src/
│   ├── components/      Svelte UI components
│   ├── lib/
│   │   ├── api/         Client-side fetch wrappers
│   │   ├── mavlink/     Telemetry log parser
│   │   └── server/      Server-only: MAVLink singleton, DB, auth
│   ├── routes/          SvelteKit pages and API endpoints
│   └── stores/          Svelte reactive stores
├── scripts/
│   ├── setup-db.ts      One-time database initialisation
│   └── test-udp.ts      UDP MAVLink connectivity test utility
├── static/              Static assets, map icons, background images
├── tile-cache/          Offline map tile cache (auto-created)
├── build/               Production build output (git-ignored)
├── .env.example         Environment variable template
└── ecosystem.config.cjs PM2 process manager config
```

---

## Development Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd sidakGCS
npm install

# 2. Create environment file
cp .env.example .env      # Linux/Mac
copy .env.example .env    # Windows

# 3. Initialise the database (once)
npm run setup-db

# 4. Start dev server
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Production Deployment

### Step 1 — Configure environment

Edit `.env` with your actual values:

```env
# Port the server listens on
PORT=3000

# Full URL of this machine on your LAN — required for session cookies
ORIGIN=http://192.168.1.100:3000

# Database path (default is fine for local deployments)
DATABASE_URL=file:./src/data.db

# Serial port — leave blank for auto-detection
USB_SERIAL_PORT=
USB_BAUD_RATE=115200

# Video stream (optional)
VITE_VIDEO_PORT=8889
VITE_VIDEO_PATH=cam

# MapTiler API key for 3D map view (free tier at maptiler.com)
VITE_MAPTILER_KEY=
```

> **Finding your LAN IP:**
> Windows: `ipconfig` → look for IPv4 Address
> Linux/Mac: `ip addr` or `ifconfig`

### Step 2 — Build

```bash
npm run build
```

### Step 3 — Initialise the database

```bash
npm run setup-db
```

This creates `src/data.db` with the user, session, and mission tables.
Only needed once — re-running it is safe (uses `CREATE TABLE IF NOT EXISTS`).

### Step 4 — Create the tile cache directory

```bash
mkdir tile-cache
```

The app creates it automatically on first use, but creating it upfront avoids any startup race.

### Step 5 — Start the server

**Direct start (simple):**
```bash
node build/index.js
```

**With PM2 (recommended — survives crashes and reboots):**
```bash
# Install PM2 globally once
npm install -g pm2

# Edit ecosystem.config.cjs and set ORIGIN to your LAN IP, then:
pm2 start ecosystem.config.cjs

# Persist across reboots
pm2 save
pm2 startup    # follow the printed instruction
```

Open `http://<your-machine-ip>:3000` from any browser on the same network.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP server port |
| `ORIGIN` | **Yes (production)** | — | Full server URL e.g. `http://192.168.1.100:3000` |
| `DATABASE_URL` | No | `file:./src/data.db` | LibSQL database path |
| `USB_SERIAL_PORT` | No | auto-detect | Serial port e.g. `COM3` or `/dev/ttyACM0` |
| `USB_BAUD_RATE` | No | `115200` | Serial baud rate |
| `VITE_VIDEO_PORT` | No | `8889` | Video stream server port |
| `VITE_VIDEO_PATH` | No | `cam` | Video stream URL path |
| `VITE_MAPTILER_KEY` | No | — | MapTiler API key for 3D map |
| `VITE_ALTITUDE_ANGEL_API_KEY` | No | — | Altitude Angel airspace overlay key |

> `VITE_*` variables are baked into the browser bundle at build time.
> If you change them after building, you must rebuild.

---

## Connecting to the Flight Controller

Three connection modes are supported. Use the plug icon in the sidebar.

### USB / Serial
- Plug in your flight controller or telemetry radio via USB
- Click the plug icon → the app auto-detects the port
- Or set `USB_SERIAL_PORT=COM3` (Windows) / `USB_SERIAL_PORT=/dev/ttyACM0` (Linux) in `.env`

### UDP (most common for telemetry radios)
- Configure your telemetry radio or Mission Planner to forward MAVLink to UDP
- In the connection modal: select UDP, enter the GCS machine IP and port 14550

### TCP
- Use if your companion computer or simulator streams MAVLink over TCP
- In the connection modal: select TCP, enter host and port

**ArduPilot users:** the FC will not stream telemetry until the GCS sends a
`REQUEST_DATA_STREAM` message. The app sends this automatically on first MAVLink
packet received.

---

## Offline Maps

Pre-download tiles for operation without internet access.

1. Click the **download icon** (📥) on the map
2. Set radius (1–50 km) and zoom levels (10–18 recommended)
3. Click **Download** — tiles are cached in `tile-cache/`
4. When offline, the app serves cached tiles transparently

Cached tiles persist across restarts. Use the cache info panel to see storage used.

---

## PM2 Quick Reference

```bash
pm2 list                    # show running processes
pm2 logs sidak-gcs          # tail logs
pm2 restart sidak-gcs       # restart after config change
pm2 stop sidak-gcs          # stop
pm2 delete sidak-gcs        # remove from PM2
pm2 monit                   # live dashboard
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Login fails / cookies not set | Set `ORIGIN` to the exact URL you use in the browser |
| Serial port not found | Check Device Manager (Windows) or `ls /dev/tty*` (Linux); set `USB_SERIAL_PORT` manually |
| No telemetry after connecting | Ensure the FC is streaming MAVLink; check baud rate matches FC config |
| Map tiles not loading offline | Verify `tile-cache/` exists and tiles were downloaded before going offline |
| Port 3000 already in use | Set `PORT=3001` in `.env` and update `ORIGIN` |
| `ARMING_CHECK` errors | Pre-arm checks are auto-disabled during arm sequence and re-enabled after |
| `node build/index.js` exits immediately | Run `npm run build` first; check for missing `.env` file |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 + adapter-node |
| Styling | Tailwind CSS 3 |
| Maps | Leaflet, MapLibre GL |
| MAVLink | node-mavlink |
| Serial | serialport |
| Auth | Lucia v3 |
| Database | LibSQL (SQLite via @libsql/client) |
| Process manager | PM2 |

---

## Documentation

| Document | Description |
|---|---|
| [docs/SRS_ISO12207_Sidak_GCS.md](./docs/SRS_ISO12207_Sidak_GCS.md) | Software Requirements Specification |
| [docs/ADD_ISO12207_Sidak_GCS.md](./docs/ADD_ISO12207_Sidak_GCS.md) | Architectural Design Document |
| [docs/SVVP_IEEE1012_Sidak_GCS.md](./docs/SVVP_IEEE1012_Sidak_GCS.md) | Verification & Validation Plan |
| [docs/DSM_CONFIG.md](./docs/DSM_CONFIG.md) | Defense Series Maps setup |
| [docs/OFFLINE_MAPS_GUIDE.md](./docs/OFFLINE_MAPS_GUIDE.md) | Offline maps detailed guide |
| [docs/UDP_ETHERNET_CONNECTION_GUIDE.md](./docs/UDP_ETHERNET_CONNECTION_GUIDE.md) | UDP/Ethernet connection setup |
