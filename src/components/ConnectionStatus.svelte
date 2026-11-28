<script lang="ts">
    import {
        onlineStore, mavArmedStateStore, mavPendingArmStore, mavStateStore,
        mavTypeStore, mavModeStore, mavSpeedStore, mavAltitudeStore, mavBatteryStore,
        mavVoltageStore
    } from '../stores/mavlinkStore';
    import { darkModeStore, primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../stores/customizationStore';
    import { get } from 'svelte/store';
    import { sendCommand, writeParam, disconnect, getStatus, listPorts } from '$lib/api/mavlink';
    import ConnectionModal from './ConnectionModal.svelte';

    $: darkMode       = $darkModeStore;
    $: primaryColor   = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
    $: tertiaryColor  = $tertiaryColorStore;
    $: fontColor      = darkMode ? '#ffffff' : '#000000';

    $: isOnline  = $onlineStore;
    $: mavType   = $mavTypeStore;
    $: mavMode   = $mavModeStore;
    $: speed     = $mavSpeedStore;
    $: altitude  = $mavAltitudeStore;
    $: battery   = $mavBatteryStore;
    $: voltage   = $mavVoltageStore;
    $: sysState  = $mavStateStore;

    // Battery colour helper
    $: batteryColor = battery === null ? '#9ca3af'
        : battery < 20 ? '#ef4444'
        : battery < 50 ? '#f59e0b'
        : '#10b981';

    // Use pending state for immediate UI feedback, fall back to actual FC state
    $: isArmed = $mavPendingArmStore !== null ? $mavPendingArmStore : $mavArmedStateStore;

    // ── Connect / Disconnect ────────────────────────────────────────────────
    let showConnectModal = false;
    let isConnecting     = false;

    async function handleConnectClick() {
        if (isConnecting) return;
        if (isOnline) {
            isConnecting = true;
            try {
                await disconnect();
                onlineStore.set(false);
                if (typeof window !== 'undefined') window.location.reload();
            } catch (e) { console.warn('Disconnect failed:', e); }
            finally { isConnecting = false; }
        } else {
            showConnectModal = true;
        }
    }

    async function handlePortSelected(_cfg: unknown) {
        try {
            const d = await getStatus();
            onlineStore.set(d.portOpen || d.connected || d.online);
        } catch {}
    }

    // ── Arm / Disarm ────────────────────────────────────────────────────────
    let confirmStep = false;
    let confirmTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let isPending = false;

    function resetConfirm() {
        confirmStep = false;
        if (confirmTimeout) { clearTimeout(confirmTimeout); confirmTimeout = null; }
    }

    async function toggleArmed() {
        if (isPending) return;

        if (!confirmStep) {
            confirmStep = true;
            if (confirmTimeout) clearTimeout(confirmTimeout);
            confirmTimeout = setTimeout(resetConfirm, 3000);
            return;
        }

        resetConfirm();
        isPending = true;

        const actuallyArmed = get(mavArmedStateStore);
        const arming = !actuallyArmed;
        const param  = arming ? 1 : 0;

        mavPendingArmStore.set(arming);

        if (pendingTimeout) clearTimeout(pendingTimeout);
        pendingTimeout = setTimeout(() => {
            mavPendingArmStore.set(null);
            isPending = false;
        }, 5000);

        try {
            if (arming) {
                const state = get(mavStateStore);
                const onGround = state === 'STANDBY' || state === 'Unknown';
                if (onGround) {
                    await sendCommand('DO_SET_MODE', [1, 4], true);
                    await new Promise(r => setTimeout(r, 300));
                }
                await writeParam('ARMING_CHECK', 0, 6);
                await new Promise(r => setTimeout(r, 200));
            }

            await sendCommand('COMPONENT_ARM_DISARM', [param, 21196], true);

            if (arming) {
                await new Promise(r => setTimeout(r, 1000));
                writeParam('ARMING_CHECK', 1, 6);
            }
        } catch (error) {
            console.error(`❌ ARM/DISARM failed:`, error);
            mavPendingArmStore.set(null);
            isPending = false;
            if (pendingTimeout) clearTimeout(pendingTimeout);
        }
    }

    $: if ($mavPendingArmStore === null) isPending = false;
</script>

<div
    class="status-bar"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
    <!-- Connect / Disconnect button — always visible -->
    <button
        class="conn-btn {isOnline ? 'conn-btn-dc' : 'conn-btn-c'}"
        on:click={handleConnectClick}
        disabled={isConnecting}
        title={isOnline ? 'Disconnect MAVLink device' : 'Connect MAVLink device'}
    >
        <i class="fas {isConnecting ? 'fa-spinner fa-spin' : isOnline ? 'fa-plug-circle-xmark' : 'fa-plug'}"></i>
        {isConnecting ? '…' : isOnline ? 'Disconnect' : 'Connect'}
    </button>

    {#if isOnline}
        <div class="divider"></div>

        <!-- Arm group -->
        <div class="armed-group">
            <div class="pill {isArmed ? 'pill-red' : 'pill-gray'}">
                <i class="fas {isArmed ? 'fa-lock-open' : 'fa-lock'}"></i>
                <span>{isArmed ? 'ARMED' : 'DISARMED'}</span>
            </div>

            <button
                class="arm-btn {isPending ? 'arm-btn-pending' : confirmStep ? 'arm-btn-confirm' : isArmed ? 'arm-btn-disarm' : 'arm-btn-arm'}"
                on:click={toggleArmed}
                disabled={isPending}
                title={isPending ? 'Waiting for flight controller...' : confirmStep ? 'Click again to confirm' : isArmed ? 'Click to Disarm' : 'Click to Arm'}
            >
                {#if isPending}
                    <i class="fas fa-spinner fa-spin"></i> Waiting...
                {:else if confirmStep}
                    <i class="fas fa-exclamation-triangle"></i> Confirm {isArmed ? 'Disarm' : 'Arm'}?
                {:else if isArmed}
                    <i class="fas fa-lock"></i> Disarm
                {:else}
                    <i class="fas fa-lock-open"></i> Arm
                {/if}
            </button>
        </div>

        <!-- ── Stats telemetry pills (pushed to right) ── -->
        <div class="stats-pills">
            <div class="divider"></div>

            <div class="stat-item" title="Vehicle Type">
                <i class="fas fa-helicopter stat-icon"></i>
                <span class="stat-label">Type:</span>
                <span>{mavType}</span>
            </div>

            <div class="divider"></div>

            <div class="stat-item" title="System State">
                <i class="fas fa-circle stat-icon
                    {sysState === 'ACTIVE' ? 'text-green-400'
                    : sysState === 'CRITICAL' || sysState === 'EMERGENCY' ? 'text-red-400'
                    : 'text-gray-400'}"></i>
                <span class="stat-label">State:</span>
                <span>{sysState}</span>
            </div>

            <div class="divider"></div>

            <div class="stat-item" title="Flight Mode">
                <i class="fas fa-location-arrow stat-icon text-orange-400"></i>
                <span class="stat-label">Mode:</span>
                <span class="text-orange-400 font-semibold">{mavMode}</span>
            </div>

            <div class="divider"></div>

            <div class="stat-item" title="Speed">
                <i class="fas fa-tachometer-alt stat-icon"></i>
                <span class="stat-label">Spd:</span>
                <span>{speed.toFixed(1)} m/s</span>
            </div>

            <div class="divider"></div>

            <div class="stat-item" title="Altitude (relative)">
                <i class="fas fa-arrows-up-down stat-icon"></i>
                <span class="stat-label">Alt:</span>
                <span>{altitude.toFixed(1)} m</span>
            </div>

            <div class="divider"></div>

            <div class="stat-item" title="Battery">
                <i class="fas fa-battery-half stat-icon" style="color: {batteryColor}"></i>
                <span class="stat-label">Batt:</span>
                <span style="color: {batteryColor}">
                    {#if voltage !== null}{voltage.toFixed(1)}V{/if}{battery !== null ? ' ' + battery + '%' : '--'}
                </span>
            </div>
        </div>

    {:else}
        <div class="divider"></div>
        <span class="hint">Not connected — click Connect to link your MAVLink device</span>
    {/if}
</div>

<style>
    .status-bar {
        display: flex;
        align-items: center;
        gap: 0;
        height: 100%;
        width: 100%;
        background-color: var(--primaryColor);
        border-radius: 14px;
        padding: 0 1.2rem;
        color: var(--fontColor);
        overflow: hidden;
        box-sizing: border-box;
    }

    .pill {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .pill-red {
        background-color: rgba(239, 68, 68, 0.15);
        color: #ef4444;
    }

    .pill-gray {
        background-color: rgba(107, 114, 128, 0.15);
        color: var(--fontColor);
        opacity: 0.75;
    }

    .divider {
        width: 1px;
        height: 1.4rem;
        background-color: var(--tertiaryColor);
        margin: 0 0.8rem;
        flex-shrink: 0;
        opacity: 0.6;
    }

    .hint {
        font-size: 0.78rem;
        opacity: 0.5;
        font-style: italic;
    }

    /* armed group */
    .armed-group {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
    }

    .arm-btn {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.65rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
    }

    .arm-btn:disabled {
        cursor: not-allowed;
        opacity: 0.7;
    }

    /* Arm button — red */
    .arm-btn-arm {
        background-color: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.4);
    }
    .arm-btn-arm:hover {
        background-color: rgba(239, 68, 68, 0.3);
    }

    /* Disarm button — gray */
    .arm-btn-disarm {
        background-color: rgba(107, 114, 128, 0.15);
        color: var(--fontColor);
        opacity: 0.8;
        border-color: rgba(107, 114, 128, 0.3);
    }
    .arm-btn-disarm:hover {
        background-color: rgba(107, 114, 128, 0.3);
        opacity: 1;
    }

    /* Confirm step — amber, pulsing */
    .arm-btn-confirm {
        background-color: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
        border-color: rgba(245, 158, 11, 0.5);
        animation: pulse 0.6s ease-in-out infinite alternate;
    }

    /* Pending/waiting — blue */
    .arm-btn-pending {
        background-color: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
        border-color: rgba(59, 130, 246, 0.3);
    }

    @keyframes pulse {
        from { opacity: 0.7; }
        to   { opacity: 1;   }
    }

    /* ── Stats telemetry group ── */
    .stats-pills {
        display: flex;
        align-items: center;
        margin-left: auto; /* push to the right */
        flex-shrink: 1;
        overflow: hidden;
    }

    .stat-item {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.75rem;
        white-space: nowrap;
        color: var(--fontColor);
        padding: 0 0.1rem;
        flex-shrink: 0;
    }

    .stat-icon {
        font-size: 0.65rem;
        opacity: 0.6;
    }

    .stat-label {
        font-size: 0.65rem;
        opacity: 0.5;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    @media (max-width: 990px) {
        .status-bar {
            border-radius: 10px;
            padding: 0 0.75rem;
            overflow-x: auto;
        }
        .pill { font-size: 0.72rem; padding: 0.2rem 0.55rem; }
        .arm-btn { font-size: 0.68rem; }
        .stat-item { font-size: 0.68rem; }
    }

    /* ── Connect / Disconnect button ── */
    .conn-btn {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.2rem 0.7rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        border: 1px solid;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        margin-left: 0.4rem;
        transition: background-color 0.15s, color 0.15s;
    }
    .conn-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .conn-btn-c {
        background-color: rgba(37, 99, 235, 0.15);
        color: #60a5fa;
        border-color: rgba(37, 99, 235, 0.4);
    }
    .conn-btn-c:hover:not(:disabled) {
        background-color: rgba(37, 99, 235, 0.3);
    }

    .conn-btn-dc {
        background-color: rgba(239, 68, 68, 0.12);
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.35);
    }
    .conn-btn-dc:hover:not(:disabled) {
        background-color: rgba(239, 68, 68, 0.25);
    }
</style>

<ConnectionModal
    isOpen={showConnectModal}
    onClose={() => { showConnectModal = false; }}
    onConnect={handlePortSelected}
/>
