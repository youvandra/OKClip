#!/usr/bin/env bash
# pm2 fork wrapper breaks the import.meta.url === argv[1] entry guard in
# asp-agent.js (main() never runs). exec node directly so argv is clean.
export ASP_HEALTH_PORT="${ASP_HEALTH_PORT:-3010}"
export ONCHAINOS_BIN="${ONCHAINOS_BIN:-/home/ubuntu/.local/bin/onchainos}"
export PATH="/home/ubuntu/.local/bin:$PATH"
exec node /home/ubuntu/okclip/backend/dist/asp-agent.js
