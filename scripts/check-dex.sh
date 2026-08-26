#!/usr/bin/env bash
#
# Verifies the dex chain layer (pools, APR inputs, the liquidity auction,
# escrowed withdrawals and POL schedules) against a running chain.
#
#   VITE_EARTH_LCD=https://lcd.erth.network npm run check:dex
#
# Defaults to the public LCD when VITE_EARTH_LCD is unset.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT
npx vite build --config scripts/vite.dex.config.js >/dev/null
echo '{"type":"module"}' > build-check/package.json
node build-check/check-dex.js
