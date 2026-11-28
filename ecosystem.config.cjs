/**
 * PM2 ecosystem config for Sidak GCS.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save         -- persist across reboots
 *   pm2 startup      -- generate OS startup hook (follow the printed command)
 *
 * Edit the env block below before first deploy.
 */
module.exports = {
  apps: [
    {
      name: 'sidak-gcs',
      script: 'build/index.js',

      // Restart automatically on crashes
      autorestart: true,
      watch: false,

      env: {
        NODE_ENV: 'production',

        // ── Server ────────────────────────────────────────────────────────
        // Port the HTTP server listens on
        PORT: '3000',

        // Full URL of this machine — required for session cookies.
        // Replace with your laptop/server LAN IP.
        ORIGIN: 'http://192.168.1.100:3000',

        // ── Database ──────────────────────────────────────────────────────
        DATABASE_URL: 'file:./src/data.db',

        // ── MAVLink / Serial ──────────────────────────────────────────────
        // Leave blank for auto-detection, or set e.g. COM3 / /dev/ttyACM0
        USB_SERIAL_PORT: '',
        USB_BAUD_RATE: '115200',
      },
    },
  ],
};
