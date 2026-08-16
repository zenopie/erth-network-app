#!/usr/bin/env bash
#
# Verifies the staking validator picker against a running chain.
#
#   VITE_EARTH_LCD=http://127.0.0.1:1317 npm run check:staking
#
# Needs a live LCD — bring one up with the chain repo's ./scripts/testnet-3val.sh
# so there is more than one validator to pick between.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"
trap 'rm -rf "$APP/build-check"' EXIT
npx vite build --config scripts/vite.staking.config.js >/dev/null
echo '{"type":"module"}' > build-check/package.json
node build-check/check-staking.js
