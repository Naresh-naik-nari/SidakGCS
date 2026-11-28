<script lang="ts">
    import { onDestroy, onMount, afterUpdate } from 'svelte';
    import { mavlinkLogStore, mavStateStore } from '../../stores/mavlinkStore';
    import { darkModeStore, primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../../stores/customizationStore';
    import Modal from '../../components/Modal.svelte';
    import { get } from 'svelte/store';

    // ─── Stores ───────────────────────────────────────────────────────────────
    let rawLogs: string[] = get(mavlinkLogStore);
    let logContainer: HTMLElement;
    let searchTerm = '';
    let autoScroll = true;
    let systemState = get(mavStateStore);

    $: rawLogs    = $mavlinkLogStore;
    $: systemState = $mavStateStore;
    $: darkMode   = $darkModeStore;
    $: primaryColor   = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
    $: tertiaryColor  = $tertiaryColorStore;
    $: fontColor  = darkMode ? '#ffffff' : '#000000';

    // ─── Types ────────────────────────────────────────────────────────────────
    type Level = 'info' | 'success' | 'warning' | 'error' | 'debug';

    interface ParsedEntry {
        id:        number;
        time:      string;      // HH:MM:SS.mmm
        date:      string;      // YYYY-MM-DD
        type:      string;      // e.g. HEARTBEAT
        level:     Level;
        summary:   string;      // one-line human description
        fields:    { key: string; value: string }[];
        raw:       string;
        sysid:     number;
        compid:    number;
    }

    // ─── Visible message types (togglable) ───────────────────────────────────
    const ALWAYS_HIDDEN = new Set([
        'HEARTBEAT', 'MISSION_CURRENT', 'TIMESYNC', 'GPS_RAW_INT',
    ]);

    // Groups the user can toggle on
    const TOGGLE_GROUPS: { key: string; label: string; types: string[] }[] = [
        { key: 'position',  label: 'Position',   types: ['GLOBAL_POSITION_INT', 'LOCAL_POSITION_NED'] },
        { key: 'battery',   label: 'Battery',    types: ['BATTERY_STATUS', 'SYS_STATUS'] },
        { key: 'params',    label: 'Parameters', types: ['PARAM_VALUE'] },
        { key: 'attitude',  label: 'Attitude',   types: ['ATTITUDE', 'VFR_HUD'] },
    ];

    // Map: type → group key
    const typeToGroup: Record<string, string> = {};
    for (const g of TOGGLE_GROUPS) {
        for (const t of g.types) typeToGroup[t] = g.key;
    }

    // Which groups are currently visible
    let visible: Record<string, boolean> = {
        position: false,
        battery:  false,
        params:   false,
        attitude: false,
    };

    // ─── Log parsing ──────────────────────────────────────────────────────────

    /**
     * Raw format from server:
     *   MSG_NAME(magic)::ISO_TIMESTAMP::sysid=N,compid=N::{"field":"value",...}
     */
    function parseRaw(raw: string, id: number): ParsedEntry | null {
        const parts = raw.split('::');
        if (parts.length < 4) return null;

        const msgPart  = parts[0].trim();                   // HEARTBEAT(0)
        const tsPart   = parts[1].trim();                   // ISO timestamp
        const idPart   = parts[2].trim();                   // sysid=1,compid=1
        const dataPart = parts.slice(3).join('::').trim();  // JSON payload

        const type   = msgPart.split('(')[0].trim();
        const sysid  = parseInt(idPart.match(/sysid=(\d+)/)?.[1]  ?? '1');
        const compid = parseInt(idPart.match(/compid=(\d+)/)?.[1] ?? '1');

        let data: Record<string, unknown> = {};
        try { data = JSON.parse(dataPart); } catch { /* keep empty */ }

        // ── Timestamp ──────────────────────────────────────────────────────
        const ts   = new Date(tsPart);
        const pad  = (n: number, d = 2) => String(n).padStart(d, '0');
        const time = isNaN(ts.getTime())
            ? tsPart
            : `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}.${pad(ts.getMilliseconds(), 3)}`;
        const date = isNaN(ts.getTime()) ? '' : `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}`;

        // ── Fields (prettified key names) ──────────────────────────────────
        const keyLabels: Record<string, string> = {
            lat: 'Lat', lon: 'Lon', alt: 'Alt (m)', relativeAlt: 'Rel Alt (m)',
            hdg: 'Heading', vx: 'Vx', vy: 'Vy', vz: 'Vz',
            roll: 'Roll (°)', pitch: 'Pitch (°)', yaw: 'Yaw (°)',
            rollspeed: 'Roll Rate', pitchspeed: 'Pitch Rate', yawspeed: 'Yaw Rate',
            groundspeed: 'GndSpd (m/s)', airspeed: 'AirSpd (m/s)', throttle: 'Throttle (%)',
            climb: 'Climb (m/s)',
            voltages: 'Cell Voltages', batteryRemaining: 'Battery (%)',
            currentBattery: 'Current (A)', energyConsumed: 'Energy (mAh)',
            satellitesVisible: 'Sats', eph: 'HDOP', epv: 'VDOP',
            type: 'Vehicle Type', autopilot: 'Autopilot',
            baseMode: 'Base Mode', customMode: 'Flight Mode', systemStatus: 'Sys Status',
            command: 'Command', result: 'Result',
            severity: 'Severity', text: 'Text',
            paramId: 'Parameter', paramValue: 'Value', paramType: 'Type',
            paramCount: 'Count', paramIndex: 'Index',
            seq: 'Waypoint #',
            voltageBattery: 'Battery V (mV)', currentBattery2: 'Current (mA)',
            timeBootMs: 'Uptime (ms)',
        };

        const fields = Object.entries(data)
            .filter(([k]) => k !== 'timeBootMs')   // skip uptime noise by default
            .map(([k, v]) => ({
                key:   keyLabels[k] ?? k,
                value: formatValue(k, v, type),
            }));

        // ── Level & summary ────────────────────────────────────────────────
        const { level, summary } = describe(type, data);

        return { id, time, date, type, level, summary, fields, raw, sysid, compid };
    }

    function formatValue(key: string, v: unknown, msgType: string): string {
        if (v === null || v === undefined) return '—';

        // Lat/lon: stored as ×1e7 integers
        if ((key === 'lat' || key === 'lon') && typeof v === 'number') {
            return (v / 1e7).toFixed(7) + '°';
        }
        // relativeAlt / alt: stored as mm
        if ((key === 'alt' || key === 'relativeAlt') && typeof v === 'number') {
            return (v / 1000).toFixed(2) + ' m';
        }
        // Heading: stored as ×100 centidegrees
        if (key === 'hdg' && typeof v === 'number') {
            return (v / 100).toFixed(1) + '°';
        }
        // Roll/pitch/yaw: radians → degrees
        if (['roll', 'pitch', 'yaw'].includes(key) && typeof v === 'number') {
            return (v * 180 / Math.PI).toFixed(1) + '°';
        }
        // Velocity cm/s → m/s
        if (['vx','vy','vz'].includes(key) && typeof v === 'number') {
            return (v / 100).toFixed(2) + ' m/s';
        }
        // Cell voltages array
        if (key === 'voltages' && Array.isArray(v)) {
            const cells = (v as number[]).filter((x) => x !== 65535 && x > 0);
            if (cells.length === 0) return '—';
            return cells.map((c) => (c / 1000).toFixed(3) + ' V').join(', ');
        }
        // voltageBattery: mV → V
        if (key === 'voltageBattery' && typeof v === 'number') {
            return (v / 1000).toFixed(2) + ' V';
        }
        // currentBattery: 10×mA
        if (key === 'currentBattery' && typeof v === 'number' && v !== -1) {
            return (v / 100).toFixed(2) + ' A';
        }
        if (typeof v === 'number') return String(v);
        if (Array.isArray(v)) return JSON.stringify(v);
        return String(v);
    }

    // ─── Human summaries per message type ────────────────────────────────────
    function describe(type: string, d: Record<string, unknown>): { level: Level; summary: string } {
        const n = (k: string, def = 0) => typeof d[k] === 'number' ? d[k] as number : def;

        switch (type) {
            case 'HEARTBEAT': {
                const armed = (n('baseMode') & 128) !== 0;
                return { level: armed ? 'warning' : 'info', summary: armed ? 'Armed' : 'Disarmed' };
            }
            case 'GLOBAL_POSITION_INT': {
                const lat  = (n('lat') / 1e7).toFixed(5);
                const lon  = (n('lon') / 1e7).toFixed(5);
                const altM = (n('relativeAlt') / 1000).toFixed(1);
                const hdg  = (n('hdg') / 100).toFixed(0);
                return { level: 'info', summary: `${lat}°, ${lon}° · Alt ${altM} m · Hdg ${hdg}°` };
            }
            case 'GPS_RAW_INT': {
                const sats = n('satellitesVisible');
                const hdop = (n('eph') / 100).toFixed(2);
                return { level: sats < 6 ? 'warning' : 'success', summary: `${sats} satellites · HDOP ${hdop}` };
            }
            case 'ATTITUDE': {
                const r = (n('roll')  * 180 / Math.PI).toFixed(1);
                const p = (n('pitch') * 180 / Math.PI).toFixed(1);
                const y = (n('yaw')   * 180 / Math.PI).toFixed(1);
                return { level: 'debug', summary: `Roll ${r}° · Pitch ${p}° · Yaw ${y}°` };
            }
            case 'VFR_HUD': {
                const gs = n('groundspeed').toFixed(1);
                const alt = n('alt').toFixed(1);
                const thr = n('throttle');
                return { level: 'debug', summary: `Speed ${gs} m/s · Alt ${alt} m · Throttle ${thr}%` };
            }
            case 'SYS_STATUS': {
                const mv = n('voltageBattery');
                const pct = mv > 0 ? ` (${((mv - 3300 * 3) / ((4200 - 3300) * 3) * 100).toFixed(0)}%)` : '';
                return { level: 'info', summary: `Battery ${(mv / 1000).toFixed(2)} V${pct}` };
            }
            case 'BATTERY_STATUS': {
                const pct = n('batteryRemaining', -1);
                const cells = Array.isArray(d['voltages'])
                    ? (d['voltages'] as number[]).filter((x) => x !== 65535 && x > 0)
                    : [];
                const totalV = cells.length > 0
                    ? (cells.reduce((a, b) => a + b, 0) / 1000).toFixed(2)
                    : null;
                const pctStr = pct >= 0 ? `${pct}%` : (totalV ? `${totalV} V` : '?');
                return {
                    level: pct <= 20 && pct >= 0 ? 'error' : pct <= 50 && pct >= 0 ? 'warning' : 'info',
                    summary: `Battery ${pctStr}${totalV && pct >= 0 ? ` · ${totalV} V` : ''}`,
                };
            }
            case 'COMMAND_ACK': {
                const resultNames: Record<number, string> = {
                    0: 'Accepted', 1: 'Temp Rejected', 2: 'Denied',
                    3: 'Unsupported', 4: 'Failed', 5: 'In Progress',
                };
                const cmdNum  = n('command');
                const cmdNames: Record<number, string> = {
                    400: 'ARM/DISARM', 176: 'SET MODE', 511: 'SET MSG INTERVAL',
                    66: 'REQUEST STREAM', 179: 'DO SET RELAY', 183: 'DO SET SERVO',
                    20: 'NAV WAYPOINT', 21: 'NAV LOITER', 22: 'NAV RTL',
                };
                const cmdLabel = cmdNames[cmdNum] ?? `CMD ${cmdNum}`;
                const res = n('result');
                return {
                    level: res === 0 ? 'success' : res === 5 ? 'info' : 'error',
                    summary: `${cmdLabel} → ${resultNames[res] ?? `Result ${res}`}`,
                };
            }
            case 'STATUSTEXT': {
                const sev     = n('severity');
                const rawText = typeof d['text'] === 'string'
                    ? (d['text'] as string).replace(/\u0000/g, '').trim()
                    : '';
                return {
                    level: sev <= 3 ? 'error' : sev === 4 ? 'warning' : 'info',
                    summary: rawText || 'Status message',
                };
            }
            case 'PARAM_VALUE': {
                const id  = typeof d['paramId']    === 'string' ? (d['paramId'] as string).replace(/\u0000/g, '') : '?';
                const val = typeof d['paramValue'] === 'number' ? (d['paramValue'] as number).toString() : '?';
                return { level: 'debug', summary: `${id} = ${val}` };
            }
            case 'MISSION_CURRENT':
                return { level: 'info', summary: `Active waypoint #${n('seq')}` };
            case 'MISSION_ITEM_REACHED':
                return { level: 'success', summary: `Reached waypoint #${n('seq')}` };
            case 'MOUNT_STATUS': {
                const tilt = (n('pointingA') / 100).toFixed(1);
                const pan  = (n('pointingB') / 100).toFixed(1);
                return { level: 'debug', summary: `Gimbal tilt ${tilt}° · pan ${pan}°` };
            }
            default:
                return { level: 'info', summary: type };
        }
    }

    // ─── Reactive derived list ─────────────────────────────────────────────────
    let parsed: ParsedEntry[] = [];
    let counter = 0;

    $: {
        // Re-parse whenever rawLogs or visible toggles change.
        // We regenerate IDs from scratch each time (not ideal for perf, fine for 1 000 entries).
        counter = 0;
        parsed = rawLogs
            .map((r) => parseRaw(r, counter++))
            .filter((e): e is ParsedEntry => e !== null);
    }

    $: filtered = parsed.filter((e) => {
        if (ALWAYS_HIDDEN.has(e.type)) return false;
        const group = typeToGroup[e.type];
        if (group && !visible[group]) return false;
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
            e.type.toLowerCase().includes(q) ||
            e.summary.toLowerCase().includes(q) ||
            e.fields.some((f) => f.value.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
        );
    });

    // ─── UI state ─────────────────────────────────────────────────────────────
    let expandedId: number | null = null;
    function toggleExpand(id: number) {
        expandedId = expandedId === id ? null : id;
    }

    // ─── Heartbeat pulse ──────────────────────────────────────────────────────
    const heartbeatInfo = 'HEARTBEAT: autopilot presence and status signal (1 Hz).';
    $: if (rawLogs[rawLogs.length - 1]?.includes('HEARTBEAT')) pulseHeart();

    function pulseHeart() {
        if (typeof document === 'undefined') return;
        const icon = document.querySelector('.hb-icon');
        if (!icon) return;
        icon.classList.add('beating');
        setTimeout(() => icon.classList.remove('beating'), 800);
    }

    // ─── Auto-scroll ──────────────────────────────────────────────────────────
    afterUpdate(() => {
        if (autoScroll && logContainer) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });

    function onScroll() {
        if (!logContainer) return;
        const { scrollTop, scrollHeight, clientHeight } = logContainer;
        autoScroll = scrollHeight - scrollTop - clientHeight < 60;
    }

    // ─── Clear ────────────────────────────────────────────────────────────────
    function confirmClear() {
        const modal = new Modal({
            target: document.body,
            props: {
                title: 'Clear MAVLink Logs',
                content: 'Are you sure you want to clear all logs? This cannot be undone.',
                isOpen: true, confirmation: true, notification: false,
                onConfirm: () => {
                    mavlinkLogStore.set([]);
                    modal.$destroy();
                    new Modal({
                        target: document.body,
                        props: { title: 'Logs Cleared', content: 'All logs cleared.', isOpen: true, confirmation: false, notification: true },
                    });
                },
            },
        });
    }

    // ─── Download helpers ─────────────────────────────────────────────────────
    function downloadTXT() {
        const lines = filtered.map((e) =>
            `[${e.date} ${e.time}] ${e.type.padEnd(26)} ${e.summary}`
        );
        trigger(lines.join('\n'), 'text/plain', 'mavlink_logs.txt');
    }

    function downloadCSV() {
        const rows = [['timestamp', 'type', 'level', 'summary', 'sysid', 'compid', 'fields']];
        for (const e of filtered) {
            const fields = e.fields.map((f) => `${f.key}: ${f.value}`).join('; ');
            rows.push([`${e.date} ${e.time}`, e.type, e.level, `"${e.summary.replace(/"/g,'""')}"`, String(e.sysid), String(e.compid), `"${fields.replace(/"/g,'""')}"`]);
        }
        trigger(rows.map((r) => r.join(',')).join('\n'), 'text/csv', `mavlink_${stamp()}.csv`);
    }

    function downloadJSON() {
        const out = filtered.map(({ time, date, type, level, summary, fields, sysid, compid }) => ({
            timestamp: `${date}T${time}`, type, level, summary, sysid, compid,
            fields: Object.fromEntries(fields.map((f) => [f.key, f.value])),
        }));
        trigger(JSON.stringify(out, null, 2), 'application/json', `mavlink_${stamp()}.json`);
    }

    function trigger(content: string, mime: string, name: string) {
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([content], { type: mime })),
            download: name,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

    // ─── Level colours ────────────────────────────────────────────────────────
    const levelColor: Record<Level, string> = {
        success: '#4ade80',
        info:    '#60a5fa',
        warning: '#fbbf24',
        error:   '#f87171',
        debug:   '#94a3b8',
    };

    const typeColor: Record<string, string> = {
        COMMAND_ACK:      '#a78bfa',
        STATUSTEXT:       '#fb923c',
        MISSION_ITEM_REACHED: '#4ade80',
        BATTERY_STATUS:   '#fbbf24',
        SYS_STATUS:       '#fbbf24',
        GLOBAL_POSITION_INT: '#38bdf8',
        GPS_RAW_INT:      '#38bdf8',
        ATTITUDE:         '#94a3b8',
        VFR_HUD:          '#94a3b8',
        PARAM_VALUE:      '#c084fc',
        MOUNT_STATUS:     '#86efac',
    };

    function chipColor(type: string) {
        return typeColor[type] ?? '#64748b';
    }
</script>

<div class="dashboard-container h-full w-full flex items-stretch justify-center p-0">
    <div class="dashboard w-full gap-4 p-5 rounded-[20px] overflow-hidden h-full max-h-full"
        style="--primaryColor:{primaryColor};--secondaryColor:{secondaryColor};--tertiaryColor:{tertiaryColor};--fontColor:{fontColor};"
    >
        <div class="event-log rounded-2xl h-full flex flex-col p-5 gap-3">

            <!-- ── Header ───────────────────────────────────────────────── -->
            <div class="toolbar flex flex-wrap items-center gap-3">
                <h2 class="text-lg font-semibold mr-2">MAVLink Events</h2>

                <!-- Heartbeat indicator -->
                <div class="hb-wrap relative flex items-center gap-1 text-xs mr-2" title="{heartbeatInfo}">
                    <i class="fas fa-heart hb-icon"></i>
                    <span class="system-state-badge">{systemState}</span>
                </div>

                <!-- Search -->
                <input
                    class="search-input"
                    type="text"
                    placeholder="Search events…"
                    bind:value={searchTerm}
                />

                <!-- Group toggles -->
                <div class="toggles flex gap-2 flex-wrap">
                    {#each TOGGLE_GROUPS as g}
                        <label class="toggle-chip" class:active={visible[g.key]}>
                            <input type="checkbox" bind:checked={visible[g.key]} />
                            {g.label}
                        </label>
                    {/each}
                </div>

                <!-- Action buttons -->
                <div class="actions flex gap-2 ml-auto">
                    <button class="icon-btn red"    title="Clear logs"    on:click={confirmClear}>  <i class="fas fa-trash-alt"></i></button>
                    <button class="icon-btn blue"   title="Download TXT"  on:click={downloadTXT}>   <i class="fas fa-download"></i></button>
                    <button class="icon-btn green"  title="Export CSV"    on:click={downloadCSV}>   <i class="fas fa-file-csv"></i></button>
                    <button class="icon-btn purple" title="Export JSON"   on:click={downloadJSON}>  <i class="fas fa-file-code"></i></button>
                </div>
            </div>

            <!-- ── Count bar ─────────────────────────────────────────────── -->
            <div class="count-bar text-xs flex items-center gap-3">
                <span>{filtered.length} events</span>
                {#if !autoScroll}
                    <button class="scroll-btn" on:click={() => { autoScroll = true; logContainer.scrollTop = logContainer.scrollHeight; }}>
                        ↓ Jump to latest
                    </button>
                {/if}
            </div>

            <!-- ── Log table ─────────────────────────────────────────────── -->
            <div class="log-scroll" bind:this={logContainer} on:scroll={onScroll}>
                {#if filtered.length === 0}
                    <div class="empty">No events yet — connect to your flight controller.</div>
                {:else}
                    {#each filtered as entry (entry.id)}
                        <!-- Row -->
                        <button
                            class="log-row"
                            class:expanded={expandedId === entry.id}
                            on:click={() => toggleExpand(entry.id)}
                            aria-expanded={expandedId === entry.id}
                        >
                            <!-- Level dot -->
                            <span class="dot" style="background:{levelColor[entry.level]}"></span>

                            <!-- Time -->
                            <span class="col-time">{entry.time}</span>

                            <!-- Type chip -->
                            <span class="type-chip" style="background:{chipColor(entry.type)}22;color:{chipColor(entry.type)};border-color:{chipColor(entry.type)}44">
                                {entry.type}
                            </span>

                            <!-- Summary -->
                            <span class="col-summary">
                                {#if searchTerm}
                                    {@html entry.summary.replace(new RegExp(`(${searchTerm})`, 'gi'), '<mark>$1</mark>')}
                                {:else}
                                    {entry.summary}
                                {/if}
                            </span>

                            <!-- Expand chevron -->
                            <i class="fas fa-chevron-{expandedId === entry.id ? 'up' : 'down'} expand-icon"></i>
                        </button>

                        <!-- Detail panel -->
                        {#if expandedId === entry.id}
                            <div class="detail-panel">
                                <div class="detail-meta">
                                    <span class="meta-item"><i class="fas fa-calendar-alt"></i> {entry.date} {entry.time}</span>
                                    <span class="meta-item"><i class="fas fa-microchip"></i> sys {entry.sysid} · comp {entry.compid}</span>
                                </div>
                                {#if entry.fields.length > 0}
                                    <div class="fields-grid">
                                        {#each entry.fields as f}
                                            <span class="field-key">{f.key}</span>
                                            <span class="field-val">
                                                {#if searchTerm}
                                                    {@html f.value.replace(new RegExp(`(${searchTerm})`, 'gi'), '<mark>$1</mark>')}
                                                {:else}
                                                    {f.value}
                                                {/if}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                {/if}
            </div>

        </div>
    </div>
</div>


<style>
    /* ── Layout ─────────────────────────────────────────────────────────────── */
    .dashboard { background-color: var(--secondaryColor); }
    .event-log { background-color: var(--primaryColor); overflow: hidden; }

    /* ── Toolbar ─────────────────────────────────────────────────────────────── */
    .toolbar { flex-shrink: 0; }

    h2 { color: var(--fontColor); }

    .system-state-badge {
        font-size: 0.7rem;
        font-weight: 600;
        color: #4ade80;
        letter-spacing: 0.04em;
    }

    .hb-icon { font-size: 0.85rem; transition: color 0.2s; color: var(--fontColor); opacity: 0.5; }
    :global(.hb-icon.beating) { color: #f87171 !important; opacity: 1; }

    .search-input {
        background: var(--tertiaryColor);
        color: var(--fontColor);
        border: 1px solid #ffffff18;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 0.8rem;
        outline: none;
        min-width: 160px;
    }
    .search-input:focus { border-color: #60a5fa; }

    /* Toggle chips */
    .toggles { gap: 6px; }
    .toggle-chip {
        display: flex; align-items: center; gap: 5px;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 0.75rem;
        cursor: pointer;
        background: var(--tertiaryColor);
        color: var(--fontColor);
        border: 1px solid #ffffff14;
        user-select: none;
        transition: background 0.15s, border-color 0.15s;
    }
    .toggle-chip.active { background: #1e3a5f; border-color: #60a5fa; color: #93c5fd; }
    .toggle-chip input { display: none; }

    /* Action buttons */
    .icon-btn {
        width: 30px; height: 30px;
        border-radius: 7px;
        border: none; cursor: pointer;
        font-size: 0.8rem; color: #fff;
        display: flex; align-items: center; justify-content: center;
        transition: filter 0.15s;
    }
    .icon-btn:hover { filter: brightness(1.15); }
    .icon-btn.red    { background: #ef4444; }
    .icon-btn.blue   { background: #3b82f6; }
    .icon-btn.green  { background: #22c55e; }
    .icon-btn.purple { background: #8b5cf6; }

    /* ── Count bar ───────────────────────────────────────────────────────────── */
    .count-bar { flex-shrink: 0; color: var(--fontColor); opacity: 0.6; }
    .scroll-btn {
        background: #1e3a5f; color: #93c5fd;
        border: 1px solid #60a5fa;
        border-radius: 4px; padding: 1px 8px;
        font-size: 0.72rem; cursor: pointer;
    }

    /* ── Log scroll area ─────────────────────────────────────────────────────── */
    .log-scroll {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-right: 4px;
    }

    .empty {
        margin: auto;
        color: #64748b;
        font-size: 0.85rem;
        text-align: center;
        padding: 40px 0;
    }

    /* ── Log row ─────────────────────────────────────────────────────────────── */
    .log-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 10px;
        border-radius: 7px;
        background: var(--tertiaryColor);
        border: 1px solid transparent;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: border-color 0.1s, background 0.1s;
        min-height: 34px;
    }
    .log-row:hover { border-color: #ffffff18; }
    .log-row.expanded { border-color: #60a5fa44; background: #1e3a5f33; }

    .dot {
        flex-shrink: 0;
        width: 7px; height: 7px;
        border-radius: 50%;
    }

    .col-time {
        flex-shrink: 0;
        font-family: monospace;
        font-size: 0.72rem;
        color: #94a3b8;
        min-width: 94px;
    }

    .type-chip {
        flex-shrink: 0;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        padding: 2px 7px;
        border-radius: 4px;
        border: 1px solid;
        min-width: 60px;
        text-align: center;
        white-space: nowrap;
        font-family: monospace;
    }

    .col-summary {
        flex: 1;
        font-size: 0.8rem;
        color: var(--fontColor);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .expand-icon {
        flex-shrink: 0;
        font-size: 0.6rem;
        color: #64748b;
    }

    /* ── Detail panel ────────────────────────────────────────────────────────── */
    .detail-panel {
        background: var(--tertiaryColor);
        border: 1px solid #60a5fa22;
        border-top: none;
        border-radius: 0 0 7px 7px;
        padding: 8px 14px 10px;
        margin-top: -3px;
        margin-bottom: 2px;
    }

    .detail-meta {
        display: flex;
        gap: 16px;
        font-size: 0.7rem;
        color: #64748b;
        margin-bottom: 8px;
    }
    .meta-item { display: flex; align-items: center; gap: 4px; }

    .fields-grid {
        display: grid;
        grid-template-columns: minmax(100px, max-content) 1fr;
        gap: 2px 16px;
    }

    .field-key {
        font-size: 0.72rem;
        color: #94a3b8;
        white-space: nowrap;
        padding: 2px 0;
    }
    .field-val {
        font-size: 0.72rem;
        font-family: monospace;
        color: var(--fontColor);
        word-break: break-all;
        padding: 2px 0;
    }

    /* search highlight */
    :global(mark) {
        background: #fbbf2466;
        color: inherit;
        border-radius: 2px;
        padding: 0 1px;
    }

    /* ── Scrollbar ───────────────────────────────────────────────────────────── */
    .log-scroll::-webkit-scrollbar       { width: 5px; }
    .log-scroll::-webkit-scrollbar-track { background: transparent; }
    .log-scroll::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }

    /* ── Mobile ──────────────────────────────────────────────────────────────── */
    @media (max-width: 990px) {
        .dashboard { height: 100%; max-height: 95vh; border-radius: 0; }
        .col-time  { min-width: 72px; font-size: 0.65rem; }
        .type-chip { min-width: unset; font-size: 0.6rem; }
        .toolbar   { flex-direction: column; align-items: flex-start; }
        .actions   { margin-left: 0; }
    }
</style>
