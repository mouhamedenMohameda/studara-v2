module.exports = {
  apps: [
    {
      name: 'studara-api',
      cwd: '/var/www/studara/api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

