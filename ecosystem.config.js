// PM2 cluster mode — load balancing across all CPU cores on a VPS/bare metal.
// Usage:  npx pm2 start ecosystem.config.js --env production
// Note: Render does NOT use PM2 (it runs `npm start` and load-balances /
// autoscales across instances itself — see render.yaml). Use this file only
// when self-hosting (VPS, Hetzner, DigitalOcean, ...).
module.exports = {
  apps: [
    {
      name: 'online-music',
      script: 'server.js',
      instances: process.env.PM2_INSTANCES || 'max', // one worker per CPU core
      exec_mode: 'cluster',                          // round-robin load balancing
      max_memory_restart: '512M',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
