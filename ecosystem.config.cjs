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
      // PORT and secrets come from backend/.env (loaded via dotenv), so the
      // port can differ per host without editing this file.
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
