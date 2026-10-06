// pm2 process file (production, phase D2). Start: pm2 start ecosystem.config.js
// Reload after a deploy: pm2 reload slsea-api
module.exports = {
  apps: [
    {
      name: 'slsea-api',
      script: 'src/server.js',
      cwd: __dirname,              // .env is read from here (src/config.js)
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,           // restart on crash
      max_memory_restart: '300M',
      kill_timeout: 5000,          // time for graceful shutdown (server.js)
      time: true,                  // timestamps in pm2 logs
      env: { NODE_ENV: 'production' },
    },
  ],
};
