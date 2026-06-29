module.exports = {
  apps: [
    {
      name: 'simix',
      script: 'dist/index.cjs',
      node_args: '--enable-source-maps',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
