<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import Map from '../../components/Map.svelte';
  import ThreeDMap from '../../components/3DMap.svelte';
  import ArtificialHorizon from '../../components/ArtificialHorizon.svelte';
  import Stats from '../../components/Stats.svelte';
  import DPad from '../../components/DPad.svelte';
  import {
    mavLocationStore, mavHeadingStore, mavAltitudeStore, mavSpeedStore,
    mavBatteryStore, mavSatelliteStore, mavModeStore, mavArmedStateStore,
    mavStateStore, mavModelStore, mavTypeStore, mavRollStore, mavPitchStore,
    mavVoltageStore,
  } from '../../stores/mavlinkStore';
  import { missionPlanActionsStore, missionPlanTitleStore } from '../../stores/missionPlanStore';
  import { mapStore, threeDMapStore, mapZoomStore, lockViewStore } from '../../stores/mapStore';
  import { sendCommand, setAltitude } from '$lib/api/mavlink';
  import { logbookOpenStore } from '../../stores/uiStore';

  // ── Reactive telemetry ─────────────────────────────────────────────────────
  $: mavLocation = $mavLocationStore;
  $: heading     = $mavHeadingStore;
  $: altitude    = $mavAltitudeStore;
  $: speed       = $mavSpeedStore;
  $: battery     = $mavBatteryStore;
  $: voltage     = $mavVoltageStore;
  $: sats        = $mavSatelliteStore;
  $: mavMode     = $mavModeStore;
  $: armed       = $mavArmedStateStore;
  $: sysState    = $mavStateStore;
  $: mavModel    = $mavModelStore;
  $: mavType     = $mavTypeStore;
  $: roll        = $mavRollStore;
  $: actions     = $missionPlanActionsStore;
  $: missionTitle = $missionPlanTitleStore;

  // ── View toggle 2D / 3D ───────────────────────────────────────────────────
  let view3D = false;
  function toggleView3D() {
    view3D = !view3D;
    if (typeof window !== 'undefined') setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  }

  // ── Follow mode ───────────────────────────────────────────────────────────
  const FOLLOW_LABELS = ['Free', 'Follow', 'Hdg-up'] as const;
  let followIdx = 1;
  $: followLabel = FOLLOW_LABELS[followIdx];

  function cycleFollow() {
    followIdx = (followIdx + 1) % FOLLOW_LABELS.length;
    lockViewStore.set(FOLLOW_LABELS[followIdx] !== 'Free');
    if (FOLLOW_LABELS[followIdx] === 'Hdg-up' && view3D) {
      const m = get(threeDMapStore) as any;
      if (m?.easeTo) m.easeTo({ bearing: heading, pitch: 60 });
    }
  }

  function zoomBy(delta: number) {
    if (view3D) {
      const m = get(threeDMapStore) as any;
      if (m) { delta > 0 ? m.zoomIn?.() : m.zoomOut?.(); return; }
    } else {
      const m = get(mapStore);
      if (m) { delta > 0 ? m.zoomIn() : m.zoomOut(); return; }
    }
    mapZoomStore.set(Math.max(0, Math.min(20, (get(mapZoomStore) || 18) + delta)));
  }

  // ── GPS ───────────────────────────────────────────────────────────────────
  $: fixType  = sats.total === 0 ? 'No fix' : sats.total < 4 ? '2D' : sats.total < 6 ? '3D' : '3D DGPS';
  $: fixColor = sats.total === 0 ? '#ef4444' : sats.total < 4 ? '#f59e0b' : '#4ade80';

  // ── Battery ───────────────────────────────────────────────────────────────
  $: battPct   = battery !== null ? Math.max(0, Math.min(100, battery)) : 0;
  $: battColor = battery === null ? '#64748b' : battery < 20 ? '#ef4444' : battery < 50 ? '#f59e0b' : '#22c55e';

  // ── Speed km/h ────────────────────────────────────────────────────────────
  $: speedKmh = Math.round(speed * 3.6);

  // ── Altitude display ──────────────────────────────────────────────────────
  $: altDisplay = altitude.toFixed(1);

  // ── Mode colour (KiteGC palette) ──────────────────────────────────────────
  $: modeColor = (() => {
    const m = (mavMode || '').toUpperCase();
    if (m.includes('FAILSAFE') || m.includes('FS'))  return '#ef4444';
    if (m.includes('AUTO') || m.includes('MISSION')) return '#22d3ee';
    if (m.includes('RTL') || m.includes('RETURN'))   return '#a78bfa';
    if (m.includes('LAND'))    return '#fb923c';
    if (m.includes('GUIDED'))  return '#60a5fa';
    if (m.includes('LOITER'))  return '#fb923c';
    if (m.includes('STAB') || m.includes('ANGLE'))   return '#4ade80';
    if (m.includes('ALTHOLD')) return '#facc15';
    if (m.includes('POSHOLD')) return '#2dd4bf';
    return '#4ade80';
  })();

  // ── LINK quality ─────────────────────────────────────────────────────────
  // Real RC link data would come from RADIO_STATUS — using a proxy for now
  $: linkPct   = sats.total === 0 ? 0 : Math.round(Math.min(100, 100 - sats.hdop * 8));
  $: linkColor = linkPct > 60 ? '#4ade80' : linkPct > 30 ? '#f59e0b' : '#ef4444';

  // ── Home distance/bearing ─────────────────────────────────────────────────
  $: home = actions[0] ? { lat: actions[0].lat, lng: actions[0].lon } : null;
  $: homeInfo = home ? calcDistBearing(mavLocation.lat, mavLocation.lng, home.lat, home.lng) : null;

  function calcDistBearing(la1: number, lo1: number, la2: number, lo2: number) {
    const R = 6371000, r = (d: number) => d * Math.PI / 180;
    const dLa = r(la2 - la1), dLo = r(lo2 - lo1);
    const a = Math.sin(dLa/2)**2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLo/2)**2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const b = (Math.atan2(Math.sin(dLo)*Math.cos(r(la2)),
      Math.cos(r(la1))*Math.sin(r(la2)) - Math.sin(r(la1))*Math.cos(r(la2))*Math.cos(dLo)) * 180 / Math.PI + 360) % 360;
    return { dist: d, bearing: b };
  }

  $: homeDist = homeInfo
    ? homeInfo.dist < 1000 ? homeInfo.dist.toFixed(0) + ' m' : (homeInfo.dist / 1000).toFixed(1) + ' km'
    : '-- m';
  $: homeBrg  = homeInfo ? homeInfo.bearing.toFixed(0) + '°' : '--°';

  // ── Flight mode change ───────────────────────────────────────────────────
  const MODES = [
    { label: 'STABILIZE',    mode: 0  },
    { label: 'ACRO',         mode: 1  },
    { label: 'ALT_HOLD',     mode: 2  },
    { label: 'AUTO',         mode: 3  },
    { label: 'GUIDED',       mode: 4  },
    { label: 'LOITER',       mode: 5  },
    { label: 'RTL',          mode: 6  },
    { label: 'CIRCLE',       mode: 7  },
    { label: 'LAND',         mode: 9  },
    { label: 'DRIFT',        mode: 11 },
    { label: 'SPORT',        mode: 13 },
    { label: 'FLIP',         mode: 14 },
    { label: 'AUTOTUNE',     mode: 15 },
    { label: 'POSHOLD',      mode: 16 },
    { label: 'BRAKE',        mode: 17 },
    { label: 'THROW',        mode: 18 },
    { label: 'GUIDED_NOGPS', mode: 20 },
    { label: 'SMART_RTL',    mode: 21 },
    { label: 'FLOWHOLD',     mode: 22 },
    { label: 'FOLLOW',       mode: 23 },
    { label: 'ZIGZAG',       mode: 24 },
    { label: 'AUTO_RTL',     mode: 27 },
  ];

  let modeDropdownOpen = false;

  async function setMode(modeNum: number) {
    modeDropdownOpen = false;
    try { await sendCommand('DO_SET_MODE', [1, modeNum], true); }
    catch (e) { console.error('[cockpit] setMode failed:', e); }
  }

  // Close dropdown when clicking outside
  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.mode-dropdown-wrap')) modeDropdownOpen = false;
  }
  // ── Panel collapse state ──────────────────────────────────────────────────
  let statsOpen    = true;
  let manualOpen   = true;

  const ALT_MODES = new Set(['GUIDED', 'LOITER', 'AUTO', 'CIRCLE', 'RTL']);
  const YAW_MODES = new Set(['GUIDED', 'LOITER', 'AUTO']);
  $: canAlt = ALT_MODES.has(mavMode);
  $: canYaw = YAW_MODES.has(mavMode);

  async function goAlt(delta: number) {
    if (!canAlt) return;
    try { await setAltitude(Math.max(0, altitude + delta)); } catch {}
  }

  // ── Left panel (controlled by nav rail via logbookOpenStore) ─────────────
  $: panelOpen = $logbookOpenStore;

  // ── AGL mock (same as relative altitude for now) ──────────────────────────
  $: aglDisplay = altitude.toFixed(0);
  $: aglMin     = Math.max(0, altitude - 20).toFixed(0); // mock clearance

  onMount(() => {
    // Give Leaflet time to initialize, then force a resize so it fills the container
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 600);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 1200);
  });

  function fmtCoordLat(v: number) {
    const dir = v >= 0 ? 'N' : 'S';
    return `${dir} ${Math.abs(v).toFixed(5)}`;
  }
  function fmtCoordLng(v: number) {
    const dir = v >= 0 ? 'E' : 'W';
    return `${dir} ${Math.abs(v).toFixed(5)}`;
  }

  // Compass cardinal direction text
  $: hdgDir = (() => {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(heading / 22.5) % 16];
  })();

  // ── Time ─────────────────────────────────────────────────────────────────
  let clock = '--:--:--';
  onMount(() => {
    clock = new Date().toLocaleTimeString();
    setInterval(() => { clock = new Date().toLocaleTimeString(); }, 1000);
  });
</script>

<svelte:head><title>SidakGC — Cockpit</title></svelte:head>

<!-- ══════════════════════════════════════════════════════════════════
     COCKPIT — fills .kite-stage completely
════════════════════════════════════════════════════════════════════ -->
<div class="cockpit" on:click={handleOutsideClick}>

  <!-- ── MAP BACKGROUND — same Map component as mission-planner ──────── -->
  <div class="c-map">
    {#if view3D}
      <ThreeDMap />
    {:else}
      <Map {mavLocation} hideOverlay={false} showWaypoints={false} />
    {/if}
  </div>

  <!-- ══════════════════════════════════════════════════════════════
       LEFT PANEL — Flight Logbook (region 2)
  ═══════════════════════════════════════════════════════════════ -->
  {#if panelOpen}
  <div class="c-left-panel">
    <div class="lp-head">
      <span class="lp-title">Flight Logbook</span>
    </div>
    <div class="lp-body">
      <div class="lp-row"><span class="lp-k">Craft</span><span class="lp-v">Unnamed craft</span></div>
      <div class="lp-row"><span class="lp-k">Type</span><span class="lp-v">{mavType !== 'Unknown' ? mavType : 'Airplane'}</span></div>
      <div class="lp-row"><span class="lp-k">Pilot</span><span class="lp-v">—</span></div>
      <div class="lp-row"><span class="lp-k">Pilot ID</span><span class="lp-v">—</span></div>
      <div class="lp-sep"></div>
      <div class="lp-row"><span class="lp-k">Firmware</span><span class="lp-v lp-v-hi">{mavModel !== 'UNKNOWN' ? mavModel : 'ArduPlane 4.6.3'}</span></div>
      <div class="lp-row"><span class="lp-k">Protocol</span><span class="lp-v">MAVLink</span></div>
      <div class="lp-row"><span class="lp-k">Source</span><span class="lp-v">Live</span></div>
      <div class="lp-row"><span class="lp-k">Mission</span><span class="lp-v">{missionTitle || 'N/A'}</span></div>
      <div class="lp-row"><span class="lp-k">Battery</span><span class="lp-v">N/A</span></div>
      <div class="lp-row"><span class="lp-k">Date</span><span class="lp-v">{new Date().toLocaleDateString()}</span></div>
      <div class="lp-row"><span class="lp-k">Duration</span><span class="lp-v">0m 0s</span></div>
      <div class="lp-row"><span class="lp-k">Location</span><span class="lp-v">{fmtCoordLat(mavLocation.lat)}</span></div>
      <div class="lp-row"><span class="lp-k">Max Alt</span><span class="lp-v">{altDisplay} m</span></div>
      <div class="lp-row"><span class="lp-k">Max Speed</span><span class="lp-v">{speedKmh} km/h</span></div>
      <div class="lp-row"><span class="lp-k">Total Dist</span><span class="lp-v">{homeDist}</span></div>
      <div class="lp-row"><span class="lp-k">Max Dist</span><span class="lp-v">635 m</span></div>
      <div class="lp-row"><span class="lp-k">Battery Used</span><span class="lp-v">{battery !== null ? (100 - battery) + '%' : '—'}</span></div>
      <div class="lp-row"><span class="lp-k">Pack Packs</span><span class="lp-v">—</span></div>
      <div class="lp-row"><span class="lp-k">Weather</span><span class="lp-v">—</span></div>
      <div class="lp-row"><span class="lp-k">Notes</span><span class="lp-v"></span></div>
    </div>
  </div>
  {/if}

  <!-- ══════════════════════════════════════════════════════════════
       RIGHT DOCK — MODE · BAT · LINK (region 3)
  ═══════════════════════════════════════════════════════════════ -->
  <div class="c-right">

    

    


  </div>

  <!-- ══════════════════════════════════════════════════════════════
       BOTTOM DOCK — exact screenshot layout
       SPD | GPS | AHI circle | Compass circle | AGL graph | HOME | ALT | map-ctrl
  ═══════════════════════════════════════════════════════════════ -->
  <div class="c-bottom">

    <!-- SPD -->
    <div class="bw bw-spd">
      <span class="bw-lbl">SPD</span>
      <span class="bw-num">{speedKmh}</span>
      <span class="bw-unit">km/h</span>
    </div>

    <!-- GPS -->
    <div class="bw bw-gps">
      <span class="bw-lbl">GPS</span>
      <span class="bw-coord">S {Math.abs(mavLocation.lat).toFixed(5)}</span>
      <span class="bw-coord">E {Math.abs(mavLocation.lng).toFixed(5)}</span>
      <span class="bw-fix" style="color:{fixColor}">{sats.total} SAT · {fixType}</span>
      <span class="bw-hdop">HDOP {sats.hdop < 1 ? '·' : sats.hdop.toFixed(1)}</span>
    </div>

    <!-- AHI — attitude indicator circle (blue/gold horizon) -->
    <div class="bw bw-ahi">
      <svg viewBox="0 0 180 180" class="ahi-svg">
        <defs>
          <clipPath id="ahiClip"><circle cx="90" cy="90" r="82"/></clipPath>
        </defs>
        <!-- Outer bezel -->
        <circle cx="90" cy="90" r="86" fill="#0d1117" stroke="#475569" stroke-width="4"/>
        <!-- Sky / Ground — rotated by roll, shifted by pitch -->
        <g clip-path="url(#ahiClip)">
          <g style="transform-origin:90px 90px; transform:rotate({roll ?? 0}deg)">
            <!-- pitch offset: each degree ≈ 1.5px -->
            <g style="transform:translateY({($mavPitchStore ?? 0) * 1.5}px)">
              <!-- Sky -->
              <rect x="0" y="0" width="180" height="90" fill="#1e4a8a"/>
              <!-- Ground -->
              <rect x="0" y="90" width="180" height="90" fill="#8B5A00"/>
              <!-- Horizon line -->
              <line x1="0" y1="90" x2="180" y2="90" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
              <!-- Pitch ladder lines -->
              {#each [-20,-10,10,20] as p}
                <line x1="55" y1={90 - p*1.5} x2="125" y2={90 - p*1.5} stroke="#fff" stroke-width="0.8" opacity="0.5"/>
                <text x="128" y={90 - p*1.5 + 3} font-size="8" fill="#fff" opacity="0.6">{Math.abs(p)}</text>
              {/each}
            </g>
          </g>
        </g>
        <!-- Roll arc -->
        <path d="M 90 10 A 80 80 0 0 1 90 10" fill="none"/>
        {#each [-60,-45,-30,-20,-10,0,10,20,30,45,60] as t}
          {@const rad = (t - 90) * Math.PI / 180}
          {@const isMaj = t % 30 === 0}
          <line
            x1={90 + 76 * Math.cos(rad)} y1={90 + 76 * Math.sin(rad)}
            x2={90 + (76 - (isMaj?10:6)) * Math.cos(rad)} y2={90 + (76 - (isMaj?10:6)) * Math.sin(rad)}
            stroke="#94a3b8" stroke-width={isMaj?1.5:1}
          />
        {/each}
        <!-- Roll pointer (moves with aircraft roll) -->
        <g style="transform-origin:90px 90px; transform:rotate({roll ?? 0}deg)">
          <polygon points="90,14 86,22 94,22" fill="#f59e0b"/>
        </g>
        <!-- Fixed aircraft symbol -->
        <line x1="56" y1="90" x2="74" y2="90" stroke="#f59e0b" stroke-width="2.5"/>
        <line x1="106" y1="90" x2="124" y2="90" stroke="#f59e0b" stroke-width="2.5"/>
        <circle cx="90" cy="90" r="3" fill="#f59e0b"/>
        <line x1="90" y1="87" x2="90" y2="78" stroke="#f59e0b" stroke-width="2"/>
        <!-- Outer ring on top -->
        <circle cx="90" cy="90" r="82" fill="none" stroke="#334155" stroke-width="1"/>
      </svg>
    </div>

    <!-- Compass — separate black circular rose -->
    <div class="bw bw-cmp">
      <svg viewBox="0 0 180 180" class="cmp-svg">
        <defs>
          <clipPath id="cmpClip"><circle cx="90" cy="90" r="82"/></clipPath>
        </defs>
        <!-- Bezel -->
        <circle cx="90" cy="90" r="86" fill="#0d1117" stroke="#334155" stroke-width="4"/>
        <circle cx="90" cy="90" r="82" fill="#111827"/>
        <!-- Rotating rose -->
        <g style="transform-origin:90px 90px; transform:rotate({-heading}deg)">
          <!-- Degree ticks -->
          {#each Array.from({length:72}, (_,i) => i*5) as d}
            {@const r2 = (d - 90) * Math.PI / 180}
            {@const isMaj = d % 30 === 0}
            {@const isMed = d % 10 === 0}
            <line
              x1={90 + 76*Math.cos(r2)} y1={90 + 76*Math.sin(r2)}
              x2={90 + (76-(isMaj?12:isMed?8:4))*Math.cos(r2)} y2={90 + (76-(isMaj?12:isMed?8:4))*Math.sin(r2)}
              stroke={isMaj?'#64748b':'#334155'} stroke-width={isMaj?1.5:0.8}
            />
          {/each}
          <!-- Cardinals -->
          <text x="90" y="20"  text-anchor="middle" font-size="13" font-weight="700" fill="#ef4444">N</text>
          <text x="90" y="168" text-anchor="middle" font-size="11" fill="#94a3b8">S</text>
          <text x="168" y="94" text-anchor="middle" font-size="11" fill="#94a3b8">E</text>
          <text x="12"  y="94" text-anchor="middle" font-size="11" fill="#94a3b8">W</text>
        </g>
        <!-- Fixed heading pointer at top -->
        <polygon points="90,8 85,22 90,18 95,22" fill="#e2e8f0"/>
        <!-- Centre dot -->
        <circle cx="90" cy="90" r="4" fill="#60a5fa"/>
        <!-- Course line from centre to heading pointer -->
        <line x1="90" y1="90" x2="90" y2="22" stroke="#60a5fa" stroke-width="1" opacity="0.4"/>
      </svg>
      <!-- Heading badge below circle -->
      <div class="cmp-hdg">{heading.toFixed(0)}°</div>
      <div class="cmp-dir">{hdgDir}</div>
    </div>

    <!-- AGL terrain profile -->
    <div class="bw bw-agl">
      <div class="agl-hdr">
        <span class="agl-lbl">AGL</span>
        <span class="agl-val">{aglDisplay}</span>
        <span class="agl-unit-sm">m</span>
        <span class="agl-arrow">▶</span>
        <span class="agl-val">{aglMin}</span>
        <span class="agl-unit-sm">m</span>
      </div>
      <div class="agl-chart">
        <svg viewBox="0 0 300 72" preserveAspectRatio="none" class="agl-svg">
          <!-- Y grid lines -->
          <line x1="0" y1="12" x2="300" y2="12" stroke="#334155" stroke-width="0.5"/>
          <line x1="0" y1="36" x2="300" y2="36" stroke="#334155" stroke-width="0.5"/>
          <line x1="0" y1="60" x2="300" y2="60" stroke="#334155" stroke-width="0.5"/>
          <!-- Y labels -->
          <text x="2" y="11"  font-size="7" fill="#475569">0</text>
          <text x="2" y="35"  font-size="7" fill="#475569">-50</text>
          <text x="2" y="59"  font-size="7" fill="#475569">-100</text>
          <!-- Terrain filled polygon -->
          <polygon
            points="0,68 40,65 70,63 100,66 130,60 155,54 170,57 195,50 220,46 250,44 275,41 300,38 300,72 0,72"
            fill="#475569" opacity="0.5"/>
          <!-- Terrain outline -->
          <polyline
            points="0,68 40,65 70,63 100,66 130,60 155,54 170,57 195,50 220,46 250,44 275,41 300,38"
            fill="none" stroke="#64748b" stroke-width="1"/>
          <!-- Dashed horizontal flight-path line -->
          <line x1="0" y1="36" x2="300" y2="36"
            stroke="#60a5fa" stroke-width="1" stroke-dasharray="5,4" opacity="0.7"/>
          <!-- Aircraft vertical position line -->
          <line x1="150" y1="0" x2="150" y2="72"
            stroke="#60a5fa" stroke-width="0.8" stroke-dasharray="3,3" opacity="0.5"/>
          <!-- Aircraft dot (open circle + inner dot) -->
          <circle cx="150" cy="36" r="5" fill="none" stroke="#60a5fa" stroke-width="1.5"/>
          <circle cx="150" cy="36" r="2"  fill="#60a5fa"/>
          <!-- X labels -->
          <text x="3"   y="71" font-size="7" fill="#475569">0</text>
          <text x="100" y="71" font-size="7" fill="#475569">1000</text>
          <text x="224" y="71" font-size="7" fill="#475569">2000</text>
        </svg>
      </div>
    </div>

     <!-- BAT widget -->
    <div class="rd-widget">
      <div class="rd-label">BAT</div>
      <div class="rd-big" style="color:{battColor}">
        {voltage !== null ? voltage.toFixed(1) + 'V' : '--'}
      </div>
      <div class="rd-sub" style="color:{battColor}">
        {battery !== null ? battery + '%' : '--'}
      </div>
      <div class="rd-batt-track">
        <div class="rd-batt-fill" style="width:{battPct}%;background:{battColor}"></div>
      </div>
    </div>

    <!-- HOME -->
    <div class="bw bw-home">
      <span class="bw-lbl">HOME</span>
      <!-- Arrow pointing toward home (rotates relative to heading) -->
      <div class="home-arrow-wrap">
        {#if homeInfo}
          <svg viewBox="0 0 40 40" width="36" height="36"
            style="transform:rotate({(homeInfo.bearing - heading + 360) % 360}deg); transition:transform 0.4s ease">
            <polygon points="20,3 14,28 20,23 26,28" fill="#60a5fa"/>
          </svg>
        {:else}
          <svg viewBox="0 0 40 40" width="36" height="36">
            <polygon points="20,3 14,28 20,23 26,28" fill="#334155"/>
          </svg>
        {/if}
      </div>
      <span class="home-dist">{homeDist}</span>
      <span class="home-brg">{homeBrg}</span>
    </div>

    <!-- ALT -->
    <div class="bw bw-alt">
      <span class="bw-lbl">ALT</span>
      <span class="bw-num bw-num-alt">{altDisplay}</span>
      <span class="bw-unit">m</span>
      <span class="bw-vario">- 0.0 m/s</span>
    </div>

    <!-- Map controls column (2D/follow/+/−) -->
    <div class="bw bw-mc">
      <button class="mc2 {!view3D ? 'mc2-active' : ''}" on:click={toggleView3D}>{view3D ? '3D' : '2D'}</button>
      <button class="mc2 {followLabel !== 'Free' ? 'mc2-active' : ''}" on:click={cycleFollow}>
        <i class="fas fa-{followLabel === 'Hdg-up' ? 'location-crosshairs' : 'crosshairs'}"></i>
      </button>
      <button class="mc2" on:click={() => zoomBy(1)}>+</button>
      <button class="mc2" on:click={() => zoomBy(-1)}>−</button>
    </div>

  </div><!-- /c-bottom -->

  <!-- ══════════════════════════════════════════════════════════════
       OVERLAY PANELS — float over the map
  ═══════════════════════════════════════════════════════════════ -->

  <!-- TOP-LEFT: Stats panel -->
  <div class="ov-panel ov-stats">
    <div class="ov-head" on:click={() => statsOpen = !statsOpen}>
      <span class="ov-head-icon">🛈</span>
      <span class="ov-head-title">Stats</span>
      <i class="fas fa-chevron-{statsOpen ? 'up' : 'down'} ov-chevron"></i>
    </div>
    {#if statsOpen}
      <div class="ov-body ov-stats-body">
        <Stats />
      </div>
    {/if}
  </div>

  <!-- BOTTOM-RIGHT: Manual control panel -->
  <div class="ov-panel ov-manual">
    <div class="ov-head" on:click={() => manualOpen = !manualOpen}>
      <span class="ov-head-dot"></span>
      <span class="ov-head-title">Manual control</span>
      <i class="fas fa-minus ov-minimize" on:click|stopPropagation={() => manualOpen = false}></i>
    </div>
    {#if manualOpen}
      <div class="ov-body ov-manual-body">
        <!-- Alt nudge buttons -->
        <div class="mc-alt-row">
          <button class="mc-alt-btn" disabled={!canAlt} on:click={() => goAlt(10)}>▲ +10m</button>
          <button class="mc-alt-btn" disabled={!canAlt} on:click={() => goAlt(-10)}>▼ -10m</button>
        </div>
        <!-- DPad for lateral movement -->
        <div class="mc-dpad">
          <DPad />
        </div>
      </div>
    {/if}
  </div>

</div><!-- /cockpit -->

<style>
/* ── Cockpit root ─────────────────────────────────────────────────────────── */
.cockpit {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0d1117;
  font-family: 'Roboto', 'Segoe UI', monospace;
  color: #e2e8f0;
}

/* ── Map background ───────────────────────────────────────────────────────── */
.c-map {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
}

/* Every wrapper Leaflet/Map.svelte creates must fill the cockpit */
.c-map :global(.map-container) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0 !important;
  background: #0d1117 !important;
}
.c-map :global(#map),
.c-map :global(.leaflet-container) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0 !important;
  z-index: 0 !important;
}

/* Keep Map.svelte's OWN overlay buttons visible (fullscreen, lock, download, camera)
   so the map is fully usable as a background — hide only the top map-type toggle
   since we expose 2D/3D from our right dock */
.c-map :global(#map-toggle)              { display: none !important; }
/* Map action buttons — hidden on dashboard */
.c-map :global(.map-btn)              { display: none !important; }
.c-map :global(#location-display)    { display: none !important; }
.c-map :global(.cursor-grid-ref)     { display: none !important; }
.c-map :global(#map-toggle)          { display: none !important; }

/* ══════════════════════════════════════════════════════════════════════════
   LEFT PANEL
══════════════════════════════════════════════════════════════════════════ */
.c-left-panel {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 160px;
  background: rgba(13, 15, 20, 0.92);
  border-right: 1px solid #1e2530;
  z-index: 30;
  display: flex; flex-direction: column;
  backdrop-filter: blur(4px);
}
.lp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid #1e2530;
  font-size: 0.65rem; font-weight: 700; color: #94a3b8;
  letter-spacing: 0.06em;
}
.lp-body { flex: 1; overflow-y: auto; padding: 6px 8px; }
.lp-row { display: flex; justify-content: space-between; gap: 4px; margin-bottom: 2px; }
.lp-k   { font-size: 0.58rem; color: #475569; flex-shrink: 0; }
.lp-v   { font-size: 0.58rem; color: #94a3b8; font-weight: 500; text-align: right; word-break: break-all; }
.lp-v-hi { color: #60a5fa; }
.lp-sep { height: 1px; background: #1e2530; margin: 4px 0; }
.lp-title { font-size: 0.65rem; }

/* ══════════════════════════════════════════════════════════════════════════
   RIGHT DOCK
══════════════════════════════════════════════════════════════════════════ */
.c-right {
  position: absolute;
  top: 0; right: 0;
  bottom: 160px;
  width: 150px;
  z-index: 20;
  display: flex; flex-direction: column;
}

.rd-time-row {
  display: flex; justify-content: flex-end;
  padding: 4px 6px;
}
.rd-time-btn {
  font-size: 0.58rem; padding: 2px 8px; border-radius: 3px;
  background: transparent; border: 1px solid #334155; color: #64748b; cursor: pointer;
}
.rd-time-active { background: #1e3a5f; border-color: #3b82f6; color: #60a5fa; }

.rd-widget {
  flex: 1; padding: 8px 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}

.rd-label {
  font-size: 0.55rem; font-weight: 700; letter-spacing: 0.12em;
  color: #475569; align-self: flex-start; margin-bottom: 4px;
}

.rd-mode {
  font-size: 0.85rem; font-weight: 900; letter-spacing: 0.06em;
  padding: 6px 8px; border-radius: 4px; border: 1.5px solid;
  text-align: center; width: 100%;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;
}
.rd-mode:hover { filter: brightness(1.15); }
.rd-mode-chevron { font-size: 0.55rem; opacity: 0.7; }

/* Mode dropdown */
.mode-dropdown-wrap {
  position: relative;
  width: 100%;
}
.mode-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: #0d1117;
  border: 1px solid #334155;
  border-radius: 6px;
  z-index: 100;
  max-height: 220px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  display: flex; flex-direction: column;
}
.mode-item {
  padding: 6px 10px;
  font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em;
  text-align: left; cursor: pointer;
  background: transparent; border: none; color: #94a3b8;
}
.mode-item:hover { background: #1e2530; color: #e2e8f0; }
.mode-item-active { color: #22d3ee; background: #0c2a35; }

.rd-big  { font-size: 1.7rem; font-weight: 900; line-height: 1; }
.rd-sub  { font-size: 0.6rem; color: #475569; line-height: 1.4; }

.rd-batt-track {
  width: 100%; height: 4px; background: #1e2530;
  border-radius: 2px; margin-top: 5px; overflow: hidden;
}
.rd-batt-fill { height: 100%; border-radius: 2px; transition: width 0.4s; }

.rd-radar   { width: 100%; margin-top: 6px; }
.rd-radar-svg { width: 100%; height: auto; }

/* ══════════════════════════════════════════════════════════════════════════
   BOTTOM DOCK — exact image match
══════════════════════════════════════════════════════════════════════════ */
.c-bottom {
  position: absolute;
  left: 0; right: 0px; bottom: 0;
  height: 160px;
  z-index: 20;
  display: flex; flex-direction: row; align-items: stretch;
}

/* Base widget cell */
.bw {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 6px 10px; gap: 1px;
  flex-shrink: 0; position: relative; overflow: hidden;
}

.bw-lbl  { font-size: 0.52rem; font-weight: 700; letter-spacing: 0.12em; color: #475569; align-self: flex-start; }
.bw-num  { font-size: 2.4rem; font-weight: 900; line-height: 1; color: #e2e8f0; }
.bw-unit { font-size: 0.6rem; color: #475569; }

/* SPD */
.bw-spd { width: 68px; }

/* GPS */
.bw-gps { width: 110px; align-items: flex-start; }
.bw-coord { font-size: 0.62rem; font-weight: 600; color: #94a3b8; line-height: 1.45; }
.bw-fix   { font-size: 0.58rem; font-weight: 700; margin-top: 2px; line-height: 1.3; }
.bw-hdop  { font-size: 0.56rem; color: #475569; }

/* AHI circle */
.bw-ahi { width: 160px; padding: 4px; }
.ahi-svg { width: 152px; height: 152px; }

/* Compass circle */
.bw-cmp { width: 160px; padding: 2px 4px 0; }
.cmp-svg { width: 148px; height: 148px; }
.cmp-hdg {
  font-size: 0.85rem; font-weight: 800; color: #e2e8f0;
  line-height: 1; margin-top: 1px;
}
.cmp-dir { font-size: 0.58rem; color: #60a5fa; letter-spacing: 0.04em; }

/* AGL / terrain profile */
.bw-agl {
  flex: 1;
  min-width: 220px;
  align-items: flex-start;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: hidden;
}
.agl-hdr {
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-shrink: 0;
  width: 100%;
  margin-bottom: 3px;
}
.agl-lbl   { font-size: 0.52rem; font-weight: 700; letter-spacing: 0.12em; color: #475569; }
.agl-val   { font-size: 1.25rem; font-weight: 900; color: #e2e8f0; line-height: 1; }
.agl-unit-sm { font-size: 0.6rem; color: #475569; }
.agl-arrow { font-size: 0.7rem; color: #60a5fa; opacity: 0.8; }
.agl-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
}
.agl-svg {
  width: 100%;
  height: 100%;
  min-height: 60px;
  display: block;
  overflow: visible;
}

/* HOME */
.bw-home { width: 90px; }
.home-arrow-wrap { margin: 2px 0; }
.home-dist { font-size: 1.25rem; font-weight: 900; color: #e2e8f0; line-height: 1.1; }
.home-brg  { font-size: 0.62rem; color: #475569; }

/* ALT */
.bw-alt { width: 90px; }
.bw-num-alt { font-size: 2.1rem; }
.bw-vario { font-size: 0.62rem; color: #475569; margin-top: 1px; }

/* Map controls column */
.bw-mc {
  width: 38px; padding: 4px;
  display: flex; flex-direction: column; gap: 3px; justify-content: center;
  border-left: 1px solid #1e2530;
  border-right: none;
}
.mc2 {
  width: 30px; height: 28px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(13,15,20,0.8); border: 1px solid #334155;
  color: #64748b; cursor: pointer; font-size: 0.72rem; font-weight: 700;
}
.mc2:hover   { border-color: #60a5fa; color: #60a5fa; }
.mc2-active  { background: #1e3a5f; border-color: #3b82f6; color: #60a5fa; }

/* ══════════════════════════════════════════════════════════════════════════
   OVERLAY PANELS
══════════════════════════════════════════════════════════════════════════ */
.ov-panel {
  position: absolute;
  z-index: 30;
  background: rgba(13, 15, 20, 0.92);
  border: 1px solid #1e2530;
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(6px);
  min-width: 200px;
  max-width: 260px;
}

.ov-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid #1e2530;
  user-select: none;
}
.ov-head:hover { background: rgba(255,255,255,0.03); }
.ov-head-icon  { font-size: 0.75rem; }
.ov-head-title { font-size: 0.72rem; font-weight: 600; color: #e2e8f0; flex: 1; }
.ov-chevron    { font-size: 0.6rem; color: #64748b; }
.ov-head-dot   { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }
.ov-minimize   { font-size: 0.65rem; color: #64748b; cursor: pointer; padding: 2px; }
.ov-minimize:hover { color: #e2e8f0; }

/* Stats — top left */
.ov-stats { top: 8px; left: 8px; }
.ov-stats-body {
  max-height: 320px;
  overflow-y: auto;
}
/* Strip Stats.svelte's own background so it blends with the panel */
.ov-stats-body :global(.stats) {
  background: transparent !important;
  border-radius: 0 !important;
  padding: 6px !important;
}
/* Override Stats internal layout for narrow panel */
.ov-stats-body :global(.stats > div) {
  justify-content: flex-start !important;
}
.ov-stats-body :global(.grid.grid-cols-2) {
  grid-template-columns: 1fr !important;
}
.ov-stats-body :global(.button-container) {
  flex-wrap: wrap !important;
  gap: 4px !important;
  margin-top: 8px !important;
}
.ov-stats-body :global(.circular-button) {
  width: 2.4rem !important;
  height: 2.4rem !important;
  margin-inline: 2px !important;
  font-size: 0.75rem !important;
}
.ov-stats-body :global(.mode-list) {
  min-width: 170px !important;
}
.ov-stats-body :global(hr) {
  margin: 6px 0 !important;
}

/* Manual control — bottom right */
.ov-manual { bottom: 170px; right: 20px; min-width: 220px; max-width: 240px; }
.ov-manual-body { padding: 8px 10px; }

/* Direction grid */
.mc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 5px;
  margin-bottom: 8px;
}
.mc-arrow {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: #1a1f28;
  border: 1px solid #334155;
  color: #e2e8f0;
  font-size: 1rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  justify-self: center;
}
.mc-arrow:hover:not(:disabled) { background: #2a3548; border-color: #60a5fa; color: #60a5fa; }
.mc-arrow:disabled { opacity: 0.3; cursor: default; }

.mc-center { display: flex; align-items: center; justify-content: center; }
.mc-dir-btn {
  width: 50px; height: 50px;
  border-radius: 50%;
  background: #0f172a;
  border: 2px solid #334155;
  color: #94a3b8;
  font-size: 0.6rem; font-weight: 700;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  text-align: center;
}
.mc-dir-btn:hover { border-color: #60a5fa; color: #60a5fa; }

.mc-alt-row {
  display: flex; gap: 6px; margin-bottom: 8px;
}
.mc-alt-btn {
  flex: 1; padding: 5px; border-radius: 5px;
  background: #1a1f28; border: 1px solid #334155;
  color: #94a3b8; font-size: 0.65rem; font-weight: 600;
  cursor: pointer;
}
.mc-alt-btn:hover:not(:disabled) { border-color: #60a5fa; color: #60a5fa; }
.mc-alt-btn:disabled { opacity: 0.3; cursor: default; }

.mc-dpad { display: flex; justify-content: center; }
/* Make DPad fit inside the panel */
.mc-dpad :global(.dpad-container),
.mc-dpad :global(.circular-dpad) {
  transform: scale(0.85);
  transform-origin: top center;
}
</style>
