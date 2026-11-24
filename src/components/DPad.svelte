<script lang="ts">
  import { onDestroy } from 'svelte';
  import { mavModeStore, mavAltitudeStore } from '../stores/mavlinkStore';
  import { get } from 'svelte/store';
  import { primaryColorStore, tertiaryColorStore } from '../stores/customizationStore';
  import { setPositionLocal as apiSetPositionLocal } from '$lib/api/mavlink';

  let altitude: number = get(mavAltitudeStore);

  $: primaryColor = $primaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: mavMode = $mavModeStore;
  $: altitude = $mavAltitudeStore;

  /**
   * Modes that accept SET_POSITION_TARGET_LOCAL_NED with BODY_OFFSET_NED frame.
   * GUIDED: full GCS position control.
   * LOITER: accepts position offsets to nudge the hold point.
   */
  const MOVE_CAPABLE_MODES = new Set(['GUIDED', 'LOITER']);
  $: canMove = MOVE_CAPABLE_MODES.has(mavMode);

  // ── Hold-to-move + GUID_TIMEOUT keepalive ──────────────────────────────────
  // ArduPilot GUID_TIMEOUT defaults to 3 s — if no command arrives the vehicle
  // stops accepting position targets.  We re-send every KEEPALIVE_MS while the
  // button is held so the FC never times out during a sustained move.
  // Source: https://ardupilot.org/copter/docs/ac2_guidedmode.html
  const KEEPALIVE_MS = 2000; // well within the 3 s GUID_TIMEOUT default

  let holdInterval: ReturnType<typeof setInterval> | null = null;
  let activeDirection: string | null = null;

  /**
   * Sends a lateral position offset in the BODY_OFFSET_NED frame.
   * z is negated altitude (NED: down is positive) so we hold height while moving.
   * Does NOT auto-switch modes — that would silently override the pilot's mode.
   */
  async function moveLocal(x: number, y: number) {
    if (!canMove) {
      console.warn(`[DPad] Position commands only accepted in GUIDED or LOITER mode (current: ${mavMode})`);
      return;
    }
    try {
      await apiSetPositionLocal(x, y, -altitude);
    } catch (err) {
      console.error('[DPad] moveLocal failed:', err);
    }
  }

  /**
   * Called on pointerdown — fires immediately then repeats every KEEPALIVE_MS.
   * This keeps the FC's GUID_TIMEOUT from expiring during a sustained button hold.
   */
  function startHold(x: number, y: number, dir: string) {
    if (!canMove) return;
    activeDirection = dir;
    moveLocal(x, y); // fire immediately
    holdInterval = setInterval(() => moveLocal(x, y), KEEPALIVE_MS);
  }

  /** Called on pointerup / pointerleave — stops the keepalive interval. */
  function stopHold() {
    activeDirection = null;
    if (holdInterval !== null) {
      clearInterval(holdInterval);
      holdInterval = null;
    }
  }

  onDestroy(() => stopHold());
</script>

<div class="dpad-container relative flex items-center justify-center w-48 h-48">
  <nav class="d-pad relative" style="--tertiaryColor: {tertiaryColor}"
    title={canMove ? '' : `Switch to GUIDED or LOITER to use directional controls (current: ${mavMode})`}
  >
    <button class="up" class:holding={activeDirection === 'up'} disabled={!canMove}
      on:pointerdown={() => startHold(10, 0, 'up')}
      on:pointerup={stopHold}
      on:pointerleave={stopHold}
      on:click|preventDefault={() => {}}>
      <i class="fas fa-chevron-up"></i>
    </button>
    <button class="right" class:holding={activeDirection === 'right'} disabled={!canMove}
      on:pointerdown={() => startHold(0, 10, 'right')}
      on:pointerup={stopHold}
      on:pointerleave={stopHold}
      on:click|preventDefault={() => {}}>
      <i class="fas fa-chevron-right"></i>
    </button>
    <button class="down" class:holding={activeDirection === 'down'} disabled={!canMove}
      on:pointerdown={() => startHold(-10, 0, 'down')}
      on:pointerup={stopHold}
      on:pointerleave={stopHold}
      on:click|preventDefault={() => {}}>
      <i class="fas fa-chevron-down"></i>
    </button>
    <button class="left" class:holding={activeDirection === 'left'} disabled={!canMove}
      on:pointerdown={() => startHold(0, -10, 'left')}
      on:pointerup={stopHold}
      on:pointerleave={stopHold}
      on:click|preventDefault={() => {}}>
      <i class="fas fa-chevron-left"></i>
    </button>
    <div class="center-circle">
      <span class="move-text">{canMove ? (activeDirection ?? 'Move') : mavMode}</span>
    </div>
  </nav>
</div>

<style>
  .dpad-container {
    width: fit-content;
    margin: auto;
  }

  .d-pad {
    position: relative;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: var(--tertiaryColor);
    border: 4px solid var(--secondaryColor);
    overflow: hidden;
  }

  .up, .down, .left, .right {
    width: 30%;
    height: 30%;
    transform: translate(-50%) rotate(45deg);
  }

  .d-pad button {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #ffffff;
    font-size: 24px;
    transition: all 0.2s ease;
  }

  .d-pad button i {
    transform: rotate(-45deg);
  }

  .d-pad button.up {
    top: 0;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .d-pad button.right {
    top: 50%;
    right: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  .d-pad button.down {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .d-pad button.left {
    top: 50%;
    left: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  .d-pad button:hover.up {
    top: -5px;
  }

  .d-pad button:hover.right {
    right: -5px;
  }

  .d-pad button:hover.down {
    bottom: -5px;
  }

  .d-pad button:hover.left {
    left: -5px;
  }

  .d-pad button:hover {
    color: #4e94f7;
  }

  .d-pad button.holding {
    color: #4ade80;
    opacity: 1;
  }

  .center-circle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60px;
    height: 60px;
    background-color: var(--primaryColor);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .move-text {
    font-size: 10pt;
    color: var(--fontColor);
  }
  
  /* Mobile Styles */
  @media (max-width: 990px) {
    .dpad-container {
      width: auto;
    }

    .d-pad {
      width: 150px;
      height: 150px;
    }

    .d-pad button {
      font-size: 20px;
    }

    .center-circle {
      width: 50px;
      height: 50px;
    }

    .move-text {
      font-size: 1rem;
    }
  }
</style>
