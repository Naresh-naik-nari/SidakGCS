# Sidak GCS — Project Documentation

> **Version:** 0.0.1  
> **Stack:** SvelteKit · Node.js · MAVLink · Leaflet · MapLibre GL · SQLite

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
   - 4.1 [Frontend](#41-frontend)
   - 4.2 [Backend](#42-backend)
   - 4.3 [Database](#43-database)
5. [Data Flow — Telemetry Pipeline](#5-data-flow--telemetry-pipeline)
6. [Features](#6-features)
   - 6.1 [MAVLink Communication](#61-mavlink-communication)
   - 6.2 [Dashboard / Cockpit](#62-dashboard--cockpit)
   - 6.3 [Mission Planning](#63-mission-planning)
   - 6.4 [Gimbal & Live Video](#64-gimbal--live-video)
   - 6.5 [Offline Maps](#65-offline-maps)
   - 6.6 [3D Map View](#66-3d-map-view)
   - 6.7 [Pre-Flight Check](#67-pre-flight-check)
   - 6.8 [Parameters Editor](#68-parameters-editor)
   - 6.9 [Event Log](#69-event-log)
   - 6.10 [Weather Widget](#610-weather-widget)
   - 6.11 [Indian Grid Reference System (IGRS)](#611-indian-grid-reference-system-igrs)
   - 6.12 [Camera Swath Footprint](#612-camera-swath-footprint)
   - 6.13 [Defense Series Maps (DSM)](#613-defense-series-maps-dsm)
   - 6.14 [Automatic Return-to-Launch (RTLL)](#614-automatic-return-to-launch-rtll)
   - 6.15 [Authentication & Sessions](#615-authentication--sessions)
7. [API Reference](#7-api-reference)
   - 7.1 [MAVLink API](#71-mavlink-api)
   - 7.2 [Mission API](#72-mission-api)
   - 7.3 [Tiles API](#73-tiles-api)
   - 7.4 [Maps API](#74-maps-api)
   - 7.5 [Auth API](#75-auth-api)
8. [Svelte Stores](#8-svelte-stores)
9. [Components Reference](#9-components-reference)
10. [Configuration & Environment Variables](#10-configuration--environment-variables)
11. [Build & Deployment](#11-build--deployment)
12. [Design Decisions & Known Limitations](#12-design-decisions--known-limitations)
13. [Existing Documentation Index](#13-existing-documentation-index)

---

## 1. Project Overview

**Sidak GCS** (Ground Control Station) is a full-stack web application for operating MAVLink-based unmanned aerial vehicles (UAVs). It runs entirely in the browser and communicates with a flight controller (FC) over USB serial, TCP, or UDP/Ethernet.

The application provides:

- Real-time telemetry visualization (attitude, GPS, speed, battery, flight mode)
- Waypoint mission planning, upload to FC, and live mission tracking
- Manual directional control in GUIDED/LOITER modes
- Camera/gimbal pan, tilt, and zoom with HLS live video overlay
- Offline map tile caching for no-internet field operations
- Indian Grid Reference System (IGRS) coordinate display
- Defense Series Maps (DSM) layer support (operator-configured)
- Pre-flight checklist driven by live telemetry
- Secure multi-user authentication with session management

The design targets ArduPilot firmware running on Pixhawk/CubePilot hardware, though the protocol layer supports any MAVLink 2 compatible autopilot.

---

## 2. Tech Stack

| Category | Library / Tool | Version |
|---|---|---|
| **Framework** | SvelteKit | 2.x |
| **UI** | Svelte | 4.x |
| **Styling** | Tailwind CSS | 3.x |
| **Icons** | Font Awesome | 6.x |
| **2D Maps** | Leaflet | 1.9.4 |
| **3D Maps** | MapLibre GL | 5.x |
| **MAVLink** | node-mavlink | 2.0.7 |
| **Serial Port** | serialport | 12.x |
| **Video** | HLS.js | 1.5.x |
| **Auth** | Lucia | 3.x |
| **Password Hashing** | @node-rs/argon2 | 2.x |
| **Database Client** | @libsql/client | 0.3.x |
| **Database** | SQLite (via libsql) | — |
| **Build Tool** | Vite | 5.x |
| **Deployment** | @sveltejs/adapter-node | 5.x |
| **TypeScript** | TypeScript | 5.x |

---

## 3. Project Structure

```
sidakGCS/
├── src/
│   ├── app.html                    # Root HTML template
│   ├── app.css                     # Global styles (Tailwind base + CSS variables)
│   ├── app.d.ts                    # Ambient TypeScript declarations
│   ├── hooks.server.ts             # SvelteKit server hooks (session validation, root redirect)
│   ├── data.db                     # SQLite database (auto-created by db.ts)
│   │
│   ├── components/                 # Reusable Svelte UI components
│   │   ├── 3DMap.svelte            # MapLibre GL 3D map view
│   │   ├── ArtificialHorizon.svelte # SVG attitude indicator
│   │   ├── Compass.svelte          # SVG compass rose
│   │   ├── ConnectionModal.svelte  # Serial/TCP/UDP connection dialog
│   │   ├── ConnectionStatus.svelte # Top status strip
│   │   ├── Controls.svelte         # Keyboard control bindings
│   │   ├── DPad.svelte             # Directional-pad for position nudges
│   │   ├── GimbalControl.svelte    # Gimbal pan/tilt/zoom + recording
│   │   ├── LiveFeed.svelte         # HLS video player + telemetry overlay
│   │   ├── ManageMissionPlans.svelte # Saved missions browser
│   │   ├── Map.svelte              # Leaflet 2D map (main map component)
│   │   ├── MapLayerUploader.svelte # Upload custom raster/vector layers
│   │   ├── MissionPlan.svelte      # Waypoint table editor
│   │   ├── MissionPlanSettings.svelte # Mission save/load/upload to FC
│   │   ├── Modal.svelte            # Generic modal / confirm dialog
│   │   ├── Notification.svelte     # Toast notification
│   │   ├── Offline.svelte          # Offline mode indicator
│   │   ├── OfflineMapDownloader.svelte # Offline tile pre-download tool
│   │   ├── PreFlightCheck.svelte   # 15-item pre-flight checklist
│   │   ├── Stats.svelte            # Flight stats, arm/disarm, flight controls
│   │   ├── SwathDisplay.svelte     # Camera ground footprint polygon
│   │   └── Weather.svelte          # Weather data widget
│   │
│   ├── routes/                     # SvelteKit file-based routing
│   │   ├── +layout.server.ts       # Root auth guard (all routes)
│   │   ├── +layout.svelte          # App shell: nav rail, status bar, heartbeat loop
│   │   ├── login/                  # Login page
│   │   ├── register/               # Registration page
│   │   ├── dashboard/              # Main cockpit (map + HUD + flight controls)
│   │   ├── mission-planner/        # Waypoint mission editor
│   │   ├── gimbal/                 # Video feed + gimbal controls
│   │   ├── event-log/              # MAVLink packet log viewer
│   │   ├── parameters/             # FC parameter editor
│   │   ├── notifications/          # Notification settings (placeholder)
│   │   ├── connection-test/        # Connection diagnostics
│   │   └── api/
│   │       ├── mavlink/[type]/     # MAVLink API gateway (all drone ops)
│   │       ├── mission/[type]/     # Mission CRUD (SQLite)
│   │       ├── tiles/[z]/[x]/[y]/ # OSM tile proxy + disk cache
│   │       ├── tiles/google/       # Google satellite tile proxy
│   │       ├── tiles/cache-info/   # Tile cache statistics
│   │       ├── maps/upload/        # Custom map layer upload
│   │       ├── maps/list/          # List uploaded map layers
│   │       └── auth/               # Auth endpoints (login, register, checkAdmin)
│   │
│   ├── lib/
│   │   ├── config.ts               # Centralised env var access (VITE_*)
│   │   ├── index.ts                # $lib barrel export
│   │   ├── igrs.ts                 # Indian Grid Reference System converter
│   │   ├── swath.ts                # Camera footprint / swath calculator
│   │   ├── weathercodes.json       # WMO weather code → description map
│   │   ├── mavlink/
│   │   │   └── parser.ts           # Client-side log-line parser → Svelte stores
│   │   ├── api/
│   │   │   ├── mavlink.ts          # Client fetch wrappers for /api/mavlink/*
│   │   │   └── mission.ts          # Client fetch wrappers for /api/mission/*
│   │   ├── server/
│   │   │   ├── mavlink.ts          # MAVLink singleton (serial/TCP/UDP transports)
│   │   │   ├── mavlink-registry.ts # node-mavlink packet registry
│   │   │   ├── auth.ts             # Lucia auth configuration
│   │   │   ├── db.ts               # LibSQL client + schema init
│   │   │   └── errors.ts           # Typed GCS error classes
│   │   └── utils/
│   │       ├── geo.ts              # Haversine distance, bearing, velocity
│   │       ├── format.ts           # Number/string formatters
│   │       ├── notifications.ts    # showNotification() factory + TTS
│   │       └── parameters.ts       # MAVLink param type encoding/decoding
│   │
│   └── stores/                     # Svelte writable stores
│       ├── mavlinkStore.ts         # All live telemetry state
│       ├── missionPlanStore.ts     # Mission plan and progress
│       ├── mapStore.ts             # Map instances, markers, state
│       ├── authStore.ts            # Client-side login state
│       ├── customizationStore.ts   # Dark mode, theme colors, audio
│       ├── uiStore.ts              # Flight logbook panel visibility
│       └── notificationCountStore.ts # Unread notification badge
│
├── docs/                           # Documentation files
├── static/                         # Static assets (icons, backgrounds)
├── tile-cache/                     # Offline tile cache (auto-created)
├── build/                          # Production build output
├── .svelte-kit/                    # SvelteKit generated files
├── svelte.config.js                # SvelteKit adapter config
├── vite.config.ts                  # Vite build config
├── tailwind.config.js              # Tailwind CSS config
├── tsconfig.json                   # TypeScript config
├── .env.example                    # Environment variable template
├── package.json                    # NPM project config
├── allow-udp-14550.ps1             # Windows firewall helper (UDP port 14550)
├── list-ports.js                   # List available serial ports
└── setup_db.py                     # Python DB initialization helper
```

---

## 4. Architecture

### 4.1 Frontend

The frontend is a SvelteKit single-page application rendered as an SSR shell with client-side hydration.

**App Shell (`src/routes/+layout.svelte`)**  
The root layout component is the application's orchestrator. Its key responsibilities:

1. **Heartbeat loop** — calls `POST /api/mavlink/heartbeat` every 1,100 ms to drain buffered MAVLink log strings from the server and feed them into `processLogLine()` (the client-side parser).
2. **Store synchronisation** — syncs `onlineStore` and `serialConnected` with the actual port state every 3 seconds.
3. **Parameter request** — once the drone comes online, sends a `PARAM_REQUEST_LIST` to populate the parameter editor.
4. **Mission restore** — on page load, checks the DB for a loaded mission and restores it to `missionPlanActionsStore` without uploading to the FC.
5. **Session timeout** — tracks activity via a `lastActivity` cookie; logs out and disconnects after 10 minutes of inactivity.
6. **UI chrome** — renders the navigation rail (links to Dashboard, Mission Planner, Gimbal, Event Log, Parameters), dark mode toggle, audio toggle, and logout button.
7. **Battery alerts** — shows progressive toast notifications at 50%, 20%, 15%, 10%, and 5% battery.

**Routing**

| Route | Component | Purpose |
|---|---|---|
| `/` | Redirect → `/login` | Root always redirects (via `hooks.server.ts`) |
| `/login` | `login/+page.svelte` | Authentication form |
| `/register` | `register/+page.svelte` | New user registration |
| `/dashboard` | `dashboard/+page.svelte` | Main cockpit |
| `/mission-planner` | `mission-planner/+page.svelte` | Waypoint mission editor |
| `/gimbal` | `gimbal/+page.svelte` | Video feed + gimbal control |
| `/event-log` | `event-log/+page.svelte` | MAVLink packet log viewer |
| `/parameters` | `parameters/+page.svelte` | FC parameter editor |

**State Management**  
All shared state lives in Svelte writable stores under `src/stores/`. Components subscribe with `$storeName` reactive syntax. The stores are never persisted to `localStorage` — they are populated fresh on each connection. See [Section 8](#8-svelte-stores) for the full store reference.

---

### 4.2 Backend

The backend is a Node.js SSR server produced by `@sveltejs/adapter-node`.

**Request Lifecycle**

1. Every HTTP request passes through `src/hooks.server.ts`, which:
   - Silences Chrome DevTools probe requests
   - Redirects `/` to `/login`
   - Validates the Lucia session cookie and sets `event.locals.user` / `event.locals.session`
   - Refreshes the session cookie if still fresh

2. The root load function (`src/routes/+layout.server.ts`) runs for every route and:
   - Allows `/login`, `/register`, and `/api/*` without a session
   - Redirects any other unauthenticated request to `/login`
   - Returns `{ user: { id, username } }` for the layout and all child pages

3. API routes under `src/routes/api/` handle all drone and data operations. All drone operations go through the single endpoint `POST /api/mavlink/[type]`.

**MAVLink Singleton (`src/lib/server/mavlink.ts`)**  
The most critical server-side module. It stores its state in `globalThis.__mav` so it survives Vite HMR hot reloads. The singleton tracks:

- `port` — the active transport socket (SerialPort | Socket | UDPSocket)
- `reader` — the `MavLinkPacketParser` instance
- `online` — whether MAVLink telemetry is flowing
- `connecting` — mutex flag to prevent concurrent connect attempts
- `logs` / `newLogs` — decoded packet log strings (newLogs is drained atomically on each heartbeat poll)
- `connectionType` — `'serial'` | `'tcp'` | `'udp'`
- `udpRemoteHost` / `udpRemotePort` — UDP back-channel target
- `udpSeq` — sequence counter for UDP packet serialization

Three transport implementations are supported:

| Transport | Implementation | Notes |
|---|---|---|
| **Serial (USB)** | `serialport` library | Auto-detects known FC vendor IDs; falls back to any USB-serial device. Default 115200 baud. |
| **TCP** | Node.js `net.connect()` | 10-second connection timeout. |
| **UDP** | Node.js `dgram.createSocket('udp4')` | Binds to local port (default 14550). Sends GCS heartbeats every 1 second to initiate and maintain data flow from FC. |

After any transport connects, data flows through:
```
raw bytes → MavLinkPacketSplitter → MavLinkPacketParser → REGISTRY[msgid] → JSON
  → "MSG_NAME(magic)::ISO::sysid=X,compid=Y::{JSON}" → S.newLogs[]
```

On first UDP packet, calls `_requestAllDataStreams()` which sends `SET_MESSAGE_INTERVAL` (MAVLink command 511) for key message types at defined rates, plus the legacy `REQUEST_DATA_STREAM` (MSG_ID 66) as fallback.

---

### 4.3 Database

**LibSQL (SQLite compatible) at `src/data.db`**

Schema is created automatically at startup by top-level `await` calls in `src/lib/server/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS user (
    id            TEXT NOT NULL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
    id         TEXT    NOT NULL PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    user_id    TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS mission (
    id       TEXT    NOT NULL PRIMARY KEY,
    title    TEXT    NOT NULL,
    actions  JSON    NOT NULL,
    isLoaded BOOLEAN NOT NULL
);
```

- **`user`** — registered GCS operators. Passwords are hashed with Argon2id.
- **`session`** — managed entirely by Lucia. Created on login, deleted on logout.
- **`mission`** — saved waypoint missions. `actions` is a JSON-serialized `Record<number, MissionAction>`. Only one row can have `isLoaded=1` at a time.

---

## 5. Data Flow — Telemetry Pipeline

The GCS uses a **request-poll pattern**, not WebSockets. The layout polls the server every 1.1 seconds and receives a batch of decoded packet strings.

```
Flight Controller
│  MAVLink 2 binary packets (UART / Ethernet)
│
▼
Server: src/lib/server/mavlink.ts (globalThis.__mav singleton)
│  node-mavlink: MavLinkPacketSplitter → MavLinkPacketParser
│  Decoded packet → REGISTRY[msgid] → JSON
│  Serialized: "MSG_NAME(magic)::ISO::sysid=X,compid=Y::{JSON}"
│  Appended to S.logs and S.newLogs[]
│
▼
POST /api/mavlink/heartbeat  (called every 1,100 ms by +layout.svelte)
│  Atomically drains S.newLogs via splice(0)
│  Returns: { logs: string[], portOpen: bool, online: bool }
│
▼
+layout.svelte → checkOnlineStatus()
│  calls processLogLine() for each log string
│
▼
src/lib/mavlink/parser.ts → buildMessageHandlers()
│  Routes by MSG_NAME prefix to handler:
│
├── ATTITUDE             → mavPitchStore (rad→deg), mavRollStore (rad→deg)
├── GLOBAL_POSITION_INT  → mavLocationStore (×1e-7), mavHeadingStore (÷100),
│                          mavAltitudeStore (relAlt ÷1000), mavSpeedStore (NED vx/vy/vz)
├── GPS_RAW_INT          → mavSatelliteStore (sats count + HDOP)
├── HEARTBEAT            → mavTypeStore, mavModelStore, mavStateStore,
│                          mavArmedStateStore (baseMode bit 7), mavModeStore (CopterMode/PlaneMode/RoverMode)
├── BATTERY_STATUS       → mavBatteryStore (cell voltages LiPo curve), mavVoltageStore
│                          + triggers RTLL on armed + ≤20%
├── SYS_STATUS           → mavVoltageStore (fallback when BATTERY_STATUS gives -1)
├── MISSION_CURRENT      → missionIndexStore
├── MISSION_ITEM_REACHED → missionCompleteStore, waypoint toast notification
├── COMMAND_ACK          → arm/disarm confirmation, error notifications
├── STATUSTEXT           → toast notifications (filtered by severity)
├── PARAM_VALUE          → mavlinkParamStore[paramId] (incremental population)
└── MOUNT_STATUS         → mavGimbalTiltStore (pointingA ÷100), mavGimbalPanStore (pointingB ÷100),
                           mavGimbalStore
│
▼
Svelte stores  →  UI components update reactively
```

**Command path (reverse direction):**
```
UI component
 → $lib/api/mavlink.ts (fetch wrapper)
 → POST /api/mavlink/[type]
 → src/lib/server/mavlink.ts (command function)
 → _send() → UDP: protocol.serialize() + socket.send()
              Serial/TCP: node-mavlink send() utility
 → Flight Controller
```

---

## 6. Features

### 6.1 MAVLink Communication

The connection modal (`ConnectionModal.svelte`) offers three transport modes:

| Mode | Fields | Notes |
|---|---|---|
| **Serial** | Port path (auto-detected or manual) | Defaults to 115200 baud. Auto-scans USB devices every 2s via USB hotplug watcher. |
| **TCP** | Host IP, Port number | Standard TCP/IP. 10-second connection timeout. |
| **UDP** | Remote host IP, Remote port, Local bind port | Sends GCS heartbeats to FC to open the data channel. Default local bind port: 14550. |

The `allow-udp-14550.ps1` script adds a Windows Firewall exception for UDP port 14550 if needed.

**Telemetry streams requested after UDP connect** (via `SET_MESSAGE_INTERVAL`):

| Message | Rate |
|---|---|
| HEARTBEAT | 1 Hz |
| SYS_STATUS | 2 Hz |
| GPS_RAW_INT | 4 Hz |
| ATTITUDE | 4 Hz |
| LOCAL_POSITION_NED | 4 Hz |
| GLOBAL_POSITION_INT | 4 Hz |
| MISSION_CURRENT | 2 Hz |
| VFR_HUD | 2 Hz |
| BATTERY_STATUS | 2 Hz |

---

### 6.2 Dashboard / Cockpit

**Route:** `/dashboard`

The dashboard is the primary operational screen. It renders a full-screen map background (switchable between 2D Leaflet and 3D MapLibre GL) with an overlaid HUD.

**HUD Elements:**

- **Top status bar** — connection status, battery indicator (colour-coded green/yellow/red), armed/disarmed state, flight mode badge, GPS satellite count + HDOP
- **Bottom dock** — SPD (m/s), GPS coordinates (lat/lng), AGL altitude (m), Artificial Horizon (SVG), Compass rose, terrain profile chart
- **Top-left** — `Stats.svelte` panel with detailed flight stats
- **Bottom-right** — Altitude nudge slider + `DPad.svelte` for GUIDED/LOITER position control

**Stats Panel (`Stats.svelte`):**
- Arm/Disarm button with pre-flight confirmation
- Flight mode dropdown (sends `DO_SET_MODE`)
- Takeoff, Land, RTL, Pause, Stop buttons
- Mission Start sequence (sets RTL_ALT → GUIDED → disable ARMING_CHECK → ARM → wait for altitude ≥8m → AUTO)
- Payload release command
- Sensor calibration triggers
- ETA and remaining mission distance (Haversine formula over waypoint markers)

**DPad (`DPad.svelte`):**  
Sends `SET_POSITION_TARGET_LOCAL_NED` with `BODY_OFFSET_NED` frame. Only active in GUIDED or LOITER modes — disabled with tooltip in other modes.

**Battery Colour Coding:**

| Level | Colour |
|---|---|
| ≥50% | Green (`#22c55e`) |
| 20–49% | Amber (`#f59e0b`) |
| <20% | Red (`#ef4444`) |

**Flight Mode Badge Colours:**

| Mode Category | Colour |
|---|---|
| RTL / Return | Purple |
| Land | Orange |
| Takeoff / Launch | Pink |
| Guided / Auto / Mission | Blue |
| Loiter / Cruise | Orange |
| Stabilize / Angle | Green |
| AltHold | Yellow |
| PosHold / Hold | Teal |
| Failsafe | Red |
| Manual / Acro | Grey |

---

### 6.3 Mission Planning

**Route:** `/mission-planner`

**Supported MAVLink commands:**

| Command | Description |
|---|---|
| `NAV_WAYPOINT` | Fly to waypoint |
| `NAV_TAKEOFF` | Takeoff to altitude |
| `NAV_LAND` | Land at position |
| `NAV_RTL` | Return to launch |
| `NAV_LOITER_UNLIM` | Loiter indefinitely |
| `NAV_LOITER_TURNS` | Loiter N turns |
| `NAV_LOITER_TIME` | Loiter for N seconds |
| `NAV_LOITER_TO_ALT` | Loiter until altitude |
| `NAV_CONTINUE_AND_CHANGE_ALT` | Continue and change altitude |
| `NAV_SPLINE_WAYPOINT` | Spline-interpolated waypoint |
| `DO_SET_CAM_TRIGG_DIST` | Trigger camera every N metres |
| `DO_GRIPPER` | Operate payload release gripper |
| `DO_SET_RELAY` | Set relay output |
| `DO_REPEAT_RELAY` | Repeat relay N times |
| `DO_SET_SERVO` | Set servo position |
| `DO_REPEAT_SERVO` | Repeat servo position N times |
| `DO_CHANGE_SPEED` | Change cruise speed |
| `DO_SET_HOME` | Set home position |
| `DO_SET_ROI` | Set region of interest |
| `CONDITION_DELAY` | Delay N seconds |
| `CONDITION_DISTANCE` | Advance when within N metres |
| `CONDITION_YAW` | Turn to heading |
| `CONDITION_CHANGE_ALT` | Ramp altitude change |

**Upload to FC:**  
`MISSION_COUNT` sent first, then `MISSION_ITEM_INT` for each waypoint with a 250ms inter-item delay to avoid overloading the FC.

**Mission persistence:**  
Saved to the `mission` table as JSON via `POST /api/mission/save`. Only one mission can be loaded at a time (`isLoaded=1`). Loaded mission is restored on page refresh.

---

### 6.4 Gimbal & Live Video

**Route:** `/gimbal`

**Video (`LiveFeed.svelte`):**
- Connects to HLS stream at `http://{hostname}:{VITE_VIDEO_PORT}/{VITE_VIDEO_PATH}` using HLS.js
- Overlaid with AHI, telemetry strip (coordinates, altitude, heading, gimbal angles)
- Screen recording via `MediaRecorder` API
- Optional SRT subtitle export with telemetry synced to recording timestamps

**Gimbal Control (`GimbalControl.svelte`):**

| Control | MAVLink Command |
|---|---|
| Pan (yaw) | `DO_MOUNT_CONTROL` (command 205) |
| Tilt (pitch) | `DO_MOUNT_CONTROL` (command 205) |
| Zoom | `SET_CAMERA_ZOOM` (command 531) |
| Start recording | `VIDEO_START_CAPTURE` |
| Stop recording | `VIDEO_STOP_CAPTURE` |
| Capture photo | `IMAGE_START_CAPTURE` |

Gimbal feedback comes from `MOUNT_STATUS` messages:
- `pointingA` (÷100) → tilt degrees
- `pointingB` (÷100) → pan degrees

---

### 6.5 Offline Maps

**How it works:**  
Every tile request to `GET /api/tiles/[z]/[x]/[y]` checks the disk cache at `tile-cache/{z}/{x}/{y}.png` first. On cache miss it fetches from these sources in order:
1. Wikimedia Maps (`maps.wikimedia.org/osm-intl`)
2. CARTO Voyager (`basemaps.cartocdn.com/rastertiles/voyager`)
3. Stadia Maps (`tiles.stadiamaps.com/tiles/osm_bright`)

Validated PNG tiles are saved to disk with a 7-day `Cache-Control` header. On total failure (all sources down, no network) a transparent 256×256 PNG placeholder is returned so the map does not break.

**Pre-downloading (`OfflineMapDownloader.svelte`):**  
Iterates over tile coordinates within a user-specified radius (default 10 km) across a range of zoom levels (default 10–18) and hits the tile proxy endpoint for each one, triggering disk caching. Progress is displayed as a percentage bar.

**Cache statistics:**  
`GET /api/tiles/cache-info` reports total OSM tiles and Google satellite tiles on disk with sizes.

---

### 6.6 3D Map View

The dashboard map has a 2D/3D toggle. The 3D view uses `MapLibre GL` with:
- MapTiler `basic-v2` style (requires `VITE_MAPTILER_KEY` in `.env`)
- 3D building extrusion from OpenStreetMap data
- Satellite imagery proxied through the GCS server for offline caching
- Drone position tracked with a marker synced to `mavLocationStore`

---

### 6.7 Pre-Flight Check

**Component:** `PreFlightCheck.svelte`

15-item sequential checklist across 6 categories. Each check has a 300ms delay between items. Critical failures block the "Proceed" button.

| Category | Checks |
|---|---|
| **Power** | Battery ≥20%, voltage valid |
| **Navigation** | GPS fix (≥6 sats + HDOP <1.4 for Loiter), HDOP acceptable |
| **Sensors** | IMU responsive (online flag), barometer responsive |
| **Communication** | MAVLink link online, telemetry flowing |
| **Flight Control** | FC responsive, armed/disarmed state confirmed |
| **Safety** | Pre-arm checks reported, geofence status |

GPS thresholds match ArduPilot's requirements for arming in Loiter mode (HDOP <1.4, ≥6 satellites).

---

### 6.8 Parameters Editor

**Route:** `/parameters`

On mount, sends `PARAM_REQUEST_LIST`. The FC responds with a stream of `PARAM_VALUE` messages, each decoded by the parser into `mavlinkParamStore[paramId]`. The editor displays all parameters incrementally as they arrive, with:
- Search/filter by parameter name
- Inline editing with type-aware value clamping (`MAV_PARAM_TYPE` uint8 through double)
- Write via `PARAM_SET` message
- Auto-retry if the stream stalls

---

### 6.9 Event Log

**Route:** `/event-log`

Displays the rolling window of decoded MAVLink packet strings from `mavlinkLogStore` (last 1,000 entries). Features:
- Filter checkboxes to hide verbose types (TIMESYNC, PARAM_VALUE, GPS_RAW_INT, BATTERY_STATUS)
- Text search with match highlighting
- Download full log as a `.txt` file
- Heartbeat pulse animation to confirm live data

---

### 6.10 Weather Widget

**Component:** `Weather.svelte`

Fetches weather for the drone's current GPS position using:
- **[Open-Meteo API](https://open-meteo.com/)** — temperature, wind speed/direction, precipitation probability, WMO weather code (free, no API key)
- **[OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)** — reverse geocoding for location name

Computed values:
- Headwind component (wind speed × cos(wind_angle - drone_heading))
- Crosswind component (wind speed × sin(wind_angle - drone_heading))

Updates every 60 seconds.

---

### 6.11 Indian Grid Reference System (IGRS)

**Module:** `src/lib/igrs.ts`

Converts WGS84 (lat/lng) coordinates to IGRS grid references for display in `Map.svelte` as the cursor moves.

**Projection:** Simplified Lambert Conformal Conic on the Everest 1956 ellipsoid (semi-major axis 6,377,301.243 m, eccentricity 0.0818140773).

**Zone coverage:**

| Zone | Latitude | Longitude |
|---|---|---|
| I | 8–13°N | 68–80°E |
| IIA | 13–18°N | 68–77°E |
| IIB | 13–18°N | 77–90°E |
| IIIA | 18–24°N | 68–77°E |
| IIIB | 18–24°N | 77–90°E |
| IVA | 24–32°N | 68–80°E |
| IVB | 24–32°N | 80–92°E |

Output format: `"ZONE 4-digit-easting 4-digit-northing"` (e.g. `IIIA 5123 6789`)

> **Note:** The projection is approximate. For production surveying work, use `proj4js` or GDAL with the official IGRS datum transformation parameters.

---

### 6.12 Camera Swath Footprint

**Module:** `src/lib/swath.ts`  
**Component:** `SwathDisplay.svelte`

Calculates the camera's ground footprint polygon based on:
- Drone altitude (AGL from `mavAltitudeStore`)
- Gimbal tilt angle
- Horizontal and vertical field of view
- Drone heading

The result is overlaid as a Leaflet polygon on the 2D map.

---

### 6.13 Defense Series Maps (DSM)

**Component:** `Map.svelte`

`Map.svelte` includes WMS and XYZ tile layer configuration entries for DSM Tactical, DSM Satellite, and DSM plain tile sources. The layer URLs point to placeholder values (`https://your-dsm-server.mil/...`) that must be replaced with an operator's actual DSM WMS/tile server address.

See [`docs/DSM_CONFIG.md`](DSM_CONFIG.md) for setup instructions.

---

### 6.14 Automatic Return-to-Launch (RTLL)

Implemented in the `BATTERY_STATUS` handler in `src/lib/mavlink/parser.ts`.

**Trigger condition:** Battery ≤20% AND vehicle is armed.

**Logic:**

1. Checks GPS health: ≥6 satellites AND HDOP <2.0
2. **If GPS healthy:**
   - Sends `DO_SET_MODE` → LOITER (mode 5)
   - Shows "RTLL Activated" warning notification
   - After 30 seconds in LOITER, sends `DO_SET_MODE` → RTL (mode 6)
3. **If GPS weak:**
   - Sends `DO_SET_MODE` → RTL immediately
   - Shows error notification explaining degraded GPS

The `rtllState.triggered` flag prevents multiple triggers. It resets to `false` when the vehicle disarms.

---

### 6.15 Authentication & Sessions

**Library:** Lucia v3 with `LibSQLAdapter`  
**Password Hashing:** Argon2id (memoryCost=19456, timeCost=2, outputLen=32 bytes)

**Registration:** Username + password. Checks for existing admin user; first user becomes admin. Password is hashed and stored in the `user` table.

**Login:** Username + password verification via Argon2id. On success, Lucia creates a session, sets a secure HttpOnly cookie.

**Session lifecycle:**  
- Session cookie is refreshed automatically when still fresh (Lucia `isWithinExpirationDate`)
- Activity-based client-side timeout: `lastActivity` cookie is updated on mouse/keyboard/scroll events. `+layout.svelte` checks every second; after 10 minutes of inactivity, calls logout which disconnects MAVLink and redirects to `/login`.
- Server-side: `+layout.server.ts` redirects any unauthenticated request (except `/login`, `/register`, `/api/*`) to `/login`.

---

## 7. API Reference

All API routes are under `/api/`. They bypass the auth redirect in `+layout.server.ts` but MAVLink commands require the server MAVLink singleton to be connected.

### 7.1 MAVLink API

**Endpoint:** `POST /api/mavlink/[type]`

| `type` | Request Body / Headers | Response | Description |
|---|---|---|---|
| `heartbeat` | — | `{ logs: string[], portOpen: bool, online: bool }` | Drain buffered telemetry logs; get connection state |
| `status` | — | `{ connected, portOpen, online, connecting, type, udpHost, udpPort }` | Current connection status |
| `connect` | JSON body: `{ type, port?, host?, portNumber?, bindPort? }` | connection status | Open serial/TCP/UDP connection |
| `select_port` | Header: `port` (path string) | connection status | Open specific serial port |
| `disconnect` | — | `{ connected: false, portOpen: false, online: false }` | Close active connection |
| `list_ports` | — | `SerialPortInfo[]` | List available serial ports |
| `send_command` | Headers: `command`, `params` (CSV), `useCmdLong`, `useArduPilotMega` | text | Send arbitrary MAVLink command |
| `clear_mission` | — | text | Send `MISSION_CLEAR_ALL` |
| `load_mission` | Header: `actions` (JSON) | text | Upload mission items to FC |
| `set_position_local` | Headers: `x`, `y`, `z` | text | Send `SET_POSITION_TARGET_LOCAL_NED` |
| `set_altitude` | Header: `altitude` (metres) | text | Send `SET_POSITION_TARGET_GLOBAL_INT` (altitude only) |
| `request_params` | — | text | Send `PARAM_REQUEST_LIST` |
| `write_param` | Headers: `id`, `value`, `type` | text | Send `PARAM_SET` |

---

### 7.2 Mission API

**Endpoint:** `POST /api/mission/[type]`

| `type` | Description |
|---|---|
| `save` | Insert new mission to DB |
| `load` | Set `isLoaded=1` for a mission (clears others) |
| `unload` | Set `isLoaded=0` for all missions |
| `checkExists` | Check if a mission with given title exists |
| `update` | Update title/actions for existing mission |
| `list` | Return all missions |
| `delete` | Delete a mission by id |

---

### 7.3 Tiles API

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/tiles/[z]/[x]/[y]` | GET | OSM tile proxy with disk cache fallback |
| `GET /api/tiles/google/[z]/[x]/[y]` | GET | Google satellite tile proxy with disk cache |
| `GET /api/tiles/cache-info` | GET | Returns `{ osm: { count, size }, google: { count, size } }` |

---

### 7.4 Maps API

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/maps/upload` | POST | Upload custom map layer (GeoTIFF, KML, GeoJSON, MBTiles, etc.) |
| `GET /api/maps/list` | GET | List uploaded map layers |

---

### 7.5 Auth API

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/auth/login` | POST | Form-action login (also handled by `login/+page.server.ts`) |
| `POST /api/auth/register` | POST | Form-action registration |
| `GET /api/auth/checkAdmin` | GET | Check if any admin user exists |

---

## 8. Svelte Stores

### `mavlinkStore.ts`

| Store | Type | Default | Source |
|---|---|---|---|
| `onlineStore` | `boolean` | `false` | MAVLink heartbeat status |
| `mavModelStore` | `string` | `'UNKNOWN'` | `HEARTBEAT.autopilot` |
| `mavTypeStore` | `string` | `'Unknown'` | `HEARTBEAT.type` |
| `mavArmedStateStore` | `boolean` | `false` | `HEARTBEAT.baseMode` bit 7 |
| `mavStateStore` | `string` | `'Unknown'` | `HEARTBEAT.systemStatus` |
| `mavModeStore` | `string` | `'Unknown'` | `HEARTBEAT.customMode` via CopterMode/PlaneMode/RoverMode enum |
| `mavLocationStore` | `{ lat, lng }` | Atlanta, GA | `GLOBAL_POSITION_INT` ×1e-7 |
| `mavSatelliteStore` | `{ total, hdop }` | `{ 0, 999.0 }` | `GPS_RAW_INT` |
| `mavHeadingStore` | `number` (deg) | `320` | `GLOBAL_POSITION_INT.hdg` ÷100 |
| `mavAltitudeStore` | `number` (m) | `0` | `GLOBAL_POSITION_INT.relativeAlt` ÷1000 |
| `mavSpeedStore` | `number` (m/s) | `0` | `GLOBAL_POSITION_INT` vx/vy/vz ÷100 (3D) |
| `mavPitchStore` | `number` (deg) | `0` | `ATTITUDE.pitch` ×(180/π) |
| `mavRollStore` | `number` (deg) | `0` | `ATTITUDE.roll` ×(180/π) |
| `mavBatteryStore` | `number \| null` | `null` | `BATTERY_STATUS` cell voltages (LiPo curve) |
| `mavVoltageStore` | `number \| null` | `null` | `BATTERY_STATUS` or `SYS_STATUS` |
| `mavlinkLogStore` | `string[]` | `[]` | All decoded packet strings (last 1,000) |
| `mavlinkParamStore` | `Record<string, Parameter>` | `{}` | `PARAM_VALUE` incremental |
| `mavGimbalTiltStore` | `number` (deg) | `0` | `MOUNT_STATUS.pointingA` ÷100 |
| `mavGimbalPanStore` | `number` (deg) | `0` | `MOUNT_STATUS.pointingB` ÷100 |
| `mavGimbalStore` | `{ pitch, roll, yaw, zoom }` | all 0, zoom 1 | MOUNT_STATUS + GimbalControl |
| `mavPendingArmStore` | `boolean \| null` | `null` | Optimistic arm state while awaiting COMMAND_ACK |

### `missionPlanStore.ts`

| Store | Type | Description |
|---|---|---|
| `missionPlanTitleStore` | `string` | Current mission title |
| `missionPlanActionsStore` | `Record<number, MissionAction>` | All waypoint actions |
| `missionCountStore` | `number` | Number of waypoints |
| `missionIndexStore` | `number` | Current active waypoint index (from FC) |
| `missionCompleteStore` | `boolean` | Whether the last waypoint has been reached |

### `mapStore.ts`

| Store | Type | Description |
|---|---|---|
| `mapStore` | `Leaflet.Map \| null` | The active Leaflet map instance |
| `markersStore` | `Leaflet.Marker[]` | Waypoint markers on the map |
| `polylinesStore` | `Leaflet.Polyline[]` | Mission path lines |
| `mapTypeStore` | `string` | Active tile layer name |
| `mapZoomStore` | `number` | Current zoom level |
| `lockViewStore` | `boolean` | Whether map view follows the drone |
| `threeDMapStore` | `MapLibre.Map \| null` | The active MapLibre 3D map instance |

### `customizationStore.ts`

| Store | Type | Description |
|---|---|---|
| `darkModeStore` | `boolean` | Dark / light theme toggle |
| `primaryColorStore` | `string` | CSS custom property `--primary-color` |
| `secondaryColorStore` | `string` | CSS custom property `--secondary-color` |
| `tertiaryColorStore` | `string` | CSS custom property `--tertiary-color` |
| `audoNotificationStore` | `boolean` | Audio alerts via Web Speech API |

### Other stores

| Store file | Key stores |
|---|---|
| `authStore.ts` | `loggedInStore: boolean` |
| `uiStore.ts` | `logbookOpenStore: boolean` |
| `notificationCountStore.ts` | `notificationCountStore: number` |

---

## 9. Components Reference

| Component | Route Used | Key Inputs | Key Outputs |
|---|---|---|---|
| `Map.svelte` | dashboard, mission-planner | `mavLocationStore`, `mavHeadingStore`, `missionPlanActionsStore` | Waypoint placement, map layer switches, IGRS cursor display |
| `3DMap.svelte` | dashboard | `mavLocationStore`, `MAPTILER_KEY` | 3D map display |
| `ConnectionModal.svelte` | layout | — | Calls `/api/mavlink/connect` |
| `ConnectionStatus.svelte` | layout | `onlineStore`, battery, mode, satellites | Status strip UI |
| `Stats.svelte` | dashboard | All telemetry stores | Arm/disarm, mode switch, mission start, RTL, land |
| `DPad.svelte` | dashboard | `mavModeStore` | `SET_POSITION_TARGET_LOCAL_NED` commands |
| `ArtificialHorizon.svelte` | dashboard, gimbal | `mavPitchStore`, `mavRollStore` | SVG AHI |
| `Compass.svelte` | mission-planner | `mavHeadingStore` | SVG compass rose |
| `GimbalControl.svelte` | gimbal | `mavGimbalStore` | Gimbal pan/tilt/zoom MAVLink commands |
| `LiveFeed.svelte` | gimbal | `VIDEO_PORT`, `VIDEO_PATH`, telemetry stores | HLS video + screen recording |
| `Weather.svelte` | mission-planner | `mavLocationStore` | Open-Meteo weather display |
| `MissionPlan.svelte` | mission-planner | `missionPlanActionsStore` | Waypoint CRUD |
| `MissionPlanSettings.svelte` | mission-planner | `missionPlanActionsStore` | Save to DB, upload to FC |
| `ManageMissionPlans.svelte` | mission-planner | — | Load/delete saved missions |
| `PreFlightCheck.svelte` | dashboard (modal) | All telemetry stores | Checklist UI, blocks takeoff on critical failure |
| `SwathDisplay.svelte` | dashboard | `mavAltitudeStore`, `mavHeadingStore`, `mavGimbalTiltStore` | Leaflet polygon overlay |
| `OfflineMapDownloader.svelte` | dashboard (via Map) | — | Tile pre-download with progress |
| `MapLayerUploader.svelte` | dashboard (via Map) | — | POST to `/api/maps/upload` |
| `Notification.svelte` | layout | `NotificationConfig` | Toast notification auto-destroyed after timeout |
| `Modal.svelte` | various | `title`, `message`, `type` | Confirmation dialog |
| `Offline.svelte` | layout | `onlineStore` | Shows offline banner |

---

## 10. Configuration & Environment Variables

Create a `.env` file in the project root by copying `.env.example`:

```bash
cp .env.example .env
```

| Variable | Side | Default | Purpose |
|---|---|---|---|
| `USB_SERIAL_PORT` | Server only | *(auto-detect)* | Override serial port path (e.g. `COM3`, `/dev/ttyACM0`) |
| `USB_BAUD_RATE` | Server only | `115200` | Serial baud rate |
| `VITE_VIDEO_PORT` | Client | `8889` | HLS stream server port |
| `VITE_VIDEO_PATH` | Client | `cam` | HLS stream URL path segment |
| `VITE_MAPTILER_KEY` | Client | *(empty)* | MapTiler API key — required for 3D map view ([maptiler.com](https://www.maptiler.com/)) |
| `VITE_ALTITUDE_ANGEL_API_KEY` | Client | *(empty)* | Altitude Angel airspace overlay key (optional) |
| `NODE_ENV` | Server only | `development` | Set to `production` for deployment builds |

`VITE_*` variables are bundled into the client-side JavaScript at build time (visible in the browser bundle). Non-`VITE_*` variables are server-only.

`vite.config.ts` explicitly injects `USB_SERIAL_PORT` and `USB_BAUD_RATE` as `process.env.*` so the server-side `mavlink.ts` module can read them.

---

## 11. Build & Deployment

### Development

```bash
npm install
npm run dev
# Server starts on http://0.0.0.0:5173 (exposed on all interfaces)
```

HMR is handled safely: `src/lib/server/mavlink.ts` detects module re-execution and closes any orphaned serial/TCP/UDP ports stored in `globalThis.__mav` before reinitialising.

### Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite dev` | Start development server with HMR |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production build locally |
| `check` | `svelte-kit sync && svelte-check` | TypeScript + Svelte type checking |
| `lint` | `eslint .` | ESLint code linting |
| `list-ports` | `node list-ports.js` | Print available serial ports |

### Production Build

```bash
npm run build
node .svelte-kit/adapter-node/index.js
```

`@sveltejs/adapter-node` outputs a self-contained Node.js application to `.svelte-kit/adapter-node/`. The entry point is `index.js`.

**Production requirements:**
- Node.js 18+
- Write access to `tile-cache/` directory (created automatically)
- Write access to `src/data.db` (SQLite database)
- If using serial port on Linux: user must be in the `dialout` group

### Windows UDP Setup

Run `allow-udp-14550.ps1` as Administrator to add a Windows Firewall inbound rule for UDP port 14550:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\allow-udp-14550.ps1
```

---

## 12. Design Decisions & Known Limitations

### Polling vs WebSockets
The telemetry pipeline uses HTTP polling (every 1.1 seconds) rather than WebSockets. This introduces up to ~1.1 seconds of latency between a MAVLink packet arriving on the server and updating the UI. The tradeoff was simplicity — no WebSocket infrastructure or connection management needed. For applications requiring sub-100ms UI response (racing, precision approach), replace the heartbeat loop with a WebSocket or SSE stream.

### MAVLink singleton on `globalThis`
The connection state lives in `globalThis.__mav` rather than a module-scoped variable. This is necessary because Vite HMR hot reloads re-execute all modules but `globalThis` persists. Without this, every file save during development would orphan an open serial/UDP port.

### UDP back-channel (heartbeat required)
ArduPilot's UDP implementation is response-to-host: it only sends packets back to the IP address and port that last sent it a valid MAVLink packet. The GCS sends a 1 Hz GCS heartbeat immediately after binding so the FC knows where to send telemetry.

### Battery percentage calculation
ArduPilot's `batteryRemaining` field in `BATTERY_STATUS` often reports 99% until `BATT_MONITOR` is properly configured. The parser extracts raw cell voltages from the `voltages[]` array and maps them on a 3,300 mV (0%) – 4,200 mV (100%) LiPo curve for a more accurate reading.

### Arming bypasses pre-arm checks
The `startMission()` sequence writes `ARMING_CHECK=0` before arming and restores it to 1 afterward. This allows GCS-only operation without an RC transmitter connected, but it also bypasses ArduPilot's safety interlocks. Operators must ensure a manual pre-flight check is performed.

### IGRS is approximate
`src/lib/igrs.ts` uses a simplified Lambert Conformal Conic without the full Everest 1956 datum correction chain. The output may be off by tens of metres. For survey-grade accuracy, replace with `proj4js` using official IGRS transform parameters.

### DSM map layers are stubbed
The DSM tile/WMS URLs in `Map.svelte` point to placeholder values. This feature requires an operator to supply their own DSM server address. The georaster upload endpoint also returns placeholder bounds for raster format uploads.

### Session security
The `lastActivity` cookie is not HttpOnly and is readable by client JavaScript. This is by design (the client checks it to trigger logout). The Lucia session cookie itself is HttpOnly and Secure, so session hijacking via XSS would require reading the Lucia cookie, which is protected.

---

## 13. Existing Documentation Index

The `docs/` directory contains the following reference documents:

| File | Standard | Contents |
|---|---|---|
| `SRS_ISO12207_Sidak_GCS.md` | ISO 12207 | Software Requirements Specification |
| `ADD_ISO12207_Sidak_GCS.md` | ISO 12207 | Architectural Design Document |
| `SVVP_IEEE1012_Sidak_GCS.md` | IEEE 1012 | Software Verification & Validation Plan |
| `REQUIREMENTS_COMPLIANCE.md` | — | Requirements traceability matrix |
| `FULL_REQUIREMENTS_STATUS.md` | — | Detailed requirements implementation status |
| `IMPLEMENTATION_COMPLETE.md` | — | Implementation checklist |
| `IMPLEMENTATION_SESSION_SUMMARY.md` | — | Development session notes |
| `DSM_CONFIG.md` | — | Defense Series Maps configuration guide |
| `DSM_IMPLEMENTATION_SUMMARY.md` | — | DSM feature implementation notes |
| `DSM_QUICK_START.md` | — | Fast setup for DSM layers |
| `OFFLINE_MAPS_FEATURE.md` | — | Offline maps feature overview |
| `OFFLINE_MAPS_GUIDE.md` | — | Detailed offline maps user guide |
| `OFFLINE_MAPS_QUICK_REFERENCE.md` | — | Offline maps quick reference card |
| `OFFLINE_MAPS_VISUAL_GUIDE.md` | — | Visual guide for offline maps |
| `MY_CONNECTION_SETTINGS.md` | — | Operator-specific connection settings |
| `QUICK_START.md` | — | Getting started guide |
| `TEST_UDP_INSTRUCTIONS.md` | — | UDP connection testing guide |
| `UDP_CONNECTION_QUICK_START.md` | — | UDP quick start guide |
| `UDP_ETHERNET_CONNECTION_GUIDE.md` | — | Detailed Ethernet/UDP connection guide |
| `UDP_TCP_IMPLEMENTATION.md` | — | TCP/UDP implementation documentation |

---

*This document was generated from a full codebase analysis of the sidakGCS project.*
