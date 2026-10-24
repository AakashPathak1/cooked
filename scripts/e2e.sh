#!/usr/bin/env bash
# Starts a demo-mode dev server on :3100, runs the browser E2E, and stops it.
set -euo pipefail
cd "$(dirname "$0")/.."
COOKED_E2E=1 NEXT_PUBLIC_COOKED_E2E=1 NEXTAUTH_SECRET=e2e-secret NEXTAUTH_URL=http://localhost:3100 \
  setsid npx next dev -p 3100 > /tmp/cooked-e2e.log 2>&1 < /dev/null &
SERVER=$!
trap 'kill -- -$SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf localhost:3100/api/health > /dev/null && break; sleep 1; done
# Warm the routes so first-hit compilation in dev doesn't race the sign-in CSRF cookie.
for path in /signin /api/auth/session /api/auth/providers /api/auth/csrf /api/me /api/feed; do curl -s -o /dev/null "localhost:3100$path"; done
node scripts/e2e.cjs
