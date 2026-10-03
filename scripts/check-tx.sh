#!/usr/bin/env bash
#
# Runs broadcast()'s confirmation handling (src/chain/tx.js) against a stubbed
# Keplr and LCD: transient errors after sending are "status unknown", and a
# resubmission is refused until the hash resolves. No chain required.
#
#   npm run check:tx
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT
npx vite build --config scripts/vite.tx.config.js >/dev/null 2>&1
echo '{"type":"module"}' > build-check/package.json
node build-check/check-tx.js
