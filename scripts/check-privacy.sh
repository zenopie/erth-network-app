#!/usr/bin/env bash
#
# Runs the privacy-chain read layer (src/chain/{personhood,assembly,shielded,
# shieldedStaking,gov}.js) against stubbed LCD responses. No chain required.
#
#   npm run check:privacy
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT
npx vite build --config scripts/vite.privacy.config.js >/dev/null 2>&1
echo '{"type":"module"}' > build-check/package.json
node build-check/check-privacy.js
