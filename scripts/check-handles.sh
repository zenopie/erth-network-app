#!/usr/bin/env bash
#
# Runs the handle directory reader (src/chain/handles.js: whole-directory
# paging, restarts, order and size checks, the chain cross-check before a
# payment, never a per-handle URL), paying a handle by MsgShield, and the dex
# deposit legs against x/dex's own maths (scripts/fixtures/dex-deposits.json).
# Stubbed; no chain required.
#
#   npm run check:handles
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT
npx vite build --config scripts/vite.handles.config.js >/dev/null 2>&1
echo '{"type":"module"}' > build-check/package.json
node build-check/check-handles.js
