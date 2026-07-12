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
    {
      // The live A2A agent: polls the OKX task state machine and drives
      // apply -> run engine -> deliver. Needs the onchainos CLI + a logged-in
      // wallet + a reachable A2A gateway on the host.
      name: "okclip-asp",
      cwd: "./backend",
      script: "dist/asp-agent.js",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        ONCHAINOS_BIN: "/home/ubuntu/.local/bin/onchainos",
        OKCLIP_AGENT_ID: "5189",
        // Safety: only act on our own test client until deliver is proven
        // end-to-end. Unset (or remove) to serve all clients.
        ASP_ALLOWED_CLIENT: "5211",
      },
    },
  ],
};
