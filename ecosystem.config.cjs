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
      exec_mode: "fork",
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
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        ONCHAINOS_BIN: "/home/ubuntu/.local/bin/onchainos",
        OKCLIP_AGENT_ID: "5189",
        ASP_HEALTH_PORT: "3003",
        // ASP_ALLOWED_CLIENT is intentionally unset — the agent serves all
        // clients. Set to an agent ID only during local testing.
        // ASP_ALLOWED_CLIENT: "",
      },
    },
  ],
};
