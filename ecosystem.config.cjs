// §13 D1: pm2 process file (one process, §7.11)
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'slsea-api',
      script: 'src/server.js',
      cwd: __dirname,
      node_args: ['--env-file=' + path.join(__dirname, '.env')],
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],
};
