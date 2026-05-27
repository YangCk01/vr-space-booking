const path = require('path')

const baseDir = path.resolve(__dirname)

module.exports = {
  apps: [
    {
      name: 'vr-space-api',
      script: './dist/server.js',
      cwd: baseDir,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      autorestart: true,
      max_memory_restart: '200M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: path.join(baseDir, 'logs/combined.log'),
      out_file: path.join(baseDir, 'logs/out.log'),
      error_file: path.join(baseDir, 'logs/error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist', 'prisma'],
      kill_timeout: 5000,
      listen_timeout: 8000,
    },
  ],
}
