// §13 D1: pm2 process file (one process, §7.11)
module.exports = {
  apps: [
    {
      name: 'slsea-api',
      script: 'src/server.js',
      node_args: '--env-file=.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],
};
