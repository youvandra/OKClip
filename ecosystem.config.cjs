// pm2 process config for OKClip.
// Single instance: the job queue and escrow state are in-memory.
module.exports = {
  apps: [
    {
      name: "okclip",
      cwd: "./backend",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
