<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { page } from '$app/stores';
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { goto } from '$app/navigation';
  import '../app.css';
  import {
    onlineStore,
    mavBatteryStore,
    mavArmedStateStore,
    mavSatelliteStore,
    mavModeStore,
    mavStateStore,
    mavModelStore,
    mavTypeStore,
  } from '../stores/mavlinkStore';
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    missionCountStore,
    missionCompleteStore
  } from '../stores/missionPlanStore';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore,
    audoNotificationStore
  } from '../stores/customizationStore';
  import { loggedInStore } from '../stores/authStore';
  import { get } from 'svelte/store';
  import { mavlinkLogStore } from '../stores/mavlinkStore';
  import Notification from '../components/Notification.svelte';
  import ConnectionModal from '../components/ConnectionModal.svelte';
  import ConnectionStatus from '../components/ConnectionStatus.svelte';
  import { mapTypeStore } from '../stores/mapStore';
  import { logbookOpenStore } from '../stores/uiStore';
  import { buildMessageHandlers, processLogLine } from '$lib/mavlink/parser';
  import { showNotification } from '$lib/utils/notifications';
  import type { NotificationConfig } from '$lib/utils/notifications';
  import { disconnect as mavDisconnect, getStatus, heartbeat as mavHeartbeat, loadMission as mavLoadMission, requestParams } from '$lib/api/mavlink';
  import { listMissions } from '$lib/api/mission';

  let showPortModal = false;

  let currentPath = '';
  let heightOfDashboard = 1000;
  let logs: string[] = [];
  let online = get(onlineStore);
  let serialConnected = false;
  let serialConnecting = false;

  // RTLL guard — mutable object so parser mutations are reflected here
  const rtllState = { triggered: false };

  // Pre-build the handler map once; it's bound to rtllState and showNotification
  const messageHandlers = buildMessageHandlers({ showNotification, rtllState });

  async function toggleSerialConnection() {
    if (serialConnecting) return;
    if (serialConnected) {
      serialConnecting = true;
      try {
        await mavDisconnect();
        serialConnected = false;
        window.location.reload();
      } catch (e) {
        console.warn('Disconnect failed:', e);
      } finally {
        serialConnecting = false;
      }
    } else {
      showPortModal = true;
    }
  }

  async function handlePortSelected(_config: unknown) {
    await syncSerialStatus();
  }

  async function syncSerialStatus() {
    try {
      const data = await getStatus();
      serialConnected = data.portOpen || data.connected || data.online;
      onlineStore.set(serialConnected);
    } catch { /* ignore */ }
  }

  let statusCheckInterval: ReturnType<typeof setInterval>;
  let loggedIn = get(loggedInStore);

  const batteryAlerts = [50, 20, 15, 10, 5];
  let batteryAlertIndex = 0;
  let batteryAlertShown = false;

  $: loggedIn = $loggedInStore;
  $: battery = $mavBatteryStore;
  $: online = $onlineStore;
  $: audioNotification = $audoNotificationStore;
  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';
  $: currentPath = $page.url.pathname;
  $: isAuthRoute = currentPath === '/' || currentPath === '/login' || currentPath === '/register';
  $: missionCountStore.set(Object.keys($missionPlanActionsStore).length - 1);

  // Telemetry for the top bar
  $: sats = $mavSatelliteStore;
  $: mavMode = $mavModeStore;
  $: sysState = $mavStateStore;
  $: mavModel = $mavModelStore;
  $: mavType = $mavTypeStore;

  // Battery colour helper
  $: batteryColor = battery === null ? '#9ca3af'
    : battery < 20 ? '#ef4444'
    : battery < 50 ? '#f59e0b'
    : '#22c55e';
  $: batteryWidth = battery === null ? 0 : Math.max(0, Math.min(100, battery));

  // Sensor tile states — derived from real telemetry we actually receive
  $: gpsTile = sats.total >= 6 && sats.hdop < 2 ? 'ok'
    : sats.total >= 3 ? 'warn' : 'fault';
  $: imuTile = online ? 'ok' : 'off';
  $: magTile = online ? 'ok' : 'off';
  $: baroTile = online ? 'ok' : 'off';
  $: battTile = battery === null ? 'off'
    : battery < 20 ? 'fault'
    : battery < 50 ? 'warn' : 'ok';
  $: linkTile = online ? 'ok' : 'fault';

  // Flight-mode badge colour (Kite-style category colours)
  $: modeColor = (() => {
    const m = (mavMode || '').toUpperCase();
    if (m.includes('RTL') || m.includes('RETURN')) return '#8b5cf6';
    if (m.includes('LAND')) return '#f97316';
    if (m.includes('TAKEOFF') || m.includes('LAUNCH')) return '#d946ef';
    if (m.includes('GUIDED')) return '#3b82f6';
    if (m.includes('AUTO') || m.includes('MISSION')) return '#3b82f6';
    if (m.includes('LOITER') || m.includes('CRUISE')) return '#f97316';
    if (m.includes('STAB') || m.includes('ANGLE')) return '#22c55e';
    if (m.includes('ALTHOLD') || m.includes('ALT')) return '#eab308';
    if (m.includes('POSHOLD') || m.includes('HOLD')) return '#14b8a6';
    if (m.includes('FAILSAFE') || m.includes('FS')) return '#ef4444';
    if (m.includes('MANUAL')) return '#9ca3af';
    if (m.includes('ACRO')) return '#d1d5db';
    return '#9ca3af';
  })();

  // Battery threshold notifications
  $: if (battery && battery <= batteryAlerts[batteryAlertIndex] && !batteryAlertShown) {
    showNotification({
      title: 'Low Battery Alert',
      content: `Battery level is at ${battery}%. It's highly recommended to return to home or land immediately to prevent a crash.`,
      type: battery <= 20 ? 'error' : 'warning',
    });
    batteryAlertIndex++;
    batteryAlertShown = true;
  } else if (battery && battery > batteryAlerts[batteryAlertIndex]) {
    batteryAlertShown = false;
  }

  function updateDashboardHeight() {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      heightOfDashboard = dashboard.clientHeight;
      if (window.location.pathname !== '/') {
        heightOfDashboard = dashboard.clientHeight;
        if (window.location.pathname !== '/dashboard') heightOfDashboard += 1;
        const nav = document.querySelector('.desktop-nav') as HTMLElement | null;
        if (nav) nav.style.opacity = '1';
        (dashboard as HTMLElement).style.opacity = '1';
      }
    }
  }

  let resizeObserver: ResizeObserver;

  async function checkOnlineStatus() {
    try {
      const data = await mavHeartbeat();
      data.logs.forEach((log: string) => {
        processLogLine(log.replace(/\\"/g, '"') + '\n', logs, messageHandlers, mavlinkLogStore);
      });
      const isConnected = data.portOpen || data.online;
      onlineStore.set(isConnected);
      serialConnected = isConnected;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[layout] checkOnlineStatus:', msg);
      onlineStore.set(false);
      serialConnected = false;
    }
  }

  async function checkLoadedMission() {
    try {
      const records = await listMissions();
      if (records.length > 0) {
        const loadedMission = records.find((m: { isLoaded: number }) => m.isLoaded === 1);
        if (loadedMission) {
          // Restore UI state from DB -- do NOT auto-upload to FC on page load.
          // Auto-uploading causes a 500 error when the page loads without FC connected.
          // FC upload only happens when user explicitly clicks Save & Load Mission.
          missionPlanTitleStore.set(loadedMission.title);
          missionPlanActionsStore.set(JSON.parse(loadedMission.actions));
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('The request was autocancelled')) return;
      console.error('[layout] checkLoadedMission:', error);
    }
  }

  async function requestParameters() {
    try {
      await requestParams();
    } catch (err: unknown) {
      console.error('[layout] requestParameters failed:', err instanceof Error ? err.message : err);
    }
  }

  onMount(async () => {
    const bg = document.querySelector('.bg') as HTMLElement | null;
    if (bg) bg.style.background = '#0a0a0f';
    document.body.classList.toggle('dark-mode', darkMode);

    syncSerialStatus();
    setInterval(syncSerialStatus, 3000);

    setTimeout(() => {
      checkLoadedMission();
      let paramRequestInterval = setInterval(async () => {
        if (get(onlineStore)) {
          clearInterval(paramRequestInterval);
          await requestParameters();
          console.log('📋 PARAM_REQUEST_LIST sent after connection confirmed');
        }
      }, 3000);
      setTimeout(() => clearInterval(paramRequestInterval), 120000);
    }, 2000);

    let checkCookieInterval = setInterval(() => {
      const lastActivity = parseInt(
        document.cookie.replace(/(?:(?:^|.*;\s*)lastActivity\s*=\s*([^;]*).*$)|^.*$/, '$1')
      );
      if (Date.now() - lastActivity > 600000) {
        clearInterval(checkCookieInterval);
        loggedInStore.set(false);
        handleLogout();
      } else {
        loggedInStore.set(true);
      }
    }, 1000);

    window.addEventListener('mousemove', refreshCookie);
    window.addEventListener('keydown', refreshCookie);
    window.addEventListener('click', refreshCookie);
    window.addEventListener('scroll', refreshCookie);

    statusCheckInterval = setInterval(checkOnlineStatus, 1100);

    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      resizeObserver = new ResizeObserver(updateDashboardHeight);
      resizeObserver.observe(dashboard);
    }
    updateDashboardHeight();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    clearInterval(statusCheckInterval);
  });

  afterUpdate(() => {
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(updateDashboardHeight);
      resizeObserver.observe(dashboard);
    }
  });

  function refreshCookie() {
    if (loggedIn) document.cookie = 'lastActivity=' + Date.now();
  }

  async function handleLogout() {
    if (serialConnected) {
      try { await mavDisconnect(); } catch { /* ignore */ }
    }
    loggedInStore.set(false);
    document.cookie = 'lastActivity=' + Date.UTC(1970);
    if (!window.location.pathname.includes('register')) goto('/login');
  }

  function handleNavigation(path: string, target = '') {
    if (target === '_blank') window.open(path, target);
    else if (currentPath !== path) goto(path);
  }

  let isNavOpen = false;
  function toggleNav() { isNavOpen = !isNavOpen; }

  function toggleDarkMode() {
    const map = document.getElementById('map');
    darkMode = !darkMode;
    darkModeStore.set(darkMode);
    document.body.classList.toggle('dark-mode', darkMode);
    if (darkMode) {
      if (map && get(mapTypeStore) !== 'Satellite') map.classList.add('dark');
      const bg = document.querySelector('.bg') as HTMLElement | null;
      if (bg) bg.style.background = "url('bg-map.webp') no-repeat center center fixed";
      primaryColorStore.set('#1c1c1e');
      secondaryColorStore.set('#121212');
      tertiaryColorStore.set('#2d2d2d');
    } else {
      if (map) map.classList.remove('dark');
      const bg = document.querySelector('.bg') as HTMLElement | null;
      if (bg) bg.style.background = "url('bg-map-light.webp') no-repeat center center fixed";
      primaryColorStore.set('#f0f4f8');
      secondaryColorStore.set('#dce4ef');
      tertiaryColorStore.set('#b8c8dc');
    }
  }

  function toggleAudioNotifications() {
    audioNotification = !audioNotification;
    audoNotificationStore.set(audioNotification);
  }
</script>

<div class="bg fixed w-full h-full"></div>

{#if isAuthRoute}
  <!-- Auth routes: no cockpit chrome -->
  <main class="bg-black flex overflow-auto"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
  >
    <div class="bg-[#0000001f] flex w-full h-full z-10 justify-center items-center">
      <slot />
    </div>
  </main>
{:else}
  <!-- Kite cockpit shell -->
  <div class="kite-app"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
  >
    <!-- ── STATUS BAR — top ──────────────────────────────────────────────── -->
    {#if loggedIn}
      <div class="kite-statusbar">
        <ConnectionStatus />
      </div>
    {/if}

    <!-- ── BODY: nav rail + page stage ──────────────────────────────────── -->
    <div class="kite-body">
      <!-- Navigation rail (persistent across app routes) -->
      {#if loggedIn}
        <nav class="kite-rail">
          <div class="rail-logo">
            <a href="/dashboard" on:click|preventDefault={() => handleNavigation('/dashboard')} title="Dashboard">
              <img src="/logo.png" alt="Logo">
            </a>
          </div>
          <div class="rail-sep"></div>
          <a href="/dashboard" class="rail-btn {currentPath === '/dashboard' ? 'active' : ''}" on:click|preventDefault={() => handleNavigation('/dashboard')}>
            <i class="fas fa-tachometer-alt"></i>
            <span class="rail-tip">Dashboard</span>
          </a>
          <a href="/mission-planner" class="rail-btn {currentPath === '/mission-planner' ? 'active' : ''}" on:click|preventDefault={() => handleNavigation('/mission-planner')}>
            <i class="fas fa-route"></i>
            <span class="rail-tip">Mission</span>
          </a>
          <a href="/gimbal" class="rail-btn {currentPath === '/gimbal' ? 'active' : ''}" on:click|preventDefault={() => handleNavigation('/gimbal')}>
            <i class="fas fa-video"></i>
            <span class="rail-tip">Video</span>
          </a>
          <a href="/event-log" class="rail-btn {currentPath === '/event-log' ? 'active' : ''}" on:click|preventDefault={() => handleNavigation('/event-log')}>
            <i class="fas fa-bars-staggered"></i>
            <span class="rail-tip">Logbook</span>
          </a>
          <a href="/parameters" class="rail-btn {currentPath === '/parameters' ? 'active' : ''}" on:click|preventDefault={() => handleNavigation('/parameters')}>
            <i class="fas fa-sliders"></i>
            <span class="rail-tip">Parameters</span>
          </a>
          <div class="rail-sep"></div>
          <div class="rail-spacer"></div>
          <div class="rail-sep"></div>
          <button class="rail-btn" on:click={toggleDarkMode} title="{darkMode ? 'Light mode' : 'Dark mode'}">
            <i class="fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
            <span class="rail-tip">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button class="rail-btn" on:click={toggleAudioNotifications} title="{audioNotification ? 'Mute audio' : 'Unmute audio'}">
            <i class="fas {audioNotification ? 'fa-volume-up' : 'fa-volume-mute'}"></i>
            <span class="rail-tip">{audioNotification ? 'Mute Audio' : 'Unmute Audio'}</span>
          </button>
          <div class="rail-sep"></div>
          <button class="rail-btn rail-btn-logout" on:click|preventDefault={handleLogout} title="Logout">
            <i class="fas fa-sign-out-alt"></i>
            <span class="rail-tip rail-tip-right">Logout</span>
          </button>
        </nav>
      {/if}

      <!-- Page stage -->
      <div class="kite-page">
        <slot />
      </div>
    </div>
  </div>
{/if}

<ConnectionModal
  isOpen={showPortModal}
  onClose={() => { showPortModal = false; }}
  onConnect={handlePortSelected}
/>

<style>
  .bg {
    background: url('bg-map.webp') no-repeat center center fixed;
    background-size: cover !important;
    margin: 0;
    filter: blur(2px);
  }

  /* ── Shell layout ──────────────────────────────────────────────── */
  :global(.kite-app) {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0d1117;
    font-family: 'Roboto', 'Segoe UI', sans-serif;
    color: #e2e8f0;
  }

  :global(.kite-body) {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  :global(.kite-page) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
    /* Ensure child cockpit fills every pixel */
    display: flex;
    flex-direction: column;
  }

  /* Dashboard cockpit child must fill kite-page */
  :global(.kite-page > .cockpit) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* ── Rail extras ───────────────────────────────────────────────── */
  :global(.rail-spacer) {
    flex: 1;          /* pushes everything below it to the bottom */
  }

  :global(.rail-btn-logout) {
    color: #64748b !important;
  }
  :global(.rail-btn-logout:hover) {
    color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.1) !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }

  /* Tooltip for the logout sits to the right, same as other rail tooltips */
  :global(.rail-tip-right) {
    white-space: nowrap;
  }
</style>
