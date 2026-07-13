#!/usr/bin/env bash
# Smoke test the running OKClip server. Does not require API keys — it checks
# discovery + negotiation (pricing works without processing a video).
#
# Usage: BASE=http://localhost:3001 scripts/smoke.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3001}"

echo "1. health"
curl -fsS "$BASE/health" | grep -q '"status":"ok"' && echo "   ok"

echo "2. negotiate (probe may fail; base price still returned)"
curl -fsS -X POST "$BASE/api/negotiate" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"smoke","brief":{"url":"https://youtu.be/dQw4w9WgXcQ","prompt":"3 tiktok clips","clipCount":3}}' \
  | grep -q '"kind"' && echo "   ok"

echo "3. unknown job -> 404"
test "$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/api/jobs/none" || true)" = "404" && echo "   ok"

echo "smoke passed"
